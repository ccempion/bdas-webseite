import { describe, expect, it } from "vitest";

import { buildIdentityRows, layoutMode, roleChips } from "./view-model";

describe("layoutMode", () => {
  it("gives an active member the full two-column page", () => {
    expect(layoutMode("active")).toBe("full");
  });

  it("gives every other status the plain single column", () => {
    expect(layoutMode("pending")).toBe("plain");
    expect(layoutMode("inactive")).toBe("plain");
    expect(layoutMode("alumnus")).toBe("plain");
  });

  it("gives a user without a member row the plain single column", () => {
    expect(layoutMode(null)).toBe("plain");
  });
});

describe("buildIdentityRows", () => {
  it("renders status, group and joined date", () => {
    const rows = buildIdentityRows({
      status: "active",
      groupName: "BDAS Berlin",
      joinedAt: new Date("2025-03-14T00:00:00Z"),
    });

    expect(rows).toEqual([
      { label: "Status", value: "Aktives Mitglied" },
      { label: "Gruppe", value: "BDAS Berlin" },
      { label: "Mitglied seit", value: "14. März 2025" },
    ]);
  });

  it("omits the joined date when it is unknown", () => {
    const rows = buildIdentityRows({
      status: "active",
      groupName: "BDAS Berlin",
      joinedAt: null,
    });

    expect(rows.map((r) => r.label)).toEqual(["Status", "Gruppe"]);
  });

  it("omits the group when the member has none", () => {
    const rows = buildIdentityRows({ status: "active", groupName: null, joinedAt: null });

    expect(rows.map((r) => r.label)).toEqual(["Status"]);
  });
});

describe("roleChips", () => {
  it("drops the implicit member grant", () => {
    expect(roleChips([{ role: "member", groupId: null }])).toEqual([]);
  });

  it("accents the organizer role and nothing else", () => {
    const chips = roleChips([
      { role: "member", groupId: null },
      { role: "event_organizer", groupId: "grp_berlin" },
      { role: "local_board", groupId: "grp_berlin" },
    ]);

    expect(chips).toEqual([
      { label: "Organisator", accent: true },
      { label: "Vorstand", accent: false },
    ]);
  });

  it("deduplicates a role held in two groups", () => {
    const chips = roleChips([
      { role: "event_organizer", groupId: "grp_berlin" },
      { role: "event_organizer", groupId: "grp_potsdam" },
    ]);

    expect(chips).toEqual([{ label: "Organisator", accent: true }]);
  });
});
