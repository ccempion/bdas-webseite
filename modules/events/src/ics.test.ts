import { describe, expect, it } from "vitest";

import { eventToIcs } from "./ics";

describe("eventToIcs", () => {
  it("produces a single VEVENT with required fields", () => {
    const ics = eventToIcs({
      id: "evt_1",
      title: "Sommerfest, BDAS",
      summary: "Treffen",
      startsAt: new Date("2026-08-01T17:00:00Z"),
      endsAt: new Date("2026-08-01T21:00:00Z"),
      locationName: "Rathaus",
      locationAddress: "Markt 1",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:evt_1");
    expect(ics).toContain("DTSTART:20260801T170000Z");
    expect(ics).toContain("DTEND:20260801T210000Z");
    // Commas in text must be escaped per RFC 5545.
    expect(ics).toContain("SUMMARY:Sommerfest\\, BDAS");
    expect(ics).toContain("LOCATION:Rathaus\\, Markt 1");
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("defaults DTEND to start when endsAt is null", () => {
    const ics = eventToIcs({
      id: "evt_2",
      title: "Kurz",
      summary: null,
      startsAt: new Date("2026-08-01T17:00:00Z"),
      endsAt: null,
      locationName: null,
      locationAddress: null,
    });
    expect(ics).toContain("DTEND:20260801T170000Z");
  });
});
