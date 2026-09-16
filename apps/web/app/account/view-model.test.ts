import { describe, expect, it } from "vitest";

import { buildIdentityRows, layoutMode, roleChips, statusText } from "./view-model";

describe("layoutMode", () => {
  it("gives an active member the full two-column page", () => {
    expect(layoutMode("active")).toBe("full");
  });

  it("gives every other status the plain single column", () => {
    expect(layoutMode("pending")).toBe("plain");
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
      kind: "hochschulgruppe",
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
      kind: "hochschulgruppe",
    });

    expect(rows.map((r) => r.label)).toEqual(["Status", "Gruppe"]);
  });

  it("omits the group when the member has none", () => {
    const rows = buildIdentityRows({
      status: "active",
      groupName: null,
      joinedAt: null,
      kind: null,
    });

    expect(rows.map((r) => r.label)).toEqual(["Status"]);
  });

  it('nennt einen Förderer-Account beim Namen, ohne Netzwerk-Gruppe und ohne „Mitglied seit"', () => {
    const rows = buildIdentityRows({
      status: "active",
      groupName: "BDAS Netzwerk",
      joinedAt: new Date("2025-03-14T00:00:00Z"),
      kind: "netzwerk",
    });

    expect(rows).toEqual([
      { label: "Status", value: "Förderer:in" },
      { label: "Dabei seit", value: "14. März 2025" },
    ]);
  });
});

describe("statusText", () => {
  it("nennt einen aufgenommenen Förderer-Account beim Namen", () => {
    expect(statusText("active", "netzwerk")).toBe("Förderer:in");
  });

  it("lässt Mitglieder und Bewerbungen unverändert", () => {
    expect(statusText("active", "hochschulgruppe")).toBe("Aktives Mitglied");
    expect(statusText("active", null)).toBe("Aktives Mitglied");
    expect(statusText("pending", null)).toBe("Bewerbung eingereicht");
    expect(statusText("pending", "netzwerk")).toBe("Bewerbung eingereicht");
    expect(statusText(null, null)).toBeNull();
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
      { role: "local_board_lead", groupId: "grp_berlin" },
    ]);

    expect(chips).toEqual([
      { label: "Event-Manager", accent: true },
      { label: "Lead", accent: false },
    ]);
  });

  it("deduplicates a role held in two groups", () => {
    const chips = roleChips([
      { role: "event_organizer", groupId: "grp_berlin" },
      { role: "event_organizer", groupId: "grp_potsdam" },
    ]);

    expect(chips).toEqual([{ label: "Event-Manager", accent: true }]);
  });

  it("zeigt den Alumnus-Grant als Chip (ADR 0043)", () => {
    const chips = roleChips([{ role: "alumnus", groupId: "grp_a" }]);
    expect(chips.map((c) => c.label)).toEqual(["Alumnus"]);
  });

  it("zeigt den impliziten member-Grant weiterhin nicht", () => {
    expect(roleChips([{ role: "member", groupId: null }])).toEqual([]);
  });
});
