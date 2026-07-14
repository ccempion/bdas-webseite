"use client";

// Installs the runtime Temporal.* globals AND their ambient TS types.
// @schedule-x/calendar v4 (installed here) dropped Date/string event fields
// in favor of Temporal.ZonedDateTime — see the module-level comment below.
import "temporal-polyfill/global";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { createViewMonthAgenda, createViewMonthGrid } from "@schedule-x/calendar";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";

import { FilterChip } from "@bdas/design-system";

import type { CalendarEvent } from "./calendar-events";

import "@schedule-x/theme-default/dist/index.css";

export type GroupOption = { id: string; name: string };
type Filter = "all" | "federal" | string;

/** Events are German (Bundesweit/de-DE UI) wall-clock times; the wire format
 *  has no offset, so we anchor it to Europe/Berlin here. */
const TIMEZONE = "Europe/Berlin";

/**
 * `toCalendarEvents` (calendar-events.ts) still emits plain "YYYY-MM-DD HH:mm"
 * strings — that stays the RSC wire format since Temporal.ZonedDateTime
 * instances aren't safe to pass across the server→client boundary. The
 * installed @schedule-x/calendar (v4.6.0) API drifted from the brief's
 * string-based events: `CalendarEventExternal.start`/`end` are now
 * `Temporal.ZonedDateTime | Temporal.PlainDate`, so the conversion happens
 * here, at the last possible moment, instead of in the serializer.
 */
function toZonedDateTime(wireDateTime: string): Temporal.ZonedDateTime {
  return Temporal.PlainDateTime.from(wireDateTime.replace(" ", "T")).toZonedDateTime(TIMEZONE);
}

function Calendar({
  events,
  onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (id: string) => void;
}) {
  const calendar = useCalendarApp({
    views: [createViewMonthGrid(), createViewMonthAgenda()],
    events: events.map(({ id, title, start, end }) => ({
      id,
      title,
      start: toZonedDateTime(start),
      end: toZonedDateTime(end),
    })),
    locale: "de-DE",
    callbacks: {
      onEventClick: (ev) => onEventClick(String(ev.id)),
    },
  });
  return <ScheduleXCalendar calendarApp={calendar} />;
}

export function EventCalendar({
  events,
  groups,
}: {
  events: CalendarEvent[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "federal") return events.filter((e) => e.groupId === null);
    return events.filter((e) => e.groupId === filter);
  }, [events, filter]);

  const groupsWithEvents = groups.filter((g) => events.some((e) => e.groupId === g.id));

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Veranstaltungen filtern"
      >
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Alle
        </FilterChip>
        <FilterChip active={filter === "federal"} onClick={() => setFilter("federal")}>
          Bundesweit
        </FilterChip>
        {groupsWithEvents.map((g) => (
          <FilterChip key={g.id} active={filter === g.id} onClick={() => setFilter(g.id)}>
            {g.name}
          </FilterChip>
        ))}
      </div>
      {/* key remounts Schedule-X when the filter changes */}
      <Calendar
        key={filter}
        events={filtered}
        onEventClick={(id) => router.push(`/events/${id}` as Route)}
      />
    </div>
  );
}
