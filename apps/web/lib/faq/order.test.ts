import { describe, expect, it } from "vitest";

import {
  highlightedVorstandSubgroups,
  orderSections,
  primarySection,
  type FaqGrant,
} from "./order";

const grant = (role: FaqGrant["role"], groupId: string | null = null): FaqGrant => ({
  role,
  groupId,
});

describe("primarySection", () => {
  it("federal board → bundesvorstand, even alongside a board role", () => {
    expect(primarySection([grant("federal_board")])).toBe("bundesvorstand");
    expect(primarySection([grant("local_board_lead", "g1"), grant("federal_board")])).toBe(
      "bundesvorstand",
    );
  });

  it("any local board sub-role → vorstand", () => {
    expect(primarySection([grant("local_board", "g1")])).toBe("vorstand");
    expect(primarySection([grant("local_board_lead", "g1")])).toBe("vorstand");
    expect(primarySection([grant("event_organizer", "g1")])).toBe("vorstand");
    expect(primarySection([grant("page_editor", "g1")])).toBe("vorstand");
  });

  it("plain member or empty grants → mitglieder", () => {
    expect(primarySection([grant("member")])).toBe("mitglieder");
    expect(primarySection([grant("alumnus")])).toBe("mitglieder");
    expect(primarySection([])).toBe("mitglieder");
  });
});

describe("orderSections", () => {
  const keys = (grants: FaqGrant[]) => orderSections(grants).map((s) => s.key);
  const openKeys = (grants: FaqGrant[]) =>
    orderSections(grants)
      .filter((s) => s.defaultOpen)
      .map((s) => s.key);

  it("always renders all four sections with allgemein last", () => {
    for (const g of [[grant("member")], [grant("federal_board")], [grant("local_board", "g1")]]) {
      expect(keys(g)).toHaveLength(4);
      expect(keys(g).at(-1)).toBe("allgemein");
      expect(new Set(keys(g))).toEqual(
        new Set(["allgemein", "bundesvorstand", "vorstand", "mitglieder"]),
      );
    }
  });

  it("puts the primary section first and open for federal board", () => {
    expect(keys([grant("federal_board")])[0]).toBe("bundesvorstand");
    expect(openKeys([grant("federal_board")])).toEqual(["bundesvorstand"]);
  });

  it("puts vorstand first and open for a board sub-role", () => {
    expect(keys([grant("event_organizer", "g1")])[0]).toBe("vorstand");
    expect(openKeys([grant("event_organizer", "g1")])).toEqual(["vorstand"]);
  });

  it("opens mitglieder AND allgemein for a plain member", () => {
    expect(keys([grant("member")])[0]).toBe("mitglieder");
    expect(openKeys([grant("member")])).toEqual(["mitglieder", "allgemein"]);
  });
});

describe("highlightedVorstandSubgroups", () => {
  it("returns the viewer's own board sub-role ids", () => {
    expect(highlightedVorstandSubgroups([grant("local_board_lead", "g1")])).toEqual(
      new Set(["local_board_lead"]),
    );
    expect(
      highlightedVorstandSubgroups([grant("event_organizer", "g1"), grant("page_editor", "g1")]),
    ).toEqual(new Set(["event_organizer", "page_editor"]));
  });

  it("is empty for non-board roles", () => {
    expect(highlightedVorstandSubgroups([grant("member")]).size).toBe(0);
    expect(highlightedVorstandSubgroups([grant("federal_board")]).size).toBe(0);
    expect(highlightedVorstandSubgroups([]).size).toBe(0);
  });
});
