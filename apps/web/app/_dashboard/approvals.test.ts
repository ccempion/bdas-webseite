import { beforeEach, describe, expect, it, vi } from "vitest";

const countPendingApprovals = vi.fn();
const countOpenReports = vi.fn();
const loadCurrentMember = vi.fn();
const isFlagOn = vi.fn();

vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/navigation", () => ({}));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("@bdas/feature-flags", () => ({ isFlagOn: (f: string) => isFlagOn(f) }));
vi.mock("@bdas/dashboard-shell", () => ({
  canAdministerBoard: (grants: ReadonlyArray<{ role: string }>) =>
    grants.some((g) => g.role.includes("board")),
}));
vi.mock("@bdas/members", () => ({
  countPendingApprovals: (...a: unknown[]) => countPendingApprovals(...a),
  isFederalBoard: (grants: ReadonlyArray<{ role: string }>) =>
    grants.some((g) => g.role === "federal_board"),
}));
vi.mock("@bdas/blog", () => ({
  countOpenReports: (...a: unknown[]) => countOpenReports(...a),
}));
vi.mock("./session", () => ({ loadCurrentMember: () => loadCurrentMember() }));

import { loadApprovalCounts } from "./approvals";

const meWith = (roles: string[]) => ({
  user: { id: "usr_1" },
  member: { id: "mem_1" },
  grants: roles.map((role) => ({ role, groupId: null })),
});

describe("loadApprovalCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFlagOn.mockReturnValue(true);
    countPendingApprovals.mockResolvedValue({ pendingMembers: 0, incomingGroupChanges: 0 });
    countOpenReports.mockResolvedValue(0);
  });

  it("fragt für einen Gast nichts ab", async () => {
    loadCurrentMember.mockResolvedValue(null);

    const out = await loadApprovalCounts();

    expect(out.total).toBe(0);
    expect(countPendingApprovals).not.toHaveBeenCalled();
    expect(countOpenReports).not.toHaveBeenCalled();
  });

  it("fragt für ein einfaches Mitglied nichts ab", async () => {
    loadCurrentMember.mockResolvedValue(meWith([]));

    const out = await loadApprovalCounts();

    expect(out.total).toBe(0);
    expect(countPendingApprovals).not.toHaveBeenCalled();
  });

  it("summiert alle drei Quellen für den Bundesvorstand", async () => {
    loadCurrentMember.mockResolvedValue(meWith(["federal_board"]));
    countPendingApprovals.mockResolvedValue({ pendingMembers: 2, incomingGroupChanges: 1 });
    countOpenReports.mockResolvedValue(3);

    const out = await loadApprovalCounts();

    expect(out).toEqual({
      pendingMembers: 2,
      incomingGroupChanges: 1,
      openReports: 3,
      total: 6,
    });
  });

  it("zählt Meldungen nicht für einen lokalen Vorstand", async () => {
    loadCurrentMember.mockResolvedValue(meWith(["local_board"]));
    countPendingApprovals.mockResolvedValue({ pendingMembers: 1, incomingGroupChanges: 0 });
    countOpenReports.mockResolvedValue(5);

    const out = await loadApprovalCounts();

    expect(out.openReports).toBe(0);
    expect(out.total).toBe(1);
    expect(countOpenReports).not.toHaveBeenCalled();
  });

  it("zählt Meldungen nicht bei ausgeschaltetem blog-Flag", async () => {
    loadCurrentMember.mockResolvedValue(meWith(["federal_board"]));
    isFlagOn.mockImplementation((f: string) => f !== "blog");
    countOpenReports.mockResolvedValue(5);

    const out = await loadApprovalCounts();

    expect(out.openReports).toBe(0);
    expect(countOpenReports).not.toHaveBeenCalled();
  });

  it("zählt Mitglieder nicht bei ausgeschaltetem members-Flag", async () => {
    loadCurrentMember.mockResolvedValue(meWith(["federal_board"]));
    isFlagOn.mockImplementation((f: string) => f !== "members");
    countPendingApprovals.mockResolvedValue({ pendingMembers: 4, incomingGroupChanges: 2 });

    const out = await loadApprovalCounts();

    expect(out.pendingMembers).toBe(0);
    expect(out.incomingGroupChanges).toBe(0);
    expect(countPendingApprovals).not.toHaveBeenCalled();
  });
});
