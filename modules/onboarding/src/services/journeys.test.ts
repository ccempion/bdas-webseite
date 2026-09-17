import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, seedUser, setupOnboardingDb } from "../test-db";
import type { FlowEnv } from "../types";
import { getJourneyForUser, saveDetails, startJourney } from "./journeys";

const describeIfDb = (await dbReachable()) ? describe : describe.skip;

const ENV: FlowEnv = {
  groups: [{ id: "grp_ber", name: "BDAS Berlin", city: "Berlin" }],
  bdajGroupId: null,
  netzwerkGroupId: "grp_netz",
};
const NAME = { firstName: "Lea", lastName: "Yıldız" };
const STUDENT = { typ: "studiere", name: NAME, studienort: { kind: "group", groupId: "grp_ber" } };

describeIfDb("journeys", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupOnboardingDb();
    await seedUser(t, "usr_1");
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("stores the recomputed outcome, the city and a whitelisted source", async () => {
    const j = await startJourney(t.db, {
      userId: "usr_1",
      answers: STUDENT,
      entrySource: "kampagne:sommer",
      env: ENV,
    });
    expect(j).toMatchObject({
      userId: "usr_1",
      flowVersion: 1,
      outcome: "student",
      stadt: "Berlin",
      status: "details_offen",
      entrySource: "kampagne:sommer",
      applicationRef: null,
    });
    expect(await getJourneyForUser(t.db, "usr_1")).toEqual(j);
  });

  it("ignores an outcome the browser sent along", async () => {
    const j = await startJourney(t.db, {
      userId: "usr_1",
      answers: { ...STUDENT, outcome: "bdaj", studienort: { kind: "city", city: "Passau" } },
      entrySource: "direkt",
      env: ENV,
    });
    expect(j.outcome).toBe("student_ohne_gruppe");
    expect(j.stadt).toBe("Passau");
    expect(j.answers).not.toHaveProperty("outcome");
  });

  it("stores an unknown source as direkt", async () => {
    const j = await startJourney(t.db, {
      userId: "usr_1",
      answers: STUDENT,
      entrySource: "javascript:alert(1)",
      env: ENV,
    });
    expect(j.entrySource).toBe("direkt");
  });

  it("refuses answers that do not reach an outcome", async () => {
    await expect(
      startJourney(t.db, {
        userId: "usr_1",
        answers: { typ: "studiere" },
        entrySource: "",
        env: ENV,
      }),
    ).rejects.toThrow(/Fragen/);
  });

  it("refuses oversized answers", async () => {
    await expect(
      startJourney(t.db, {
        userId: "usr_1",
        answers: { ...STUDENT, junk: "x".repeat(20_000) },
        entrySource: "",
        env: ENV,
      }),
    ).rejects.toThrow(/groß/);
  });

  it("restarts an unsent journey instead of failing", async () => {
    await startJourney(t.db, { userId: "usr_1", answers: STUDENT, entrySource: "", env: ENV });
    const again = await startJourney(t.db, {
      userId: "usr_1",
      answers: { typ: "unterstuetzen", name: NAME },
      entrySource: "",
      env: ENV,
    });
    expect(again.outcome).toBe("foerderer");
    const rows = await t.client`SELECT count(*)::int AS n FROM onboarding_journeys`;
    expect(rows[0]?.["n"]).toBe(1);
  });

  it("does not restart a submitted journey", async () => {
    await startJourney(t.db, { userId: "usr_1", answers: STUDENT, entrySource: "", env: ENV });
    await t.client`UPDATE onboarding_journeys SET status = 'abgeschickt'`;
    await expect(
      startJourney(t.db, { userId: "usr_1", answers: STUDENT, entrySource: "", env: ENV }),
    ).rejects.toThrow(/abgeschickt/);
  });

  it("returns null without a journey", async () => {
    expect(await getJourneyForUser(t.db, "usr_1")).toBeNull();
  });

  describe("saveDetails", () => {
    it("stores a draft and bumps updated_at", async () => {
      const j = await startJourney(t.db, {
        userId: "usr_1",
        answers: STUDENT,
        entrySource: "",
        env: ENV,
      });
      const saved = await saveDetails(t.db, {
        userId: "usr_1",
        details: { studiengang: "Informatik" },
      });
      expect(saved.details).toEqual({ studiengang: "Informatik" });
      expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(j.updatedAt.getTime());
    });

    it("rejects non-objects and oversized drafts", async () => {
      await startJourney(t.db, { userId: "usr_1", answers: STUDENT, entrySource: "", env: ENV });
      await expect(saveDetails(t.db, { userId: "usr_1", details: ["x"] })).rejects.toThrow(
        /ungültig/,
      );
      await expect(
        saveDetails(t.db, { userId: "usr_1", details: { x: "y".repeat(20_000) } }),
      ).rejects.toThrow(/groß/);
    });

    it("fails without a journey and after submission", async () => {
      await expect(saveDetails(t.db, { userId: "usr_1", details: {} })).rejects.toThrow(
        /nicht gefunden/,
      );
      await startJourney(t.db, { userId: "usr_1", answers: STUDENT, entrySource: "", env: ENV });
      await t.client`UPDATE onboarding_journeys SET status = 'abgeschickt'`;
      await expect(saveDetails(t.db, { userId: "usr_1", details: {} })).rejects.toThrow(
        /abgeschickt/,
      );
    });
  });
});
