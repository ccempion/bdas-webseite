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

  it("clears a stored key and reports that it did", async () => {
    await saveProfile(t.db, {
      userId: USER,
      fields: { ...FIELDS, photoStorageKey: "profile/usr/a.webp" },
      actor: OWNER,
    });

    await expect(clearProfilePhoto(t.db, { userId: USER, actor: OWNER })).resolves.toBe(true);
    expect((await getProfile(t.db, USER))?.photoStorageKey).toBeNull();
  });

  it("reports false when there is no profile row", async () => {
    await expect(clearProfilePhoto(t.db, { userId: USER, actor: OWNER })).resolves.toBe(false);
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
