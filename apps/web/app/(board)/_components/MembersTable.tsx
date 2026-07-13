"use client";

import { useMemo, useState, useTransition } from "react";

import type { IncomingGroupChange, Member, MemberStatus, OpenGroupChange } from "@bdas/members";

import { MemberGroupPanel } from "./MemberGroupPanel";
import { decideGroupChangeAction } from "./group-change-actions";
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
  openChanges,
  incoming = [],
  revalidatePath,
}: {
  members: Member[];
  groupNames: Record<string, string>;
  openChanges: OpenGroupChange[];
  /** Applicants from other groups. Empty on the federal page, which lists everyone anyway. */
  incoming?: IncomingGroupChange[];
  revalidatePath: string;
}) {
  const [filter, setFilter] = useState<"all" | MemberStatus>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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

  const decide = (requestId: string, decision: "approved" | "rejected") =>
    start(async () => {
      const res = await decideGroupChangeAction(requestId, decision, revalidatePath);
      setQueueError(res.ok ? null : (res.error ?? "Fehler"));
    });

  return (
    <div className="flex gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Outside the queue block: a failed decision revalidates, which can empty
            the queue entirely — the reason it failed has to outlive the rows. */}
        {queueError && (
          <p className="rounded-bdas border border-bdas-soft bg-bdas-surface p-3 text-sm text-bdas-red shadow-bdas-card">
            {queueError}
          </p>
        )}
        {incoming.length > 0 && (
          <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
            <h2 className="border-b border-bdas-soft p-3 text-sm font-semibold text-bdas-ink">
              Eingehende Wechselanträge ({incoming.length})
            </h2>
            <ul>
              {incoming.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 border-b border-bdas-soft p-3 text-sm last:border-b-0 hover:bg-bdas-surface-hover"
                >
                  <button
                    type="button"
                    onClick={() => setSelected(c.member)}
                    className="text-bdas-ink hover:text-bdas-red"
                  >
                    {c.member.firstName} {c.member.lastName} ›
                  </button>
                  <span className="rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-red">
                    {c.fromGroupId ? (groupNames[c.fromGroupId] ?? "—") : "keine Gruppe"} → uns
                  </span>
                  <span className="text-bdas-ink-muted">
                    seit {new Date(c.requestedAt).toLocaleDateString("de-DE")}
                  </span>
                  {c.canDecide ? (
                    <span className="ml-auto flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => decide(c.id, "approved")}
                        className="rounded-bdas-sm bg-bdas-red px-2 py-1 text-xs font-semibold text-bdas-surface"
                      >
                        Freigeben
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => decide(c.id, "rejected")}
                        className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs"
                      >
                        Ablehnen
                      </button>
                    </span>
                  ) : (
                    <span className="ml-auto text-xs text-bdas-ink-muted">
                      Entscheidet ein anderer Vorstand.
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
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
          {error && (
            <p className="border-b border-bdas-soft bg-bdas-surface-hover p-3 text-sm text-bdas-red">
              {error}
            </p>
          )}
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
                  <td className="p-3">
                    {m.status === "pending" && (
                      <span className="flex gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              const res = await approveMemberAction(m.id, revalidatePath);
                              setError(res.ok ? null : (res.error ?? "Fehler"));
                            })
                          }
                          className="rounded-bdas-sm bg-bdas-red px-2 py-1 text-xs font-semibold text-bdas-surface"
                        >
                          Freigeben
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              const res = await rejectMemberAction(m.id, revalidatePath);
                              setError(res.ok ? null : (res.error ?? "Fehler"));
                            })
                          }
                          className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs"
                        >
                          Ablehnen
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-bdas-ink-muted">
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
