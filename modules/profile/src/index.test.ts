import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus, type AnyEvent } from "@bdas/events";

import { getProfile, saveProfile } from "./services/profile";
import { dbReachable, seedAuthUser, setupProfileDb } from "./test-db";
import type { ProfileActor } from "./types";
import type { ProfileCompleted } from "./events";

const describeIfDb = (await dbReachable()) ? describe : describe.skip;

const OWNER: ProfileActor = { userId: "usr_owner", grants: [{ role: "member", groupId: null }] };
const OTHER: ProfileActor = { userId: "usr_other", grants: [{ role: "member", groupId: null }] };

const FIELDS = {
  studiengang: "Informatik",
  abschlussart: "bachelor",
  uni: "Universität zu Köln",
  geburtsdatum: "2000-05-01",
  gefundenDurch: "webseite",
};

function capture(): AnyEvent[] {
  const seen: AnyEvent[] = [];
  getEventBus().subscribe("profile.completed", async (e) => void seen.push(e));
  getEventBus().subscribe("profile.updated", async (e) => void seen.push(e));
  return seen;
}

describeIfDb("profile service", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupProfileDb();
    await seedAuthUser(t, OWNER.userId);
    resetEventBus();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("create → get roundtrip", async () => {
    await saveProfile(t.db, {
      userId: OWNER.userId,
      fields: FIELDS,
      actor: OWNER,
      groupId: "grp_1",
    });
    const p = await getProfile(t.db, OWNER.userId);
    expect(p?.studiengang).toBe("Informatik");
    expect(p?.completedAt).toBeInstanceOf(Date);
    expect(p?.updatedBy).toBe(OWNER.userId);
  });

  it("upsert overwrites and stamps completed_at only once", async () => {
    const seen = capture();
    const first = await saveProfile(t.db, {
      userId: OWNER.userId,
      fields: FIELDS,
      actor: OWNER,
      groupId: "grp_1",
    });
    const second = await saveProfile(t.db, {
      userId: OWNER.userId,
      fields: { ...FIELDS, studiengang: "Mathematik" },
      actor: OWNER,
    });
    expect(second.studiengang).toBe("Mathematik");
    expect(second.completedAt?.getTime()).toBe(first.completedAt?.getTime());
    expect(seen.map((e) => e.type)).toEqual(["profile.completed", "profile.updated"]);
    expect((seen[0] as ProfileCompleted).groupId).toBe("grp_1");
  });

  it("rejects a non-owner write", async () => {
    await expect(
      saveProfile(t.db, { userId: OWNER.userId, fields: FIELDS, actor: OTHER }),
    ).rejects.toThrow(/eigenes Profil/);
  });

  it("rejects an invalid enum", async () => {
    await expect(
      saveProfile(t.db, {
        userId: OWNER.userId,
        fields: { ...FIELDS, abschlussart: "nope" },
        actor: OWNER,
      }),
    ).rejects.toThrow(/ungültig/i);
  });

  // GDPR erasure (ADR 0008): the profile holds birth date, university, referral
  // and the private photo key. Deleting the identity must take all of it.
  it("erases the profile when the user is deleted", async () => {
    await saveProfile(t.db, {
      userId: OWNER.userId,
      fields: FIELDS,
      actor: OWNER,
      groupId: "grp_1",
    });
    expect(await getProfile(t.db, OWNER.userId)).not.toBeNull();

    await t.client`DELETE FROM auth_users WHERE id = ${OWNER.userId}`;

    expect(await getProfile(t.db, OWNER.userId)).toBeNull();
  });

  it("refuses a profile for an identity that does not exist", async () => {
    await expect(
      saveProfile(t.db, { userId: OTHER.userId, fields: FIELDS, actor: OTHER }),
    ).rejects.toThrow();
  });
});
