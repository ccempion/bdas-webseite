import { describe, expect, it } from "vitest";

import type { FaqEntryView, FaqSectionView } from "./assemble";
import { entriesForContext, flattenSections, pickByIds, popularFrom, searchEntries } from "./help";

function entry(id: string, over: Partial<FaqEntryView> = {}): FaqEntryView {
  return {
    id,
    question: `Frage ${id}`,
    body: { type: "doc", content: [] },
    searchText: `frage ${id}`,
    topic: null,
    youtubeId: null,
    updatedAtIso: "2026-09-01T00:00:00.000Z",
    relatedIds: [],
    contexts: [],
    ...over,
  };
}

function section(
  key: FaqSectionView["key"],
  entries: FaqEntryView[],
  subEntries: FaqEntryView[] = [],
): FaqSectionView {
  return {
    key,
    title: key,
    intro: null,
    entries,
    subgroups:
      subEntries.length > 0
        ? [{ id: "local_board", title: "Vorstand", highlighted: false, entries: subEntries }]
        : [],
  };
}

describe("flattenSections", () => {
  it("keeps section order and puts top-level entries before subgroup entries", () => {
    const flat = flattenSections([
      section("mitglieder", [entry("a")], [entry("b")]),
      section("allgemein", [entry("c")]),
    ]);
    expect(flat.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list for no sections", () => {
    expect(flattenSections([])).toEqual([]);
  });
});

describe("entriesForContext", () => {
  it("keeps only the entries pinned to the key", () => {
    const entries = [
      entry("a", { contexts: ["dateien"] }),
      entry("b"),
      entry("c", { contexts: ["profil", "dateien"] }),
    ];
    expect(entriesForContext(entries, "dateien").map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("returns nothing when the route matches no context", () => {
    expect(entriesForContext([entry("a", { contexts: ["dateien"] })], null)).toEqual([]);
  });

  it("returns nothing for a key no entry carries", () => {
    expect(entriesForContext([entry("a", { contexts: ["dateien"] })], "profil")).toEqual([]);
  });
});

describe("popularFrom", () => {
  it("takes from the viewer's primary section first and caps at the limit", () => {
    // assembleFaq hoists the primary section to index 0 (order.ts) and
    // flattenSections preserves that order, so the top of the flat list is
    // "Bereich des Viewers".
    const flat = flattenSections([
      section("bundesvorstand", [entry("a"), entry("b"), entry("c")]),
      section("allgemein", [entry("d")]),
    ]);
    expect(popularFrom(flat, 2).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("falls through to later sections when the first is short", () => {
    const flat = flattenSections([
      section("bundesvorstand", [entry("a")]),
      section("allgemein", [entry("d")]),
    ]);
    expect(popularFrom(flat, 3).map((e) => e.id)).toEqual(["a", "d"]);
  });
});

describe("pickByIds", () => {
  it("resolves ids in the order given, not the order of the entry list", () => {
    const entries = [entry("a"), entry("b"), entry("c")];
    expect(pickByIds(entries, ["c", "a"]).map((e) => e.id)).toEqual(["c", "a"]);
  });

  it("skips an id no entry carries rather than yielding a hole", () => {
    expect(pickByIds([entry("a")], ["a", "gone"]).map((e) => e.id)).toEqual(["a"]);
  });

  it("returns nothing for no ids", () => {
    expect(pickByIds([entry("a")], [])).toEqual([]);
  });
});

describe("searchEntries", () => {
  it("matches searchText case-insensitively", () => {
    const entries = [
      entry("a", { searchText: "wie lege ich ein event an" }),
      entry("b", { searchText: "dateien hochladen" }),
    ];
    expect(searchEntries(entries, "EVENT").map((e) => e.id)).toEqual(["a"]);
  });

  it("returns everything for an empty or whitespace query", () => {
    const entries = [entry("a"), entry("b")];
    expect(searchEntries(entries, "   ")).toHaveLength(2);
  });
});
