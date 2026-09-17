import { describe, expect, it } from "vitest";

import { DEFAULT_GREETING, normalizeSource, parseEntryContext } from "./entry-context";

describe("normalizeSource", () => {
  it.each([
    ["event:evt_abc123", "event:evt_abc123"],
    ["newsletter", "newsletter"],
    ["kampagne:sommer-2026", "kampagne:sommer-2026"],
    ["inhalt:page_42", "inhalt:page_42"],
  ])("keeps the known source %s", (raw, expected) => {
    expect(normalizeSource(raw)).toBe(expected);
  });

  it.each([
    ["unknown kind", "werbung:x"],
    ["uppercase campaign", "kampagne:Sommer"],
    ["script", "event:<script>"],
    ["too long", `kampagne:${"a".repeat(65)}`],
    ["empty", ""],
    ["not a string", 42],
    ["missing", undefined],
  ])("turns %s into direkt", (_label, raw) => {
    expect(normalizeSource(raw)).toBe("direkt");
  });
});

describe("parseEntryContext", () => {
  it("carries the source and the default greeting, nothing else", () => {
    expect(parseEntryContext("newsletter")).toEqual({
      source: "newsletter",
      greeting: DEFAULT_GREETING,
    });
  });
});
