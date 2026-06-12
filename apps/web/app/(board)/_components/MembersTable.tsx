"use client";

import { useMemo, useState, useTransition } from "react";

import type { Member, MemberStatus } from "@bdas/members";

import { approveMemberAction, rejectMemberAction } from "./member-actions";

const STATUS_LABEL: Record<MemberStatus, string> = {
  pending: "Ausstehend",
  active: "Aktiv",
  inactive: "Inaktiv",
  alumnus: "Alumni",
};
const FILTERS: ReadonlyArray<{ key: "all" | MemberStatus; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Aktiv" },
  { key: "pending", label: "Ausstehend" },
  { key: "alumnus", label: "Alumni" },
];

export function MembersTable({
  members,
  groupNames,
  revalidatePath,
}: {
  members: Member[];
  groupNames: Record<string, string>;
  revalidatePath: string;
}) {
  const [filter, setFilter] = useState<"all" | MemberStatus>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);
  const [pending, start] = useTransition();

  const rows = useMemo(
    () =>
      members.filter(
        (m) =>
          (filter === "all" || m.status === filter) &&
          (q.trim() === "" || `${m.firstName} ${m.lastName}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [members, filter, q],
  );

  return (
    <div className="flex gap-4">
      <div className="flex-1 overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-bdas-soft p-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-bdas-pill px-3 py-1 text-sm transition-colors ${
                filter === f.key ? "bg-bdas-red text-bdas-surface" : "border border-bdas-soft text-bdas-ink-body hover:bg-bdas-surface-hover"
              }`}
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
              <th className="p-3 text-left font-medium">Name</th>
              <th className="p-3 text-left font-medium">Gruppe</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3 text-left font-medium">Beigetreten</th>
              <th className="p-3 text-left font-medium">Schnellaktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-bdas-soft hover:bg-bdas-surface-hover">
                <td className="cursor-pointer p-3 text-bdas-ink" onClick={() => setSelected(m)}>
                  {m.firstName} {m.lastName} ›
                </td>
                <td className="p-3 text-bdas-ink-body">{m.primaryGroupId ? groupNames[m.primaryGroupId] ?? "—" : "—"}</td>
                <td className="p-3">
                  <span className={`rounded-bdas-pill px-2 py-0.5 text-xs font-semibold ${m.status === "pending" ? "bg-bdas-surface-hover text-bdas-red" : "bg-bdas-surface-hover text-bdas-ink-body"}`}>
                    {STATUS_LABEL[m.status]}
                  </span>
                </td>
                <td className="p-3 text-bdas-ink-body">{m.joinedAt ? new Date(m.joinedAt).toLocaleDateString("de-DE") : "—"}</td>
                <td className="p-3">
                  {m.status === "pending" && (
                    <span className="flex gap-2">
                      <button type="button" disabled={pending} onClick={() => start(() => { void approveMemberAction(m.id, revalidatePath); })} className="rounded-bdas-sm bg-bdas-red px-2 py-1 text-xs font-semibold text-bdas-surface">Freigeben</button>
                      <button type="button" disabled={pending} onClick={() => start(() => { void rejectMemberAction(m.id, revalidatePath); })} className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs">Ablehnen</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-bdas-ink-muted">Keine Mitglieder.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <aside className="w-72 shrink-0 rounded-bdas border-l-2 border-bdas-red bg-bdas-surface p-4 shadow-bdas-card">
          <h3 className="text-lg font-semibold text-bdas-ink">{selected.firstName} {selected.lastName}</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between border-b border-bdas-soft pb-1"><dt className="text-bdas-ink-muted">Status</dt><dd className="text-bdas-ink-body">{STATUS_LABEL[selected.status]}</dd></div>
            <div className="flex justify-between border-b border-bdas-soft pb-1"><dt className="text-bdas-ink-muted">Gruppe</dt><dd className="text-bdas-ink-body">{selected.primaryGroupId ? groupNames[selected.primaryGroupId] ?? "—" : "—"}</dd></div>
            <div className="flex justify-between border-b border-bdas-soft pb-1"><dt className="text-bdas-ink-muted">Beigetreten</dt><dd className="text-bdas-ink-body">{selected.joinedAt ? new Date(selected.joinedAt).toLocaleDateString("de-DE") : "—"}</dd></div>
          </dl>
          <button type="button" onClick={() => setSelected(null)} className="mt-4 text-sm text-bdas-ink-muted hover:text-bdas-ink">Schließen</button>
        </aside>
      )}
    </div>
  );
}
