import { describe, expect, it } from "vitest";

import { toCalendarEvents } from "./calendar-events";

const base = {
  id: "ev-1",
  groupId: null,
  title: "Bundeskonferenz",
  descriptionMd: null,
  startsAt: new Date(2026, 8, 5, 14, 30), // 2026-09-05 14:30 local
  endsAt: new Date(2026, 8, 5, 18, 0),
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
  visibility: "public" as const,
  status: "published" as const,
  createdBy: "m-1",
  confirmedCount: 0,
  waitlistCount: 0,
};

describe("toCalendarEvents", () => {
  it("formats start/end as YYYY-MM-DD HH:mm", () => {
    const [ev] = toCalendarEvents([base]);
    expect(ev).toEqual({
      id: "ev-1",
      title: "Bundeskonferenz",
      start: "2026-09-05 14:30",
      end: "2026-09-05 18:00",
      groupId: null,
    });
  });

  it("defaults a missing end to one hour after start", () => {
    const [ev] = toCalendarEvents([{ ...base, endsAt: null }]);
    expect(ev!.end).toBe("2026-09-05 15:30");
  });
});
