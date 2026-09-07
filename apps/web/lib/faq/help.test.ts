import { describe, expect, it } from "vitest";

import type { FaqEntryView, FaqSectionView } from "./assemble";
import { flattenSections, partitionByContext, popularFrom, searchEntries } from "./help";

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

describe("partitionByContext", () => {
  it("splits on the context key", () => {
    const entries = [
      entry("a", { contexts: ["dateien"] }),
      entry("b"),
      entry("c", { contexts: ["profil", "dateien"] }),
    ];
    const { inContext, rest } = partitionByContext(entries, "dateien");
    expect(inContext.map((e) => e.id)).toEqual(["a", "c"]);
    expect(rest.map((e) => e.id)).toEqual(["b"]);
  });

  it("puts everything in `rest` when there is no context", () => {
    const entries = [entry("a", { contexts: ["dateien"] })];
    const { inContext, rest } = partitionByContext(entries, null);
    expect(inContext).toEqual([]);
    expect(rest.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("popularFrom", () => {
  it("takes from the viewer's primary section first and caps at the limit", () => {
    // assembleFaq already hoists the primary section to index 0 (order.ts).
    const sections = [
      section("bundesvorstand", [entry("a"), entry("b"), entry("c")]),
      section("allgemein", [entry("d")]),
    ];
    expect(popularFrom(sections, 2).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("falls through to later sections when the first is short", () => {
    const sections = [section("bundesvorstand", [entry("a")]), section("allgemein", [entry("d")])];
    expect(popularFrom(sections, 3).map((e) => e.id)).toEqual(["a", "d"]);
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
