import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus, type AnyEvent } from "@bdas/events";

import { getProfile, saveProfile, setProfilePhoto } from "./services/profile";
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
    expect(second.profile.studiengang).toBe("Mathematik");
    expect(second.profile.completedAt?.getTime()).toBe(first.profile.completedAt?.getTime());
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

  it("round-trips an optional vorstellung and stores a blank one as null", async () => {
    // Optional for every channel (#122): saving without it must succeed, and a
    // whitespace-only answer must not become an empty string the board has to
    // tell apart from "said nothing".
    await saveProfile(t.db, {
      userId: OWNER.userId,
      fields: { ...FIELDS, gefundenDurch: "instagram", vorstellung: "  " },
      actor: OWNER,
    });
    expect((await getProfile(t.db, OWNER.userId))?.vorstellung).toBeNull();

    await saveProfile(t.db, {
      userId: OWNER.userId,
      fields: {
        ...FIELDS,
        gefundenDurch: "instagram",
        vorstellung: "  Ich will mich engagieren.  ",
      },
      actor: OWNER,
    });
    expect((await getProfile(t.db, OWNER.userId))?.vorstellung).toBe("Ich will mich engagieren.");

    // And it survives an edit that omits the field entirely being re-sent.
    await saveProfile(t.db, {
      userId: OWNER.userId,
      fields: { ...FIELDS, gefundenDurch: "instagram" },
      actor: OWNER,
    });
    expect((await getProfile(t.db, OWNER.userId))?.vorstellung).toBeNull();
  });

  describe("user types", () => {
    const actor = OWNER;
    const save = (fields: Record<string, unknown>) =>
      saveProfile(t.db, { userId: OWNER.userId, fields, actor });

    it("stores a student by default, as the /account form sends no type", async () => {
      const { profile } = await save(FIELDS);
      expect(profile.nutzertyp).toBe("student");
    });

    it("stores an alumnus without degree and birth date", async () => {
      const { profile } = await save({
        nutzertyp: "alumnus",
        studiengang: "Jura",
        studienfachKategorie: "Rechts- und Verwaltungswissenschaften",
        uni: "Universität zu Köln",
        gefundenDurch: "instagram",
        abschlussart: "bachelor",
      });
      expect(profile).toMatchObject({
        nutzertyp: "alumnus",
        studiengang: "Jura",
        studienfachKategorie: "Rechts- und Verwaltungswissenschaften",
        abschlussart: null,
        geburtsdatum: null,
      });
    });

    it("stores a supporter and a bdaj official", async () => {
      const f = await save({
        nutzertyp: "foerderer",
        interesse: "Kultur",
        gefundenDurch: "webseite",
      });
      expect(f.profile).toMatchObject({ nutzertyp: "foerderer", interesse: "Kultur", uni: null });

      const b = await save({
        nutzertyp: "bdaj",
        bdajFunktion: "mitglied",
        gefundenDurch: "webseite",
      });
      expect(b.profile).toMatchObject({
        nutzertyp: "bdaj",
        bdajFunktion: "mitglied",
        interesse: null,
      });
    });

    it("keeps the stored type when the form omits it", async () => {
      await save({
        nutzertyp: "alumnus",
        studiengang: "Jura",
        uni: "Universität zu Köln",
        gefundenDurch: "instagram",
      });
      const { profile } = await save({
        studiengang: "Rechtswissenschaft",
        uni: "Universität zu Köln",
        gefundenDurch: "instagram",
      });
      expect(profile).toMatchObject({ nutzertyp: "alumnus", studiengang: "Rechtswissenschaft" });
    });

    it("keeps the stored category when the form omits it", async () => {
      await save({ ...FIELDS, studienfachKategorie: "Ingenieurwissenschaften" });
      const { profile } = await save({ ...FIELDS, studiengang: "Maschinenbau" });
      expect(profile.studienfachKategorie).toBe("Ingenieurwissenschaften");
    });

    it("rejects an unknown type and fields that do not fit the type", async () => {
      await expect(save({ ...FIELDS, nutzertyp: "gast" })).rejects.toThrow(/Nutzertyp/);
      await expect(save({ nutzertyp: "foerderer", gefundenDurch: "webseite" })).rejects.toThrow(
        /ungültig/,
      );
    });
  });

  describe("setProfilePhoto", () => {
    it("sets the key for any type and reports the one it replaced", async () => {
      await saveProfile(t.db, {
        userId: OWNER.userId,
        fields: { nutzertyp: "foerderer", interesse: "Kultur", gefundenDurch: "webseite" },
        actor: OWNER,
      });
      const first = await setProfilePhoto(t.db, {
        userId: OWNER.userId,
        actor: OWNER,
        photoStorageKey: "profiles/a.jpg",
      });
      expect(first).toEqual({ updated: true, supersededPhotoStorageKey: null });

      const second = await setProfilePhoto(t.db, {
        userId: OWNER.userId,
        actor: OWNER,
        photoStorageKey: "profiles/b.jpg",
      });
      expect(second).toEqual({ updated: true, supersededPhotoStorageKey: "profiles/a.jpg" });
      expect((await getProfile(t.db, OWNER.userId))?.photoStorageKey).toBe("profiles/b.jpg");
    });

    it("does nothing without a profile and refuses other owners", async () => {
      expect(
        await setProfilePhoto(t.db, { userId: OWNER.userId, actor: OWNER, photoStorageKey: "k" }),
      ).toEqual({ updated: false, supersededPhotoStorageKey: null });
      await expect(
        setProfilePhoto(t.db, { userId: OWNER.userId, actor: OTHER, photoStorageKey: "k" }),
      ).rejects.toThrow(/eigenes Profil/);
    });
  });
});
