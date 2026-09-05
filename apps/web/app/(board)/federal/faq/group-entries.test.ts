import { describe, expect, it } from "vitest";
import { groupByScope } from "./group-entries";
import type { FaqEntry } from "@bdas/faq";

const entry = (over: Partial<FaqEntry>): FaqEntry => ({
  id: "e",
  section: "mitglieder",
  subgroup: null,
  topicId: null,
  question: "F?",
  body: { type: "doc" },
  youtubeId: null,
  status: "draft",
  position: 0,
  updatedAt: new Date("2026-09-01"),
  updatedBy: null,
  relatedIds: [],
  contexts: [],
  ...over,
});

describe("groupByScope", () => {
  it("groups by section+subgroup in first-seen order", () => {
    const out = groupByScope([
      entry({ id: "a", section: "vorstand", subgroup: "local_board_lead" }),
      entry({ id: "b", section: "mitglieder" }),
      entry({ id: "c", section: "vorstand", subgroup: "local_board_lead" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ section: "vorstand", subgroup: "local_board_lead" });
    expect(out[0]!.entries.map((e) => e.id)).toEqual(["a", "c"]);
    expect(out[1]!.entries.map((e) => e.id)).toEqual(["b"]);
  });

  it("treats null subgroup separately from a named one in the same section", () => {
    const out = groupByScope([
      entry({ id: "a", section: "vorstand", subgroup: null }),
      entry({ id: "b", section: "vorstand", subgroup: "page_editor" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("empty input yields no groups", () => {
    expect(groupByScope([])).toEqual([]);
  });
});
