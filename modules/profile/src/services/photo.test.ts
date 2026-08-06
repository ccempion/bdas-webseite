import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { ForbiddenError } from "@bdas/errors";

import { dbReachable, seedAuthUser, setupProfileDb } from "../test-db";
import type { ProfileActor } from "../types";
import { clearProfilePhoto, getProfile, saveProfile } from "./profile";

const USER = "usr_photo_owner";
const OWNER: ProfileActor = { userId: USER, grants: [{ role: "member", groupId: null }] };

const FIELDS = {
  studiengang: "Informatik",
  abschlussart: "bachelor",
  uni: "Universität zu Köln",
  geburtsdatum: "2000-05-01",
  gefundenDurch: "webseite",
};

describe("clearProfilePhoto guards (no DB reached)", () => {
  it("rejects clearing someone else's photo", async () => {
    await expect(
      clearProfilePhoto({} as never, {
        userId: "usr_other",
        actor: OWNER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

const describeIfDb = (await dbReachable()) ? describe : describe.skip;

describeIfDb("clearProfilePhoto", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupProfileDb();
    await seedAuthUser(t, USER);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  /** The caller deletes the object, so the key it must delete has to come back
   *  out — clearing the column is only half the job. */
  it("clears a stored key and hands it back for deletion", async () => {
    await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, photoStorageKey: "profile/usr/a.webp" },
      actor: OWNER,
    });

    await expect(clearProfilePhoto(t.db, { userId: USER, actor: OWNER })).resolves.toEqual({
      cleared: true,
      previousStorageKey: "profile/usr/a.webp",
    });
    expect((await getProfile(t.db, USER))?.photoStorageKey).toBeNull();
  });

  it("reports not-cleared when there is no profile row", async () => {
    await expect(clearProfilePhoto(t.db, { userId: USER, actor: OWNER })).resolves.toEqual({
      cleared: false,
      previousStorageKey: null,
    });
  });

  it("clears a row that never had a photo, with no key to delete", async () => {
    await saveProfile(t.db, { userId: USER, fields: FIELDS, actor: OWNER });

    await expect(clearProfilePhoto(t.db, { userId: USER, actor: OWNER })).resolves.toEqual({
      cleared: true,
      previousStorageKey: null,
    });
  });

  it("leaves the rest of the profile untouched", async () => {
    await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, photoStorageKey: "profile/usr/a.webp" },
      actor: OWNER,
    });
    const before = await getProfile(t.db, USER);

    await clearProfilePhoto(t.db, { userId: USER, actor: OWNER });
    const after = await getProfile(t.db, USER);

    expect(after).toMatchObject({
      studiengang: before?.studiengang,
      abschlussart: before?.abschlussart,
      uni: before?.uni,
      geburtsdatum: before?.geburtsdatum,
      gefundenDurch: before?.gefundenDurch,
      completedAt: before?.completedAt,
    });
  });

  it("reports the key a replacement superseded, so the caller can delete it", async () => {
    await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, photoStorageKey: "profile/usr/old.webp" },
      actor: OWNER,
    });

    const out = await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, photoStorageKey: "profile/usr/new.webp" },
      actor: OWNER,
    });

    expect(out.supersededPhotoStorageKey).toBe("profile/usr/old.webp");
    expect(out.profile.photoStorageKey).toBe("profile/usr/new.webp");
  });

  /** Every profile edit that leaves the photo alone re-submits the same key.
   *  Treating that as a replacement would delete the photo still in use. */
  it("supersedes nothing when the same key is re-submitted", async () => {
    await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, photoStorageKey: "profile/usr/a.webp" },
      actor: OWNER,
    });

    const out = await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, studiengang: "Mathematik", photoStorageKey: "profile/usr/a.webp" },
      actor: OWNER,
    });

    expect(out.supersededPhotoStorageKey).toBeNull();
  });

  /** A form that carries no photo key keeps the stored one, so there is
   *  nothing superseded — the object is still referenced. */
  it("supersedes nothing when the submit omits the photo", async () => {
    await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, photoStorageKey: "profile/usr/a.webp" },
      actor: OWNER,
    });

    const out = await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, photoStorageKey: null },
      actor: OWNER,
    });

    expect(out.supersededPhotoStorageKey).toBeNull();
    expect(out.profile.photoStorageKey).toBe("profile/usr/a.webp");
  });

  it("supersedes nothing on a first photo", async () => {
    const out = await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, photoStorageKey: "profile/usr/first.webp" },
      actor: OWNER,
    });

    expect(out.supersededPhotoStorageKey).toBeNull();
  });

  /** The regression this whole service exists to avoid: the account and wizard
   *  forms submit a null photo key to mean "unchanged", never "delete". */
  it("is not what a null photoStorageKey in saveProfile does", async () => {
    await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, photoStorageKey: "profile/usr/a.webp" },
      actor: OWNER,
    });

    await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, photoStorageKey: null },
      actor: OWNER,
    });

    expect((await getProfile(t.db, USER))?.photoStorageKey).toBe("profile/usr/a.webp");
  });
});
