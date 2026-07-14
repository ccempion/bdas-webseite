"use client";

import { useEffect, useState, useTransition } from "react";

import type { GroupChangeRequest, Member, OpenGroupChange } from "@bdas/members";

import { decideGroupChangeAction, groupHistoryAction } from "./group-change-actions";
import { buildGroupTimeline, type TimelineEntry } from "./group-history";

const KIND_LABEL: Record<TimelineEntry["kind"], string> = {
  join: "Beitritt",
  pending: "beantragt",
  approved: "freigegeben",
  rejected: "abgelehnt",
  withdrawn: "zurückgezogen",
};

const fmt = (d: Date) => new Date(d).toLocaleDateString("de-DE");

/**
 * The transfer block of the member card: the open request (with the decision
 * buttons, if this board may decide) and the collapsed group history. History is
 * fetched when a member is opened — the members list itself stays one query.
 */
export function MemberGroupPanel({
  member,
  open,
  groupNames,
  revalidatePath,
}: {
  member: Member;
  open: OpenGroupChange | null;
  groupNames: Record<string, string>;
  revalidatePath: string;
}) {
  const [history, setHistory] = useState<GroupChangeRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    setHistory(null);
    setError(null);
    void groupHistoryAction(member.id).then((res) => {
      if (!live) return;
      if (res.ok && res.entries) setHistory(res.entries);
      else setError(res.error ?? "Verlauf nicht verfügbar.");
    });
    return () => {
      live = false;
    };
  }, [member.id]);

  const name = (id: string | null) => (id === null ? "keine Gruppe" : (groupNames[id] ?? "—"));
  const timeline = history ? buildGroupTimeline(member, history) : [];

  return (
    <div className="mt-4 flex flex-col gap-3">
      {open ? (
        <div className="rounded-bdas-sm border border-bdas-soft bg-bdas-surface-hover p-3">
          <p className="text-sm font-semibold text-bdas-red">Wechsel beantragt</p>
          <p className="mt-1 text-sm text-bdas-ink-body">
            {name(open.fromGroupId)} → {name(open.toGroupId)}
          </p>
          <p className="text-sm text-bdas-ink-muted">seit {fmt(open.requestedAt)}</p>
          {open.canDecide ? (
            <span className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await decideGroupChangeAction(open.id, "approved", revalidatePath);
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
                    const res = await decideGroupChangeAction(open.id, "rejected", revalidatePath);
                    setError(res.ok ? null : (res.error ?? "Fehler"));
                  })
                }
                className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs"
              >
                Ablehnen
              </button>
            </span>
          ) : (
            <p className="mt-2 text-xs text-bdas-ink-muted">
              Entscheidet der Vorstand von {name(open.toGroupId)}.
            </p>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-bdas-red">{error}</p> : null}

      {timeline.length > 0 ? (
        <details className="group rounded-bdas border border-bdas-soft bg-bdas-surface p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-bdas-ink">
            Gruppenverlauf ({timeline.length})
            <span className="text-bdas-red transition-transform duration-bdas-quick group-open:rotate-45">
              +
            </span>
          </summary>
          <ol className="mt-3 flex flex-col gap-2">
            {timeline.map((e) => (
              <li key={e.id} className="border-l-2 border-bdas-soft pl-3 text-sm">
                <p className="text-bdas-ink-body">
                  {e.kind === "join"
                    ? `Beitritt → ${name(e.toGroupId)}`
                    : `${name(e.fromGroupId)} → ${name(e.toGroupId)}`}
                </p>
                <p className="text-xs text-bdas-ink-muted">
                  {fmt(e.at)} · {KIND_LABEL[e.kind]}
                </p>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
