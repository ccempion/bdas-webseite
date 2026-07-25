"use client";

import { useMemo, useState } from "react";

import { FilterChip } from "@bdas/design-system";

import type { CalendarEvent } from "./calendar-events";
import { AgendaList } from "./AgendaList";
import { MonthGrid } from "./MonthGrid";

export type GroupOption = { id: string; name: string };
type Filter = "all" | "federal" | string;
type View = "list" | "month";

export function EventCalendar({
  events,
  groups,
}: {
  events: CalendarEvent[];
  groups: GroupOption[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("list");

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "federal") return events.filter((e) => e.groupId === null);
    return events.filter((e) => e.groupId === filter);
  }, [events, filter]);

  const groupsWithEvents = groups.filter((g) => events.some((e) => e.groupId === g.id));
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const groupLabelFor = (e: CalendarEvent) =>
    e.groupId === null ? "Bundesweit" : (groupName.get(e.groupId) ?? "Gruppe");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Veranstaltungen filtern">
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

        <div
          className="inline-flex rounded-bdas-pill border border-bdas-strong bg-bdas-surface p-0.5"
          role="group"
          aria-label="Ansicht"
        >
          {(["list", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={
                "rounded-bdas-pill px-4 py-1 text-sm font-semibold transition-colors duration-bdas-quick ease-bdas " +
                (view === v
                  ? "bg-bdas-red text-white"
                  : "text-bdas-ink-muted hover:text-bdas-ink-body")
              }
            >
              {v === "list" ? "Liste" : "Monat"}
            </button>
          ))}
        </div>
      </div>

      {view === "list" ? (
        <AgendaList events={filtered} groupLabelFor={groupLabelFor} />
      ) : (
        <MonthGrid events={filtered} />
      )}
    </div>
  );
}
