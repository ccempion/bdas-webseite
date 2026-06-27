import { describe, expect, it } from "vitest";

import { eventToIcs } from "./ics";

describe("eventToIcs", () => {
  it("produces a single VEVENT in Europe/Berlin time (summer = CEST, +02)", () => {
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
    // DST-correct VTIMEZONE so calendars render German local time.
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:Europe/Berlin");
    // 17:00Z = 19:00 CEST, 21:00Z = 23:00 CEST.
    expect(ics).toContain("DTSTART;TZID=Europe/Berlin:20260801T190000");
    expect(ics).toContain("DTEND;TZID=Europe/Berlin:20260801T230000");
    // Commas in text must be escaped per RFC 5545.
    expect(ics).toContain("SUMMARY:Sommerfest\\, BDAS");
    expect(ics).toContain("LOCATION:Rathaus\\, Markt 1");
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("uses CET (+01) for a winter event — DST is dynamic", () => {
    const ics = eventToIcs({
      id: "evt_w",
      title: "Winterfeier",
      summary: null,
      startsAt: new Date("2026-01-15T17:00:00Z"),
      endsAt: null,
      locationName: null,
      locationAddress: null,
    });
    // 17:00Z = 18:00 CET (one hour, not two).
    expect(ics).toContain("DTSTART;TZID=Europe/Berlin:20260115T180000");
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
    expect(ics).toContain("DTEND;TZID=Europe/Berlin:20260801T190000");
  });
});
