import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, ValidationError } from "@bdas/errors";
import type { CurrentMember, Grant, Member } from "@bdas/members";

const acceptWithoutGroup = vi.fn();
let profileType: "student" | "alumnus" | null = null;
let currentMember: CurrentMember | null = null;
let target: Member | null = null;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("@bdas/auth", () => ({ deleteAccount: vi.fn(), getUserEmails: vi.fn() }));
vi.mock("@bdas/dashboard-shell", () => ({
  canSeeFederalScope: (grants: ReadonlyArray<Grant>) =>
    grants.some((g) => g.role === "federal_board"),
}));
vi.mock("@bdas/members", () => ({
  getCurrentMember: async () => currentMember,
  getMemberByUserId: async () => target,
  acceptWithoutGroup: (...a: unknown[]) => acceptWithoutGroup(...a),
}));
vi.mock("@bdas/profile", () => ({
  getProfile: async () => (profileType === null ? null : { nutzertyp: profileType }),
}));
vi.mock("../../../../lib/auth-cookie", () => ({ readSessionCookie: () => undefined }));
vi.mock("../../../../lib/newsletter-bootstrap", () => ({ bootNewsletter: () => {} }));
vi.mock("./deletable", () => ({ isDeletableApplicant: vi.fn() }));

import { acceptWithoutGroupAction } from "./actions";

const FED: Grant[] = [{ role: "federal_board", groupId: null }];

function viewer(grants: Grant[]): CurrentMember {
  return {
    user: { id: "usr_board", email: "b@x.org", status: "active", roles: [], sessionId: "s" },
    member: null,
    grants,
    primaryGroupKind: null,
    hasGroupScope: false,
    isBdasMember: false,
  };
}

function person(status: Member["status"]): Member {
  return {
    id: "mem_1",
    userId: "usr_1",
    firstName: "E",
    lastName: "Ehemalig",
    primaryGroupId: null,
    status,
    joinedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  acceptWithoutGroup.mockReset();
  currentMember = viewer(FED);
  target = person("pending");
  profileType = "alumnus";
});

describe("acceptWithoutGroupAction", () => {
  it("nimmt die Person zum Account als Bundesvorstand auf", async () => {
    await expect(acceptWithoutGroupAction("usr_1")).resolves.toEqual({ ok: true });
    expect(acceptWithoutGroup).toHaveBeenCalledWith(
      {},
      "mem_1",
      { userId: "usr_board", grants: FED },
      "alumnus",
    );
  });

  it("nimmt Studierende ohne Gruppe ohne Rolle auf", async () => {
    profileType = "student";
    await expect(acceptWithoutGroupAction("usr_1")).resolves.toEqual({ ok: true });
    expect(acceptWithoutGroup).toHaveBeenCalledWith(
      {},
      "mem_1",
      { userId: "usr_board", grants: FED },
      null,
    );
  });

  it("nimmt ohne Profil ohne Rolle auf", async () => {
    profileType = null;
    await expect(acceptWithoutGroupAction("usr_1")).resolves.toEqual({ ok: true });
    expect(acceptWithoutGroup.mock.calls[0]?.[3]).toBe(null);
  });

  it("verweigert allen außer dem Bundesvorstand", async () => {
    currentMember = viewer([{ role: "local_board_lead", groupId: "grp_a" }]);
    await expect(acceptWithoutGroupAction("usr_1")).resolves.toEqual({
      ok: false,
      error: "Keine Berechtigung.",
    });
    currentMember = null;
    await expect(acceptWithoutGroupAction("usr_1")).resolves.toMatchObject({ ok: false });
    expect(acceptWithoutGroup).not.toHaveBeenCalled();
  });

  it("meldet eine unbekannte oder bereits aufgenommene Person, ohne aufzunehmen", async () => {
    target = null;
    await expect(acceptWithoutGroupAction("usr_x")).resolves.toEqual({
      ok: false,
      error: "Person nicht gefunden.",
    });
    target = person("active");
    await expect(acceptWithoutGroupAction("usr_1")).resolves.toEqual({
      ok: false,
      error: "Diese Person ist bereits aufgenommen.",
    });
    expect(acceptWithoutGroup).not.toHaveBeenCalled();
  });

  it("gibt die Ablehnung des Service als Meldung zurück", async () => {
    acceptWithoutGroup.mockRejectedValueOnce(
      new ValidationError("Diese Person gehört einer Gruppe an."),
    );
    await expect(acceptWithoutGroupAction("usr_1")).resolves.toEqual({
      ok: false,
      error: "Diese Person gehört einer Gruppe an.",
    });
    acceptWithoutGroup.mockRejectedValueOnce(new ForbiddenError("Nein."));
    await expect(acceptWithoutGroupAction("usr_1")).resolves.toEqual({ ok: false, error: "Nein." });
  });

  it("lässt unerwartete Fehler durch", async () => {
    acceptWithoutGroup.mockRejectedValueOnce(new Error("db down"));
    await expect(acceptWithoutGroupAction("usr_1")).rejects.toThrow("db down");
  });
});
