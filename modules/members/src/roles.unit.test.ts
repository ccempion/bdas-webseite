import { describe, expect, it } from "vitest";

import type { Grant } from "./types";

import {
  canDecideJoinRequest,
  canEditGroupPage,
  canGrantLocalRoles,
  canManageGroup,
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
