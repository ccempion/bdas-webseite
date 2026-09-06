import { describe, expect, it } from "vitest";
import { assembleFaq } from "./assemble";

const entry = (
  over: Partial<Parameters<typeof assembleFaq>[0]["entries"][number]>,
): Parameters<typeof assembleFaq>[0]["entries"][number] => ({
  id: "e1",
  section: "mitglieder",
  subgroup: null,
  topicId: null,
  question: "F?",
  body: { type: "doc", content: [] },
  youtubeId: null,
  status: "published",
  position: 0,
  updatedAt: new Date("2026-09-01"),
  updatedBy: null,
  relatedIds: [],
  contexts: [],
  ...over,
});

describe("assembleFaq", () => {
  it("hides bundesvorstand from a plain member and drops empty sections", () => {
    const { sections } = assembleFaq({
      entries: [entry({ id: "b1", section: "bundesvorstand" }), entry({ id: "m1" })],
      topics: [],
      grants: [{ role: "member", groupId: null }],
    });
    expect(sections.map((s) => s.key)).toEqual(["mitglieder"]);
  });

  it("puts the primary section first and open; subgroup highlighted for own grant", () => {
    const { sections } = assembleFaq({
      entries: [
        entry({ id: "v1", section: "vorstand", subgroup: "local_board_lead" }),
        entry({ id: "m1" }),
      ],
      topics: [],
      grants: [{ role: "local_board_lead", groupId: "g1" }],
    });
    expect(sections[0]!.key).toBe("vorstand");
    expect(sections[0]!.subgroups[0]!.highlighted).toBe(true);
  });

  it("only lists topics attached to visible entries; searchText is lowercased", () => {
    const { sections, topics } = assembleFaq({
      entries: [entry({ id: "m1", topicId: "t1", question: "Wie GEHT das?" })],
      topics: [
        { id: "t1", name: "Events", position: 0 },
        { id: "t2", name: "Unbenutzt", position: 1 },
      ],
      grants: [{ role: "member", groupId: null }],
    });
    expect(topics).toEqual([{ id: "t1", name: "Events" }]);
    expect(sections[0]!.entries[0]!.searchText).toContain("wie geht das?");
  });

  it("a viewer with a vorstand grant does not see another subgroup's entries", () => {
    const { sections } = assembleFaq({
      entries: [entry({ id: "v1", section: "vorstand", subgroup: "page_editor" })],
      topics: [],
      grants: [{ role: "local_board_lead", groupId: "g1" }],
    });
    expect(sections.find((s) => s.key === "vorstand")).toBeUndefined();
  });
});
