import { describe, expect, it } from "vitest";

import { toCalendarEvents } from "./calendar-events";

const base = {
  id: "ev-1",
  groupId: null,
  title: "Bundeskonferenz",
  descriptionMd: null,
  // 2026-09-05T12:30:00Z is 2026-09-05 14:30 Europe/Berlin (CEST, UTC+2).
  // Constructed as explicit UTC instants so the test is independent of the
  // runtime TZ the test process happens to run under.
  startsAt: new Date(Date.UTC(2026, 8, 5, 12, 30)),
  endsAt: new Date(Date.UTC(2026, 8, 5, 16, 0)),
  location: null,
  locationUrl: null,
  content: null,
  coverImageKey: null,
  summary: null,
  registrationDeadline: null,
  locationName: null,
  locationAddress: null,
  locationLat: null,
  locationLng: null,
  capacity: null,
  allowGuestRegistration: false,
  visibility: "public" as const,
  status: "published" as const,
  createdBy: "m-1",
  confirmedCount: 0,
  waitlistCount: 0,
};

describe("toCalendarEvents", () => {
  it("formats start/end and carries summary + location", () => {
    const [ev] = toCalendarEvents([base]);
    expect(ev).toEqual({
      id: "ev-1",
      title: "Bundeskonferenz",
      start: "2026-09-05 14:30",
      end: "2026-09-05 18:00",
      groupId: null,
      summary: null,
      location: null,
    });
  });

  it("defaults a missing end to one hour after start", () => {
    const [ev] = toCalendarEvents([{ ...base, endsAt: null }]);
    expect(ev!.end).toBe("2026-09-05 15:30");
  });

  it("serializes Berlin wall-clock regardless of runtime TZ (proof: input is a UTC instant)", () => {
    // 14:30 CEST, not 12:30 — proves the serializer converts through
    // Europe/Berlin rather than using the process's local TZ getters.
    const [ev] = toCalendarEvents([base]);
    expect(ev!.start).toBe("2026-09-05 14:30");
  });

  it("passes summary through", () => {
    const [ev] = toCalendarEvents([{ ...base, summary: "Kurzbeschreibung" }]);
    expect(ev!.summary).toBe("Kurzbeschreibung");
  });

  it("derives location from name + address", () => {
    const [ev] = toCalendarEvents([
      { ...base, locationName: "Rathaus", locationAddress: "Marktplatz 1" },
    ]);
    expect(ev!.location).toBe("Rathaus, Marktplatz 1");
  });

  it("uses location name alone when address is absent", () => {
    const [ev] = toCalendarEvents([{ ...base, locationName: "Online" }]);
    expect(ev!.location).toBe("Online");
  });

  it("falls back to the legacy location field", () => {
    const [ev] = toCalendarEvents([{ ...base, location: "Berlin" }]);
    expect(ev!.location).toBe("Berlin");
  });
});
