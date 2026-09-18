import { describe, expect, it } from "vitest";

import { normalizeSource } from "@bdas/onboarding";

import { buildEntryLink } from "./entry-link";

describe("buildEntryLink", () => {
  it("builds a wizard link with the campaign as source", () => {
    expect(buildEntryLink("https://bdas.de/", "mensa-plakat")).toBe(
      "https://bdas.de/mitmachen?from=kampagne:mensa-plakat",
    );
  });

  it("accepts exactly what the module whitelists", () => {
    const link = buildEntryLink("https://bdas.de", "sommer-2026");
    const source = new URL(link!).searchParams.get("from");
    expect(normalizeSource(source)).toBe("kampagne:sommer-2026");
  });

  it.each(["", "Mensa", "mensa plakat", "ümlaut", "a".repeat(65), "../x"])(
    "refuses the slug %j",
    (slug) => {
      expect(buildEntryLink("https://bdas.de", slug)).toBeNull();
    },
  );
});
