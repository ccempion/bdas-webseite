import { describe, expect, it } from "vitest";

import type { Grant, Member } from "./types";

import { isBdasMemberFrom } from "./services/me";

import {
  canDecideJoinRequest,
  canEditGroupPage,
  canGrantLocalRoles,
  canManageGroup,
  canTransition,
  effectiveGrants,
  isAnyLocalBoardLead,
  isRole,
} from "./roles";

const g = (role: string, groupId: string | null): Grant => ({ role, groupId }) as Grant;

describe("isRole", () => {
  it("local_board is no longer a valid role", () => {
    expect(isRole("local_board")).toBe(false);
  });

  it("file_manager and blogger are valid roles", () => {
    expect(isRole("file_manager")).toBe(true);
    expect(isRole("blogger")).toBe(true);
  });
});

describe("canManageGroup", () => {
  it("federal board manages every group", () => {
    expect(canManageGroup([g("federal_board", null)], "grp_a")).toBe(true);
  });

  it("local_board_lead manages its own group only", () => {
    expect(canManageGroup([g("local_board_lead", "grp_a")], "grp_a")).toBe(true);
    expect(canManageGroup([g("local_board_lead", "grp_b")], "grp_a")).toBe(false);
  });

  it("a plain member, file_manager, or blogger does not manage the group", () => {
    expect(canManageGroup([g("member", null)], "grp_a")).toBe(false);
    expect(canManageGroup([g("file_manager", "grp_a")], "grp_a")).toBe(false);
    expect(canManageGroup([g("blogger", "grp_a")], "grp_a")).toBe(false);
    expect(canManageGroup([], "grp_a")).toBe(false);
  });

  it("a null groupId is manageable only by federal board", () => {
    expect(canManageGroup([g("federal_board", null)], null)).toBe(true);
    expect(canManageGroup([g("local_board_lead", "grp_a")], null)).toBe(false);
  });
});

describe("isAnyLocalBoardLead", () => {
  it("true for a Lead of any group, regardless of which", () => {
    expect(isAnyLocalBoardLead([g("local_board_lead", "grp_a")])).toBe(true);
    expect(isAnyLocalBoardLead([g("local_board_lead", "grp_b")])).toBe(true);
  });

  it("false for federal board, a plain member, or no grants — this is Lead-only, unlike canManageGroup", () => {
    expect(isAnyLocalBoardLead([g("federal_board", null)])).toBe(false);
    expect(isAnyLocalBoardLead([g("member", null)])).toBe(false);
    expect(isAnyLocalBoardLead([])).toBe(false);
  });
});

describe("canGrantLocalRoles", () => {
  it("federal board grants in any group", () => {
    expect(canGrantLocalRoles([g("federal_board", null)], "grp_a")).toBe(true);
  });

  it("local_board_lead grants only within its own group", () => {
    expect(canGrantLocalRoles([g("local_board_lead", "grp_a")], "grp_a")).toBe(true);
    expect(canGrantLocalRoles([g("local_board_lead", "grp_b")], "grp_a")).toBe(false);
  });

  it("event_organizer, page_editor, file_manager, blogger cannot grant roles themselves", () => {
    expect(canGrantLocalRoles([g("event_organizer", "grp_a")], "grp_a")).toBe(false);
    expect(canGrantLocalRoles([g("page_editor", "grp_a")], "grp_a")).toBe(false);
    expect(canGrantLocalRoles([g("file_manager", "grp_a")], "grp_a")).toBe(false);
    expect(canGrantLocalRoles([g("blogger", "grp_a")], "grp_a")).toBe(false);
  });
});

describe("canEditGroupPage", () => {
  it("federal board edits every group page", () => {
    expect(canEditGroupPage([g("federal_board", null)], "grp_a")).toBe(true);
  });

  it("lead and page_editor edit their own group only", () => {
    expect(canEditGroupPage([g("local_board_lead", "grp_a")], "grp_a")).toBe(true);
    expect(canEditGroupPage([g("page_editor", "grp_a")], "grp_a")).toBe(true);
    expect(canEditGroupPage([g("local_board_lead", "grp_b")], "grp_a")).toBe(false);
    expect(canEditGroupPage([g("page_editor", "grp_b")], "grp_a")).toBe(false);
  });

  it("file_manager, blogger, and a plain member do not edit the group page", () => {
    expect(canEditGroupPage([g("file_manager", "grp_a")], "grp_a")).toBe(false);
    expect(canEditGroupPage([g("blogger", "grp_a")], "grp_a")).toBe(false);
    expect(canEditGroupPage([g("member", null)], "grp_a")).toBe(false);
    expect(canEditGroupPage([], "grp_a")).toBe(false);
  });
});

describe("canDecideJoinRequest", () => {
  it("local_board_lead of the group decides", () => {
    expect(canDecideJoinRequest([g("local_board_lead", "grp_a")], "grp_a", true)).toBe(true);
  });

  it("federal board is the fallback only when the group has no board seat", () => {
    expect(canDecideJoinRequest([g("federal_board", null)], "grp_a", false)).toBe(true);
    expect(canDecideJoinRequest([g("federal_board", null)], "grp_a", true)).toBe(false);
  });

  it("file_manager and blogger cannot decide join requests", () => {
    expect(canDecideJoinRequest([g("file_manager", "grp_a")], "grp_a", true)).toBe(false);
    expect(canDecideJoinRequest([g("blogger", "grp_a")], "grp_a", true)).toBe(false);
  });
});

describe("effectiveGrants", () => {
  it("leitet aus der Mitgliedschaft nur `member` ab, nie `alumnus` (ADR 0043)", () => {
    const grants = effectiveGrants([], [], true);
    expect(grants).toEqual([{ role: "member", groupId: null }]);
  });

  it("gibt einem Nicht-Mitglied gar keinen impliziten Grant", () => {
    expect(effectiveGrants([], [], false)).toEqual([]);
  });

  it("reicht einen alumnus-Grant aus der Datenbank samt Scope durch", () => {
    const grants = effectiveGrants([], [{ role: "alumnus", groupId: "grp_a" }], true);
    expect(grants).toEqual([
      { role: "alumnus", groupId: "grp_a" },
      { role: "member", groupId: null },
    ]);
  });
});

describe("isBdasMemberFrom (Spec 2026-09-16 §3.1)", () => {
  const active = { status: "active" } as Member;
  const pending = { status: "pending" } as Member;
  const alumnusGrant: Grant[] = [{ role: "alumnus", groupId: "grp_a" }];

  it("Hochschulgruppe genügt", () => {
    expect(isBdasMemberFrom(active, "hochschulgruppe", [])).toBe(true);
  });

  it("die Alumnus-Markierung genügt ohne Gruppe", () => {
    expect(isBdasMemberFrom(active, null, alumnusGrant)).toBe(true);
  });

  it("Förderer und Partnerorganisationen sind keine Mitglieder", () => {
    expect(isBdasMemberFrom(active, "netzwerk", [])).toBe(false);
    expect(isBdasMemberFrom(active, "affiliate", [])).toBe(false);
  });

  it("wer noch nicht aufgenommen ist, ist kein Mitglied", () => {
    expect(isBdasMemberFrom(pending, "hochschulgruppe", [])).toBe(false);
    expect(isBdasMemberFrom(pending, null, alumnusGrant)).toBe(false);
    expect(isBdasMemberFrom(null, null, [])).toBe(false);
  });
});

describe("canTransition", () => {
  it("kennt genau eine Kante: pending → active", () => {
    expect(canTransition("pending", "active")).toBe(true);
    expect(canTransition("active", "pending")).toBe(false);
  });
});
