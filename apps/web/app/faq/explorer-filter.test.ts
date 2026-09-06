import { describe, expect, it } from "vitest";
import { filterSections } from "./explorer-filter";
import type { FaqSectionView } from "../../lib/faq/assemble";

const entry = (id: string, over: object = {}) => ({
  id,
  question: id,
  body: null,
  searchText: `frage ${id}`,
  topic: null,
  youtubeId: null,
  updatedAtIso: "2026-09-01T00:00:00.000Z",
  relatedIds: [],
  ...over,
});
const sections: FaqSectionView[] = [
  {
    key: "mitglieder",
    title: "Mitglieder",
    intro: null,
    entries: [entry("a", { topic: { id: "t1", name: "Events" } }), entry("b")],
    subgroups: [],
  },
];

describe("filterSections", () => {
  it("filters by query against searchText", () => {
    const out = filterSections(sections, { query: "frage a", topicId: null });
    expect(out[0]!.entries.map((e) => e.id)).toEqual(["a"]);
  });
  it("filters by topic and drops emptied sections", () => {
    expect(filterSections(sections, { query: "", topicId: "t1" })[0]!.entries).toHaveLength(1);
    expect(filterSections(sections, { query: "zzz", topicId: null })).toEqual([]);
  });
});
