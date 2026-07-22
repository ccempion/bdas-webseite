import type { EventWithCounts } from "@bdas/events-module";

import { berlinParts } from "../../lib/datetime";

/** Wire shape passed from the server page into the Schedule-X client island.
 *  start/end use the "YYYY-MM-DD HH:mm" wall-clock format (Europe/Berlin) —
 *  plain strings so this crosses the RSC server→client boundary as ordinary
 *  serializable data. EventCalendar converts them to Schedule-X's Temporal
 *  values at render time (see EventCalendar.tsx for why). */
export type CalendarEvent = {
  readonly id: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly groupId: string | null;
  readonly summary: string | null;
  readonly location: string | null;
};

const HOUR_MS = 60 * 60 * 1000;

// Event instants must render as Europe/Berlin wall-clock regardless of the
// runtime TZ (UTC on Vercel) — see apps/web/app/lib/datetime.ts.
function fmt(d: Date): string {
  const p = berlinParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p["year"]}-${pad(p["month"]!)}-${pad(p["day"]!)} ${pad(p["hour"]!)}:${pad(p["minute"]!)}`;
}

function locationOf(e: EventWithCounts): string | null {
  if (e.locationName) {
    return e.locationAddress ? `${e.locationName}, ${e.locationAddress}` : e.locationName;
  }
  return e.location ?? null;
}

export function toCalendarEvents(events: ReadonlyArray<EventWithCounts>): CalendarEvent[] {
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    start: fmt(e.startsAt),
    end: fmt(e.endsAt ?? new Date(e.startsAt.getTime() + HOUR_MS)),
    groupId: e.groupId,
    summary: e.summary,
    location: locationOf(e),
  }));
}
