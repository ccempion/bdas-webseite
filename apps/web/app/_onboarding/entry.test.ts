import { describe, expect, it, vi } from "vitest";

import { DEFAULT_GREETING } from "@bdas/onboarding";

import { resolveEntryContext, type EntryDeps } from "./entry";

const deps = (over: Partial<EntryDeps> = {}): EntryDeps => ({
  eventTitle: async (id) => (id === "evt_sommer" ? "Sommerfest Köln" : null),
  campaigns: {
    "semesterstart-2026": { title: "Semesterstart", greeting: "Willkommen zum Semesterstart!" },
  },
  ...over,
});

describe("resolveEntryContext", () => {
  it("greets event guests with the event title", async () => {
    expect(await resolveEntryContext("event:evt_sommer", deps())).toEqual({
      source: "event:evt_sommer",
      greeting: "Du warst bei „Sommerfest Köln“. Willkommen!",
    });
  });

  it("keeps the source but the default greeting for an event it cannot show", async () => {
    expect(await resolveEntryContext("event:evt_privat", deps())).toEqual({
      source: "event:evt_privat",
      greeting: DEFAULT_GREETING,
    });
  });

  it("uses the campaign text, or the default for an unknown campaign", async () => {
    expect((await resolveEntryContext("kampagne:semesterstart-2026", deps())).greeting).toBe(
      "Willkommen zum Semesterstart!",
    );
    const unknown = await resolveEntryContext("kampagne:plakat-mensa", deps());
    expect(unknown).toEqual({ source: "kampagne:plakat-mensa", greeting: DEFAULT_GREETING });
  });

  it("has its own greeting for newsletter readers and content teasers", async () => {
    expect((await resolveEntryContext("newsletter", deps())).greeting).toBe(
      "Schön, dass du über den Newsletter zu uns kommst!",
    );
    expect((await resolveEntryContext("inhalt:page_1", deps())).greeting).toBe(
      "Schön, dass du mehr sehen willst!",
    );
  });

  it("does not look anything up for an unknown source", async () => {
    const eventTitle = vi.fn();
    expect(await resolveEntryContext("javascript:alert(1)", deps({ eventTitle }))).toEqual({
      source: "direkt",
      greeting: DEFAULT_GREETING,
    });
    expect(eventTitle).not.toHaveBeenCalled();
  });

  it("never lets a lookup failure break the wizard", async () => {
    const failing = deps({ eventTitle: async () => Promise.reject(new Error("db")) });
    expect((await resolveEntryContext("event:evt_sommer", failing)).greeting).toBe(
      DEFAULT_GREETING,
    );
  });

  it("does not inherit campaign names from the object prototype", async () => {
    expect((await resolveEntryContext("kampagne:constructor", deps())).greeting).toBe(
      DEFAULT_GREETING,
    );
  });
});
