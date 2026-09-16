"use client";

import React, { useMemo, useState, useTransition } from "react";

import type { Member, MemberStatus, OpenGroupChange, RejectionCategory } from "@bdas/members";

import { MemberGroupPanel } from "./MemberGroupPanel";
import { grantRoleAction, revokeRoleAction } from "./role-actions";

const STATUS_LABEL: Record<MemberStatus, string> = {
  pending: "Ausstehend",
  active: "Aktiv",
};
type MemberFilter = "all" | "active" | "alumnus";

/** No `pending` filter: an applicant is no longer a member row awaiting a
 *  verdict but a request on the group's Bewerbungen queue (ADR 0031).
 *  „Alumni" ist kein Status mehr, sondern die Grant-Kennzeichnung (ADR 0043). */
const FILTERS: ReadonlyArray<{ key: MemberFilter; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Aktiv" },
  { key: "alumnus", label: "Alumni" },
];

export function MembersTable({
  members,
  groupNames,
  alumnusScopes,
  openChanges,
  revalidatePath,
  rejectionCategories,
}: {
  members: Member[];
  groupNames: Record<string, string>;
  /** Scopes der aktiven alumnus-Grants je Mitglied (ADR 0043) — die
   *  Kennzeichnung kommt aus den Grants, nicht aus dem Status, und der Scope
   *  bleibt beim Gruppenwechsel die Herkunftsgruppe. */
  alumnusScopes: Record<string, ReadonlyArray<string | null>>;
  openChanges: OpenGroupChange[];
  revalidatePath: string;
  rejectionCategories: ReadonlyArray<{ key: RejectionCategory; label: string }>;
}) {
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  const [marking, startMarking] = useTransition();

  const openByMember = useMemo(
    () =>
      Object.fromEntries(openChanges.map((c) => [c.memberId, c])) as Record<
        string,
        OpenGroupChange | undefined
      >,
    [openChanges],
  );

  const isAlumnus = useMemo(() => new Set(Object.keys(alumnusScopes)), [alumnusScopes]);

  const rows = useMemo(
    () =>
      members.filter(
        (m) =>
          (filter === "all" ||
            (filter === "alumnus" ? isAlumnus.has(m.id) : m.status === filter)) &&
          (q.trim() === "" ||
            `${m.firstName} ${m.lastName}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [members, filter, q, isAlumnus],
  );

  /** Setzt die Markierung im Scope der heutigen Gruppe; entfernt sie in jedem
   *  Scope, in dem sie vergeben wurde. Wer darf, prüft requireCanGrant
   *  serverseitig je Scope (ADR 0043 §3) — die erste Ablehnung bricht ab. */
  async function toggleAlumnus(member: Member): Promise<{ ok: boolean; error?: string }> {
    const scopes = alumnusScopes[member.id];
    if (!scopes) {
      return grantRoleAction(member.id, "alumnus", member.primaryGroupId, revalidatePath);
    }
    for (const scope of scopes) {
      const res = await revokeRoleAction(member.id, "alumnus", scope, revalidatePath);
      if (!res.ok) return res;
    }
    return { ok: true };
  }

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
                  <td
                    className="cursor-pointer p-3 text-bdas-ink"
                    onClick={() => {
                      setSelected(m);
                      setMarkError(null);
                    }}
                  >
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
                    {isAlumnus.has(m.id) && (
                      <span className="ml-1 rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-ink-muted">
                        Alumnus
                      </span>
                    )}
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
            <div className="flex items-center justify-between gap-2 border-b border-bdas-soft pb-1">
              <dt className="text-bdas-ink-muted">Alumnus</dt>
              <dd>
                {/* Markieren nur Aufgenommene (grantRole erzwingt das);
                    eine vorhandene Markierung bleibt immer entfernbar. */}
                {selected.status === "active" || isAlumnus.has(selected.id) ? (
                  <button
                    type="button"
                    disabled={marking}
                    onClick={() =>
                      startMarking(async () => {
                        const res = await toggleAlumnus(selected);
                        setMarkError(res.ok ? null : (res.error ?? "Fehler"));
                      })
                    }
                    className="rounded-bdas-pill border border-bdas-soft px-3 py-1 text-sm text-bdas-ink-body transition-colors hover:bg-bdas-surface-hover disabled:opacity-50"
                  >
                    {isAlumnus.has(selected.id) ? "Markierung entfernen" : "Als Alumnus markieren"}
                  </button>
                ) : (
                  <span className="text-bdas-ink-muted">—</span>
                )}
              </dd>
            </div>
            {markError ? <p className="text-sm text-bdas-red">{markError}</p> : null}
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
