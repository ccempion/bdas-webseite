import type { CalendarEvent } from "./calendar-events";
import { EventAccordion } from "./EventAccordion";

const MONTHS_LONG = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/** `start` is "YYYY-MM-DD ..."; returns e.g. "September 2026". */
function monthLabel(start: string): string {
  const [y, m] = start.slice(0, 7).split("-").map(Number);
  return `${MONTHS_LONG[m! - 1]} ${y}`;
}

export function AgendaList({
  events,
  groupLabelFor,
}: {
  events: CalendarEvent[];
  groupLabelFor: (e: CalendarEvent) => string;
}) {
  if (events.length === 0) {
    return <p className="text-bdas-ink-body">Keine anstehenden Termine.</p>;
  }

  // Events arrive ascending by start (listUpcomingEvents orders asc(startsAt)).
  // Sort a copy defensively so the "merge into last group" logic and the
  // month-label keys stay correct even if that upstream ordering ever changes —
  // the wall-clock "YYYY-MM-DD HH:mm" format sorts lexicographically by time.
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const groups: { label: string; items: CalendarEvent[] }[] = [];
  for (const ev of sorted) {
    const label = monthLabel(ev.start);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(ev);
    else groups.push({ label, items: [ev] });
  }

  return (
    <div>
      {groups.map((g) => (
        <div key={g.label}>
          <h3 className="mb-2.5 mt-5 px-1 text-xs font-bold uppercase tracking-wider text-bdas-ink-muted first:mt-0">
            {g.label}
          </h3>
          {g.items.map((ev) => (
            <EventAccordion key={ev.id} event={ev} groupLabel={groupLabelFor(ev)} />
          ))}
        </div>
      ))}
    </div>
  );
}
