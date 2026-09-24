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
      isBdasMember: true,
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
      isBdasMember: true,
    });

    expect(rows.map((r) => r.label)).toEqual(["Status", "Gruppe"]);
  });

  it("omits the group when the member has none", () => {
    const rows = buildIdentityRows({
      status: "active",
      groupName: null,
      joinedAt: null,
      kind: null,
      isBdasMember: true,
    });

    expect(rows.map((r) => r.label)).toEqual(["Status"]);
  });

  it('nennt einen Förderer-Account beim Namen, ohne Netzwerk-Gruppe und ohne „Mitglied seit"', () => {
    const rows = buildIdentityRows({
      status: "active",
      groupName: "BDAS Netzwerk",
      joinedAt: new Date("2025-03-14T00:00:00Z"),
      kind: "netzwerk",
      isBdasMember: false,
    });

    expect(rows).toEqual([
      { label: "Status", value: "Förderer*in" },
      { label: "Dabei seit", value: "14. März 2025" },
    ]);
  });
});

describe("buildIdentityRows für eine Partnerorganisation", () => {
  it('behält die Gruppenzeile, damit „BDAJ" sichtbar bleibt', () => {
    const rows = buildIdentityRows({
      status: "active",
      groupName: "BDAJ",
      joinedAt: null,
      kind: "affiliate",
      isBdasMember: false,
    });

    expect(rows).toEqual([
      { label: "Status", value: "BDAJ-Mitglied" },
      { label: "Gruppe", value: "BDAJ" },
    ]);
  });
});

describe("statusText", () => {
  it("nennt einen aufgenommenen Förderer-Account beim Namen", () => {
    expect(statusText("active", "netzwerk", false)).toBe("Förderer*in");
  });

  it("nennt einen aufgenommenen BDAJ-Account BDAJ-Mitglied (ADR 0047, Spec Glossar N9)", () => {
    expect(statusText("active", "affiliate", false)).toBe("BDAJ-Mitglied");
    expect(statusText("pending", "affiliate", false)).toBe("Bewerbung eingereicht");
  });

  it('nennt einen Aufgenommenen ohne Mitgliedschaft „Warten auf Beitritt"', () => {
    expect(statusText("active", null, false)).toBe("Warten auf Beitritt");
  });

  it("lässt Mitglieder und Bewerbungen unverändert", () => {
    expect(statusText("active", "hochschulgruppe", true)).toBe("Aktives Mitglied");
    expect(statusText("active", null, true)).toBe("Aktives Mitglied");
    expect(statusText("pending", null, false)).toBe("Bewerbung eingereicht");
    expect(statusText("pending", "netzwerk", false)).toBe("Bewerbung eingereicht");
    expect(statusText(null, null, false)).toBeNull();
  });
});

describe("buildIdentityRows ohne Mitgliedschaft", () => {
  it('zeigt „Warten auf Beitritt" und „Dabei seit"', () => {
    const rows = buildIdentityRows({
      status: "active",
      groupName: null,
      joinedAt: new Date("2025-03-14T00:00:00Z"),
      kind: null,
      isBdasMember: false,
    });

    expect(rows).toEqual([
      { label: "Status", value: "Warten auf Beitritt" },
      { label: "Dabei seit", value: "14. März 2025" },
    ]);
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
