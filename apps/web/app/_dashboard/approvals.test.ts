import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Grant } from "@bdas/members";

const countPendingApprovals = vi.fn();
const countPendingApplicationsByGroup = vi.fn();
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
  countPendingApplicationsByGroup: (...a: unknown[]) => countPendingApplicationsByGroup(...a),
  isFederalBoard: (grants: ReadonlyArray<{ role: string }>) =>
    grants.some((g) => g.role === "federal_board"),
}));
vi.mock("@bdas/blog", () => ({
  countOpenReports: (...a: unknown[]) => countOpenReports(...a),
}));
vi.mock("./session", () => ({ loadCurrentMember: () => loadCurrentMember() }));

import { loadApprovalCounts, loadSidebarBadgeCounts } from "./approvals";

const meWith = (roles: string[]) => ({
  user: { id: "usr_1" },
  member: { id: "mem_1" },
  grants: roles.map((role) => ({ role, groupId: null })),
});

describe("loadApprovalCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFlagOn.mockReturnValue(true);
    countPendingApprovals.mockResolvedValue({ applications: 0, groupTransfers: 0 });
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
    countPendingApprovals.mockResolvedValue({ applications: 2, groupTransfers: 1 });
    countOpenReports.mockResolvedValue(3);

    const out = await loadApprovalCounts();

    expect(out).toEqual({
      applications: 2,
      groupTransfers: 1,
      openReports: 3,
      total: 6,
    });
  });

  it("zählt Meldungen nicht für einen lokalen Vorstand", async () => {
    loadCurrentMember.mockResolvedValue(meWith(["local_board"]));
    countPendingApprovals.mockResolvedValue({ applications: 1, groupTransfers: 0 });
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
    countPendingApprovals.mockResolvedValue({ applications: 4, groupTransfers: 2 });

    const out = await loadApprovalCounts();

    expect(out.applications).toBe(0);
    expect(out.groupTransfers).toBe(0);
    expect(countPendingApprovals).not.toHaveBeenCalled();
  });
});

describe("loadSidebarBadgeCounts", () => {
  const federalScope = { kind: "federal" as const };
  const groupScope = (groupId: string) => ({
    kind: "group" as const,
    groupId,
    slug: groupId,
    name: groupId,
  });
  const actorWith = (roles: string[]) => ({
    userId: "usr_1",
    grants: roles.map((role) => ({ role, groupId: null })) as ReadonlyArray<Grant>,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    isFlagOn.mockReturnValue(true);
  });

  it("gibt Nullen bei ausgeschaltetem members-Flag, ohne Abfragen", async () => {
    isFlagOn.mockReturnValue(false);

    const out = await loadSidebarBadgeCounts(actorWith(["federal_board"]), [
      federalScope,
      groupScope("grp_a"),
    ]);

    expect(out.federal).toBe(0);
    expect(out.byGroupId.size).toBe(0);
    expect(countPendingApprovals).not.toHaveBeenCalled();
    expect(countPendingApplicationsByGroup).not.toHaveBeenCalled();
  });

  it("fragt für einen lokalen Vorstand nur die Gruppen-Aufschlüsselung ab", async () => {
    countPendingApplicationsByGroup.mockResolvedValue(new Map([["grp_a", 3]]));

    const out = await loadSidebarBadgeCounts(actorWith(["local_board"]), [groupScope("grp_a")]);

    expect(out.federal).toBe(0);
    expect(out.byGroupId.get("grp_a")).toBe(3);
    expect(countPendingApprovals).not.toHaveBeenCalled();
    expect(countPendingApplicationsByGroup).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ["grp_a"],
    );
  });

  it("füllt für den Bundesvorstand beide Zahlen", async () => {
    countPendingApprovals.mockResolvedValue({ applications: 5, groupTransfers: 1 });
    countPendingApplicationsByGroup.mockResolvedValue(new Map([["grp_a", 2]]));

    const out = await loadSidebarBadgeCounts(actorWith(["federal_board"]), [
      federalScope,
      groupScope("grp_a"),
    ]);

    expect(out.federal).toBe(5);
    expect(out.byGroupId.get("grp_a")).toBe(2);
  });

  it("lässt die Gruppen-Abfrage aus, wenn keine Gruppen-Scopes vorliegen", async () => {
    countPendingApprovals.mockResolvedValue({ applications: 1, groupTransfers: 0 });

    const out = await loadSidebarBadgeCounts(actorWith(["federal_board"]), [federalScope]);

    expect(out.byGroupId.size).toBe(0);
    expect(countPendingApplicationsByGroup).not.toHaveBeenCalled();
  });
});
