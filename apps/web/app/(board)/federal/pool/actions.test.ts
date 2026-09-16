import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, ValidationError } from "@bdas/errors";
import type { CurrentMember, Grant, Member } from "@bdas/members";

const acceptAsAlumnus = vi.fn();
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
  acceptAsAlumnus: (...a: unknown[]) => acceptAsAlumnus(...a),
}));
vi.mock("../../../../lib/auth-cookie", () => ({ readSessionCookie: () => undefined }));
vi.mock("../../../../lib/newsletter-bootstrap", () => ({ bootNewsletter: () => {} }));
vi.mock("./deletable", () => ({ isDeletableApplicant: vi.fn() }));

import { acceptAsAlumnusAction } from "./actions";

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
  acceptAsAlumnus.mockReset();
  currentMember = viewer(FED);
  target = person("pending");
});

describe("acceptAsAlumnusAction", () => {
  it("nimmt die Person zum Account als Bundesvorstand auf", async () => {
    await expect(acceptAsAlumnusAction("usr_1")).resolves.toEqual({ ok: true });
    expect(acceptAsAlumnus).toHaveBeenCalledWith({}, "mem_1", {
      userId: "usr_board",
      grants: FED,
    });
  });

  it("verweigert allen außer dem Bundesvorstand", async () => {
    currentMember = viewer([{ role: "local_board_lead", groupId: "grp_a" }]);
    await expect(acceptAsAlumnusAction("usr_1")).resolves.toEqual({
      ok: false,
      error: "Keine Berechtigung.",
    });
    currentMember = null;
    await expect(acceptAsAlumnusAction("usr_1")).resolves.toMatchObject({ ok: false });
    expect(acceptAsAlumnus).not.toHaveBeenCalled();
  });

  it("meldet eine unbekannte oder bereits aufgenommene Person, ohne aufzunehmen", async () => {
    target = null;
    await expect(acceptAsAlumnusAction("usr_x")).resolves.toEqual({
      ok: false,
      error: "Person nicht gefunden.",
    });
    target = person("active");
    await expect(acceptAsAlumnusAction("usr_1")).resolves.toEqual({
      ok: false,
      error: "Diese Person ist bereits aufgenommen.",
    });
    expect(acceptAsAlumnus).not.toHaveBeenCalled();
  });

  it("gibt die Ablehnung des Service als Meldung zurück", async () => {
    acceptAsAlumnus.mockRejectedValueOnce(
      new ValidationError("Diese Person gehört einer Gruppe an."),
    );
    await expect(acceptAsAlumnusAction("usr_1")).resolves.toEqual({
      ok: false,
      error: "Diese Person gehört einer Gruppe an.",
    });
    acceptAsAlumnus.mockRejectedValueOnce(new ForbiddenError("Nein."));
    await expect(acceptAsAlumnusAction("usr_1")).resolves.toEqual({ ok: false, error: "Nein." });
  });

  it("lässt unerwartete Fehler durch", async () => {
    acceptAsAlumnus.mockRejectedValueOnce(new Error("db down"));
    await expect(acceptAsAlumnusAction("usr_1")).rejects.toThrow("db down");
  });
});
