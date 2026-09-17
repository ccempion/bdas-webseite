import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus, type AnyEvent } from "@bdas/events";

import { loadFlowEnv } from "../env";
import { dbReachable, seedGroup, seedMember, seedUser, setupOnboardingDb } from "../test-db";
import type { Answers } from "../types";
import { completeJourney } from "./complete";
import { startJourney } from "./journeys";

const describeIfDb = (await dbReachable()) ? describe : describe.skip;

const NAME = { firstName: "Lea", lastName: "Yıldız" };
const ACTOR = { userId: "usr_1", grants: [] };

describeIfDb("completeJourney", () => {
  let t: TestDb;
  let seen: AnyEvent[];

  beforeEach(async () => {
    t = await setupOnboardingDb();
    resetEventBus();
    seen = [];
    getEventBus().subscribe("onboarding.completed", (e) => void seen.push(e));
    await seedGroup(t, { id: "grp_ber", slug: "berlin", kind: "hochschulgruppe" });
    await seedGroup(t, { id: "grp_netz", slug: "netzwerk", kind: "netzwerk" });
    await seedGroup(t, { id: "grp_bdaj", slug: "bdaj", kind: "affiliate" });
    await seedUser(t, "usr_1");
    await seedMember(t, { id: "mem_1", userId: "usr_1" });
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  async function start(answers: Answers): Promise<void> {
    await startJourney(t.db, {
      userId: "usr_1",
      answers,
      entrySource: "newsletter",
      env: await loadFlowEnv(t.db),
    });
  }

  async function complete() {
    return completeJourney(t.db, { memberId: "mem_1", actor: ACTOR, env: await loadFlowEnv(t.db) });
  }

  async function openRequests() {
    return t.client`
      SELECT id, to_group_id FROM member_group_change_requests
      WHERE member_id = 'mem_1' AND status = 'pending'`;
  }

  it.each([
    [
      "student",
      { typ: "studiere", name: NAME, studienort: { kind: "group", groupId: "grp_ber" } },
      "grp_ber",
    ],
    [
      "student_ohne_gruppe",
      { typ: "studiere", name: NAME, studienort: { kind: "city", city: "Passau" } },
      "grp_netz",
    ],
    ["foerderer", { typ: "unterstuetzen", name: NAME }, "grp_netz"],
    ["bdaj", { typ: "bdaj", name: NAME }, "grp_bdaj"],
  ] as const)(
    "%s opens exactly one request to the right group",
    async (outcome, answers, groupId) => {
      await start(answers);
      const result = await complete();

      const open = await openRequests();
      expect(open).toHaveLength(1);
      expect(open[0]?.["to_group_id"]).toBe(groupId);
      expect(result.kind).toBe("submitted");
      expect(result.journey).toMatchObject({
        outcome,
        status: "abgeschickt",
        applicationRef: open[0]?.["id"],
      });
      expect(seen).toEqual([
        expect.objectContaining({
          type: "onboarding.completed",
          memberId: "mem_1",
          outcome,
          entrySource: "newsletter",
        }),
      ]);
    },
  );

  it("files no request for an alumnus and leaves the member pending without a group", async () => {
    await start({ typ: "studiert", name: NAME, aktiv_wo: { kind: "skipped" } });
    const result = await complete();

    expect(await openRequests()).toHaveLength(0);
    expect(result.journey).toMatchObject({
      outcome: "alumnus",
      status: "abgeschickt",
      applicationRef: null,
    });
    const [m] = await t.client`SELECT status, primary_group_id FROM members WHERE id = 'mem_1'`;
    expect(m).toEqual({ status: "pending", primary_group_id: null });
  });

  it("is idempotent: a second submit opens no second request and emits nothing", async () => {
    await start({ typ: "studiere", name: NAME, studienort: { kind: "group", groupId: "grp_ber" } });
    const first = await complete();
    const second = await complete();

    expect(await openRequests()).toHaveLength(1);
    expect(second).toEqual(first);
    expect(seen).toHaveLength(1);
  });

  it("recovers when the request exists but the journey was not yet marked", async () => {
    await start({ typ: "studiere", name: NAME, studienort: { kind: "group", groupId: "grp_ber" } });
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id, status)
      VALUES ('mgc_frueher', 'mem_1', NULL, 'grp_ber', 'pending')`;

    const result = await complete();
    expect(await openRequests()).toHaveLength(1);
    expect(result.journey.applicationRef).toBe("mgc_frueher");
  });

  it("falls back to netzwerk when the chosen group was archived meanwhile", async () => {
    await start({ typ: "studiere", name: NAME, studienort: { kind: "group", groupId: "grp_ber" } });
    await t.client`UPDATE groups SET status = 'archived' WHERE id = 'grp_ber'`;

    const result = await complete();
    expect(result.journey.outcome).toBe("student_ohne_gruppe");
    expect((await openRequests())[0]?.["to_group_id"]).toBe("grp_netz");
  });

  it("waits instead of applying when the bdaj row does not exist", async () => {
    await start({ typ: "bdaj", name: NAME });
    await t.client`DELETE FROM groups WHERE id = 'grp_bdaj'`;

    const result = await complete();
    expect(result.kind).toBe("waiting");
    expect(result.journey).toMatchObject({ outcome: "bdaj", status: "details_offen" });
    expect(await openRequests()).toHaveLength(0);
    expect(seen).toHaveLength(0);
  });

  it("never files to a group id the server does not list", async () => {
    // A forged answer naming the affiliate row as the student's own group.
    await start({
      typ: "studiere",
      name: NAME,
      studienort: { kind: "group", groupId: "grp_bdaj" },
    });
    await complete();
    expect((await openRequests())[0]?.["to_group_id"]).toBe("grp_netz");
  });

  it("refuses a member that belongs to someone else", async () => {
    await seedUser(t, "usr_2");
    await seedMember(t, { id: "mem_2", userId: "usr_2" });
    await start({ typ: "unterstuetzen", name: NAME });

    await expect(
      completeJourney(t.db, { memberId: "mem_2", actor: ACTOR, env: await loadFlowEnv(t.db) }),
    ).rejects.toThrow(/eigene/);
    expect(await openRequests()).toHaveLength(0);
  });

  it("fails without a journey", async () => {
    await expect(complete()).rejects.toThrow(/nicht gefunden/);
  });

  it("surfaces a conflicting open application elsewhere", async () => {
    await seedGroup(t, { id: "grp_koe", slug: "koeln", kind: "hochschulgruppe" });
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id, status)
      VALUES ('mgc_koeln', 'mem_1', NULL, 'grp_koe', 'pending')`;
    await start({ typ: "studiere", name: NAME, studienort: { kind: "group", groupId: "grp_ber" } });

    await expect(complete()).rejects.toThrow(/offene Bewerbung/);
    const [j] = await t.client`SELECT status FROM onboarding_journeys`;
    expect(j?.["status"]).toBe("details_offen");
  });
});
