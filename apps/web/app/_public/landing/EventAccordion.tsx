import Link from "next/link";
import type { Route } from "next";

import type { CalendarEvent } from "./calendar-events";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

/** `start` is "YYYY-MM-DD HH:mm" Europe/Berlin wall-clock. */
function parseStart(start: string): { day: number; monthAbbr: string; time: string } {
  const [date, time] = start.split(" ");
  const [, month, day] = date!.split("-").map(Number);
  return { day: day!, monthAbbr: MONTHS_SHORT[month! - 1]!, time: time! };
}

export function EventAccordion({
  event,
  groupLabel,
}: {
  event: CalendarEvent;
  groupLabel: string;
}) {
  const { day, monthAbbr, time } = parseStart(event.start);
  const isFederal = event.groupId === null;

  return (
    <details className="bdas-accordion">
      <summary>
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex w-12 shrink-0 flex-col items-center rounded-bdas-sm bg-bdas-surface-hover py-1.5">
            <span className="text-xl font-bold leading-none text-bdas-ink tabular-nums">{day}</span>
            <span className="mt-0.5 text-xs uppercase tracking-wide text-bdas-ink-muted">
              {monthAbbr}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{event.title}</span>
            <span className="mt-0.5 block text-sm font-normal text-bdas-ink-muted">
              {time} Uhr{event.location ? ` · ${event.location}` : ""}
            </span>
          </span>
          <span
            className={
              "shrink-0 rounded-bdas-pill border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide " +
              (isFederal
                ? "border-bdas-red text-bdas-red"
                : "border-bdas-strong text-bdas-ink-muted")
            }
          >
            {groupLabel}
          </span>
        </span>
      </summary>
      <div>
        {event.summary ? <p className="mb-3">{event.summary}</p> : null}
        <Link
          href={`/events/${event.id}` as Route}
          className="inline-flex items-center gap-1.5 rounded-bdas-pill bg-bdas-red px-4 py-1.5 text-sm font-semibold text-white"
        >
          Zum Event →
        </Link>
      </div>
    </details>
  );
}
