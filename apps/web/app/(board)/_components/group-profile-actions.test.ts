/**
 * Authorization contract of the group-profile Server Action (#62). It is a
 * public endpoint, so it must be exactly as tight as the page that calls it:
 * federal board, or the group's own `local_board_lead`. A plain `local_board`
 * grant is not enough.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as MembersModule from "@bdas/members";
import type { Grant } from "@bdas/members";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("../../../lib/auth-cookie", () => ({ readSessionCookie: () => "token" }));

let grants: Grant[] | null = null;
vi.mock("@bdas/members", async () => {
  const actual = await vi.importActual<typeof MembersModule>("@bdas/members");
  return {
    ...actual,
    getCurrentMember: async () => (grants === null ? null : { grants }),
  };
});

const updateGroup = vi.fn(async (_db: unknown, _id: string, _input: unknown) => ({}));
vi.mock("@bdas/groups", () => ({
  getGroup: async (_db: unknown, id: string) =>
    id === "grp_gone" ? null : { id, status: id === "grp_archived" ? "archived" : "active" },
  updateGroup: (db: unknown, id: string, input: unknown) => updateGroup(db, id, input),
}));

import { updateGroupProfileAction } from "./group-profile-actions";

const g = (role: string, groupId: string | null): Grant => ({ role, groupId }) as Grant;

const INPUT = {
  name: "BDAS Aachen",
  city: "Aachen",
  contactEmail: "aachen@bdas.de",
  instagramUrl: null,
  websiteUrl: null,
  location: null,
  imageKey: "gruppen-aachen/banner.webp",
};

const save = (groupId = "grp_a") =>
  updateGroupProfileAction(groupId, INPUT, `/gruppe/aachen/profil`);

describe("updateGroupProfileAction", () => {
  beforeEach(() => {
    grants = null;
    updateGroup.mockClear();
  });

  it("rejects an anonymous caller", async () => {
    expect(await save()).toEqual({ ok: false, error: "Nicht angemeldet." });
    expect(updateGroup).not.toHaveBeenCalled();
  });

  it("rejects a plain local_board of the group", async () => {
    grants = [g("local_board", "grp_a")];
    expect((await save()).ok).toBe(false);
    expect(updateGroup).not.toHaveBeenCalled();
  });

  it("rejects a lead of a different group", async () => {
    grants = [g("local_board_lead", "grp_b")];
    expect((await save()).ok).toBe(false);
    expect(updateGroup).not.toHaveBeenCalled();
  });

  it("lets the group's own lead write every field", async () => {
    grants = [g("local_board_lead", "grp_a")];
    expect(await save()).toEqual({ ok: true });
    expect(updateGroup).toHaveBeenCalledWith({}, "grp_a", { ...INPUT, status: "active" });
  });

  it("lets the federal board write any group", async () => {
    grants = [g("federal_board", null)];
    expect((await save("grp_z")).ok).toBe(true);
  });

  it("refuses to edit an archived group", async () => {
    grants = [g("federal_board", null)];
    expect((await save("grp_archived")).ok).toBe(false);
    expect(updateGroup).not.toHaveBeenCalled();
  });

  it("reports an unknown group", async () => {
    grants = [g("federal_board", null)];
    expect(await save("grp_gone")).toEqual({ ok: false, error: "Gruppe nicht gefunden." });
  });
});
