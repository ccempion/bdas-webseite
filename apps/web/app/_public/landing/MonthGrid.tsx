"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { berlinParts } from "../../lib/datetime";
import type { CalendarEvent } from "./calendar-events";
import { buildMonthWeeks } from "./month-grid";

const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS_LONG = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function berlinTodayIso(): string {
  const p = berlinParts(new Date());
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p["year"]}-${pad(p["month"]!)}-${pad(p["day"]!)}`;
}

export function MonthGrid({ events }: { events: CalendarEvent[] }) {
  const today = berlinTodayIso();
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));

  const shift = (delta: number) =>
    setCursor((c) => {
      const idx = c.year * 12 + (c.month - 1) + delta;
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    });

  const weeks = buildMonthWeeks(cursor.year, cursor.month, events);
  const navBtn =
    "flex h-8 w-8 items-center justify-center rounded-full border border-bdas-strong bg-bdas-surface text-bdas-ink-body transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover";

  return (
    <div className="rounded-bdas border border-bdas-soft bg-bdas-surface p-2 shadow-bdas-card">
      <div className="flex items-center justify-between px-2.5 pb-3 pt-2">
        <button type="button" onClick={() => shift(-1)} aria-label="Vorheriger Monat" className={navBtn}>
          ‹
        </button>
        <h3 className="text-base font-bold text-bdas-ink">
          {MONTHS_LONG[cursor.month - 1]} {cursor.year}
        </h3>
        <button type="button" onClick={() => shift(1)} aria-label="Nächster Monat" className={navBtn}>
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {DOW.map((d) => (
          <div key={d} className="py-1.5 text-center text-xs font-bold uppercase tracking-wide text-bdas-ink-muted">
            {d}
          </div>
        ))}

        {weeks.flat().map((cell) => (
          <div
            key={cell.date}
            className="flex min-h-[58px] flex-col gap-0.5 rounded-bdas-sm p-1.5 transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover sm:min-h-[78px]"
          >
            <span
              className={
                cell.date === today
                  ? "inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-bdas-red text-xs font-bold tabular-nums text-white"
                  : "text-sm tabular-nums " +
                    (cell.inMonth ? "text-bdas-ink-body" : "text-bdas-ink-muted opacity-50")
              }
            >
              {cell.day}
            </span>

            {/* Mobile: a dot when the day has any event */}
            {cell.events.length > 0 ? (
              <span
                className={
                  "mt-auto h-1.5 w-1.5 rounded-full sm:hidden " +
                  (cell.events.some((e) => e.groupId === null) ? "bg-bdas-red" : "bg-bdas-ink-muted")
                }
                aria-hidden="true"
              />
            ) : null}

            {/* Desktop: full event pills */}
            {cell.events.map((ev) => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}` as Route}
                className={
                  "hidden truncate rounded-bdas-sm border-l-2 bg-bdas-surface-hover px-1.5 py-0.5 text-xs font-semibold sm:block " +
                  (ev.groupId === null ? "border-bdas-red text-bdas-red" : "border-bdas-strong text-bdas-ink-body")
                }
              >
                {ev.title}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
