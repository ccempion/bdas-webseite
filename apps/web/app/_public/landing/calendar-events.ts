import type { EventWithCounts } from "@bdas/events-module";

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
};

const HOUR_MS = 60 * 60 * 1000;

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function toCalendarEvents(events: ReadonlyArray<EventWithCounts>): CalendarEvent[] {
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    start: fmt(e.startsAt),
    end: fmt(e.endsAt ?? new Date(e.startsAt.getTime() + HOUR_MS)),
    groupId: e.groupId,
  }));
}
