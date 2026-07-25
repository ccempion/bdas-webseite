import { describe, expect, it } from "vitest";

import { ForbiddenError, ValidationError } from "@bdas/errors";

import { canViewProfile, saveProfile } from "./services/profile";
import type { ProfileActor } from "./types";

const OWNER: ProfileActor = { userId: "usr_owner", grants: [{ role: "member", groupId: null }] };

const FIELDS = {
  studiengang: "Informatik",
  abschlussart: "bachelor",
  uni: "Universität zu Köln",
  geburtsdatum: "2000-05-01",
  gefundenDurch: "webseite",
};

describe("canViewProfile", () => {
  it("allows the owner", () => {
    expect(canViewProfile(OWNER, "usr_owner")).toBe(true);
  });
  it("allows any board role", () => {
    for (const role of ["federal_board", "local_board", "local_board_lead"]) {
      expect(
        canViewProfile({ userId: "usr_x", grants: [{ role, groupId: null }] }, "usr_owner"),
      ).toBe(true);
    }
  });
  it("denies a non-owner plain member", () => {
    expect(
      canViewProfile({ userId: "usr_x", grants: [{ role: "member", groupId: null }] }, "usr_owner"),
    ).toBe(false);
  });
});

describe("saveProfile guards (no DB reached)", () => {
  it("rejects a non-owner write with ForbiddenError", async () => {
    await expect(
      saveProfile({} as never, {
        userId: "usr_owner",
        fields: FIELDS,
        actor: { userId: "usr_other", grants: [{ role: "member", groupId: null }] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("rejects oversized input with ValidationError", async () => {
    await expect(
      saveProfile({} as never, {
        userId: "usr_owner",
        fields: { ...FIELDS, studiengang: "x".repeat(20000) },
        actor: OWNER,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
