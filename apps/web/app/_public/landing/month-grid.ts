import type { CalendarEvent } from "./calendar-events";

export type DayCell = {
  /** "YYYY-MM-DD" */
  readonly date: string;
  readonly day: number;
  readonly inMonth: boolean;
  readonly events: readonly CalendarEvent[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const DAY_MS = 86_400_000;

/**
 * Monday-first weeks for the given month (`month` is 1-12). Events are bucketed
 * onto a day by the date prefix of their `start` ("YYYY-MM-DD HH:mm"), so no
 * timezone math is needed — the strings are already Europe/Berlin wall-clock.
 * Iteration runs in UTC so the calendar arithmetic is free of local-TZ drift.
 * Leading/trailing cells fill out partial weeks and carry `inMonth: false`.
 */
export function buildMonthWeeks(
  year: number,
  month: number,
  events: readonly CalendarEvent[],
): DayCell[][] {
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = e.start.slice(0, 10);
    const bucket = byDate.get(key);
    if (bucket) bucket.push(e);
    else byDate.set(key, [e]);
  }

  const first = new Date(Date.UTC(year, month - 1, 1));
  const leading = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((leading + daysInMonth) / 7);
  const start = new Date(Date.UTC(year, month - 1, 1 - leading));

  const cells: DayCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const date = iso(y, m, day);
    cells.push({ date, day, inMonth: m === month && y === year, events: byDate.get(date) ?? [] });
  }

  const out: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
  return out;
}
