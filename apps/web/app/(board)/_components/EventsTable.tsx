"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { EventStatus, EventWithCounts } from "@bdas/events-module";

type Row = EventWithCounts;

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Entwurf",
  published: "Veröffentlicht",
  cancelled: "Abgesagt",
};
const FILTERS: ReadonlyArray<{ key: "all" | EventStatus; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "published", label: "Veröffentlicht" },
  { key: "draft", label: "Entwurf" },
  { key: "cancelled", label: "Abgesagt" },
];

export function EventsTable({
  events,
  groupNames,
}: {
  events: Row[];
  groupNames: Record<string, string>;
}) {
  const [filter, setFilter] = useState<"all" | EventStatus>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      events.filter(
        (e) =>
          (filter === "all" || e.status === filter) &&
          (q.trim() === "" || e.title.toLowerCase().includes(q.toLowerCase())),
      ),
    [events, filter, q],
  );
  return (
    <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-bdas-soft p-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-bdas-pill px-3 py-1 text-sm transition-colors ${filter === f.key ? "bg-bdas-red text-bdas-surface" : "border border-bdas-soft text-bdas-ink-body hover:bg-bdas-surface-hover"}`}
          >
            {f.label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suche…"
          className="ml-auto rounded-bdas-sm border border-bdas-soft px-3 py-1 text-bdas-ink-body"
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-bdas-ink-muted">
            <th className="p-3 text-left font-medium">Titel</th>
            <th className="p-3 text-left font-medium">Gruppe</th>
            <th className="p-3 text-left font-medium">Datum</th>
            <th className="p-3 text-left font-medium">Status</th>
            <th className="p-3 text-left font-medium">Anmeldungen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-bdas-soft hover:bg-bdas-surface-hover">
              <td className="p-3">
                <Link href={`/admin/events/${e.id}`} className="text-bdas-red hover:underline">
                  {e.title}
                </Link>
              </td>
              <td className="p-3 text-bdas-ink-body">
                {e.groupId ? (groupNames[e.groupId] ?? "—") : "Bundesweit"}
              </td>
              <td className="p-3 text-bdas-ink-body">{e.startsAt.toLocaleDateString("de-DE")}</td>
              <td className="p-3">
                <span className="rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-ink-body">
                  {STATUS_LABEL[e.status]}
                </span>
              </td>
              <td className="p-3 text-bdas-ink-body">
                {e.confirmedCount}
                {e.capacity ? ` / ${e.capacity}` : ""}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center text-bdas-ink-muted">
                Keine Events.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
