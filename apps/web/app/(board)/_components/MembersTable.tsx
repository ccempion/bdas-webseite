"use client";

import { useMemo, useState } from "react";

import type { Member, MemberStatus, OpenGroupChange, RejectionCategory } from "@bdas/members";

import { MemberGroupPanel } from "./MemberGroupPanel";

const STATUS_LABEL: Record<MemberStatus, string> = {
  pending: "Ausstehend",
  active: "Aktiv",
  inactive: "Inaktiv",
  alumnus: "Alumni",
};
/** No `pending` filter: an applicant is no longer a member row awaiting a
 *  verdict but a request on the group's Bewerbungen queue (ADR 0031). */
const FILTERS: ReadonlyArray<{ key: "all" | MemberStatus; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Aktiv" },
  { key: "alumnus", label: "Alumni" },
];

export function MembersTable({
  members,
  groupNames,
  openChanges,
  revalidatePath,
  rejectionCategories,
}: {
  members: Member[];
  groupNames: Record<string, string>;
  openChanges: OpenGroupChange[];
  revalidatePath: string;
  rejectionCategories: ReadonlyArray<{ key: RejectionCategory; label: string }>;
}) {
  const [filter, setFilter] = useState<"all" | MemberStatus>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);

  const openByMember = useMemo(
    () =>
      Object.fromEntries(openChanges.map((c) => [c.memberId, c])) as Record<
        string,
        OpenGroupChange | undefined
      >,
    [openChanges],
  );

  const rows = useMemo(
    () =>
      members.filter(
        (m) =>
          (filter === "all" || m.status === filter) &&
          (q.trim() === "" ||
            `${m.firstName} ${m.lastName}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [members, filter, q],
  );

  return (
    <div className="flex gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-bdas-soft p-3">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-bdas-pill px-3 py-1 text-sm transition-colors ${
                  filter === f.key
                    ? "bg-bdas-red text-bdas-surface"
                    : "border border-bdas-soft text-bdas-ink-body hover:bg-bdas-surface-hover"
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
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t border-bdas-soft hover:bg-bdas-surface-hover">
                  <td className="cursor-pointer p-3 text-bdas-ink" onClick={() => setSelected(m)}>
                    {m.firstName} {m.lastName} ›
                  </td>
                  <td className="p-3 text-bdas-ink-body">
                    {m.primaryGroupId ? (groupNames[m.primaryGroupId] ?? "—") : "—"}
                    {openByMember[m.id] ? (
                      <span className="ml-2 rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-red">
                        → {groupNames[openByMember[m.id]?.toGroupId ?? ""] ?? "—"}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-bdas-pill px-2 py-0.5 text-xs font-semibold ${m.status === "pending" ? "bg-bdas-surface-hover text-bdas-red" : "bg-bdas-surface-hover text-bdas-ink-body"}`}
                    >
                      {STATUS_LABEL[m.status]}
                    </span>
                  </td>
                  <td className="p-3 text-bdas-ink-body">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString("de-DE") : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-bdas-ink-muted">
                    Keine Mitglieder.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <aside className="w-80 shrink-0 rounded-bdas border-l-2 border-bdas-red bg-bdas-surface p-4 shadow-bdas-card">
          <h3 className="text-lg font-semibold text-bdas-ink">
            {selected.firstName} {selected.lastName}
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between border-b border-bdas-soft pb-1">
              <dt className="text-bdas-ink-muted">Status</dt>
              <dd className="text-bdas-ink-body">{STATUS_LABEL[selected.status]}</dd>
            </div>
            <div className="flex justify-between border-b border-bdas-soft pb-1">
              <dt className="text-bdas-ink-muted">Gruppe</dt>
              <dd className="text-bdas-ink-body">
                {selected.primaryGroupId ? (groupNames[selected.primaryGroupId] ?? "—") : "—"}
              </dd>
            </div>
            <div className="flex justify-between border-b border-bdas-soft pb-1">
              <dt className="text-bdas-ink-muted">Beigetreten</dt>
              <dd className="text-bdas-ink-body">
                {selected.joinedAt ? new Date(selected.joinedAt).toLocaleDateString("de-DE") : "—"}
              </dd>
            </div>
          </dl>
          <MemberGroupPanel
            member={selected}
            open={openByMember[selected.id] ?? null}
            groupNames={groupNames}
            revalidatePath={revalidatePath}
            rejectionCategories={rejectionCategories}
          />
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mt-4 text-sm text-bdas-ink-muted hover:text-bdas-ink"
          >
            Schließen
          </button>
        </aside>
      )}
    </div>
  );
}
