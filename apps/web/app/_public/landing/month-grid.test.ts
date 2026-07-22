import { describe, expect, it } from "vitest";

import { buildMonthWeeks } from "./month-grid";
import type { CalendarEvent } from "./calendar-events";

function ev(id: string, start: string, groupId: string | null = null): CalendarEvent {
  return { id, title: id, start, end: start, groupId, summary: null, location: null };
}

describe("buildMonthWeeks", () => {
  // September 2026: the 1st is a Tuesday, so Monday-first grids get one
  // leading cell (Mon Aug 31). 30 days + 1 lead = 31 cells => 5 weeks.
  it("lays out September 2026 as 5 Monday-first weeks", () => {
    const weeks = buildMonthWeeks(2026, 9, []);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0]![0]).toMatchObject({ date: "2026-08-31", day: 31, inMonth: false });
    expect(weeks[0]![1]).toMatchObject({ date: "2026-09-01", day: 1, inMonth: true });
    expect(weeks[4]![6]).toMatchObject({ date: "2026-10-04", day: 4, inMonth: false });
  });

  it("buckets an event onto its start date", () => {
    const weeks = buildMonthWeeks(2026, 9, [ev("e1", "2026-09-14 10:00")]);
    const cell = weeks.flat().find((c) => c.date === "2026-09-14");
    expect(cell!.events.map((e) => e.id)).toEqual(["e1"]);
    // no other cell carries it
    expect(weeks.flat().filter((c) => c.events.length > 0)).toHaveLength(1);
  });

  it("keeps events off out-of-month days", () => {
    const weeks = buildMonthWeeks(2026, 9, [ev("e1", "2026-08-31 09:00")]);
    const leading = weeks[0]![0]!;
    expect(leading.date).toBe("2026-08-31");
    expect(leading.events).toHaveLength(1); // bucketed onto the visible lead cell
  });
});
