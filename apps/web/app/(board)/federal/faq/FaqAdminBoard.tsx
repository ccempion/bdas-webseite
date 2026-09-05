"use client";

import { useState, useTransition } from "react";

import type { FaqEntry, FaqTopic, FeedbackCounts } from "@bdas/faq";

import { SECTION_LABELS, VORSTAND_SUBGROUP_LABELS } from "../../../../lib/faq/assemble";
import {
  deleteEntryAction,
  publishEntryAction,
  reorderEntriesAction,
  unpublishEntryAction,
} from "./actions";
import { FaqEntryDialog, type FaqEntryDialogInitial } from "./FaqEntryDialog";
import { groupByScope } from "./group-entries";
import { TopicsPanel } from "./TopicsPanel";

const EMPTY_ENTRY: FaqEntryDialogInitial = {
  section: "mitglieder",
  subgroup: null,
  topicId: null,
  question: "",
  body: { type: "doc", content: [] },
  youtubeId: null,
  relatedIds: [],
  contexts: [],
};

function toInitial(entry: FaqEntry): FaqEntryDialogInitial {
  return {
    id: entry.id,
    section: entry.section,
    subgroup: entry.subgroup,
    topicId: entry.topicId,
    question: entry.question,
    body: entry.body,
    youtubeId: entry.youtubeId,
    relatedIds: entry.relatedIds,
    contexts: entry.contexts,
  };
}

export function FaqAdminBoard({
  entries,
  topics,
  feedbackByEntry,
}: {
  entries: readonly FaqEntry[];
  topics: readonly FaqTopic[];
  feedbackByEntry: Record<string, FeedbackCounts>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    initial: FaqEntryDialogInitial;
    currentStatus: "draft" | "published" | null;
  } | null>(null);

  const allEntries = entries.map((e) => ({ id: e.id, question: e.question }));
  const groups = groupByScope(entries);

  function move(group: ReturnType<typeof groupByScope>[number], index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= group.entries.length) return;
    const orderedIds = group.entries.map((e) => e.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target]!, orderedIds[index]!];
    start(async () => {
      const res = await reorderEntriesAction(group.section, group.subgroup, orderedIds);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <TopicsPanel topics={topics} />
        <button
          type="button"
          onClick={() => setDialog({ initial: EMPTY_ENTRY, currentStatus: null })}
          className="self-start rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface"
        >
          + Eintrag
        </button>
      </div>
      {error && <p className="text-sm text-bdas-red">{error}</p>}
      {groups.map((group) => (
        <div
          key={`${group.section}:${group.subgroup ?? ""}`}
          className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card"
        >
          <h3 className="border-b border-bdas-soft px-4 py-2 text-sm font-bold text-bdas-ink">
            {SECTION_LABELS[group.section]}
            {group.subgroup ? ` · ${VORSTAND_SUBGROUP_LABELS[group.subgroup]}` : ""}
          </h3>
          {group.entries.map((entry, i) => {
            const counts = feedbackByEntry[entry.id] ?? { up: 0, down: 0 };
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center gap-3 border-b border-bdas-soft px-4 py-2 last:border-b-0"
              >
                <span
                  className={
                    entry.status === "published"
                      ? "rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-ink-muted"
                      : "rounded-bdas-pill border border-bdas-red px-2 py-0.5 text-xs font-semibold text-bdas-red"
                  }
                >
                  {entry.status === "published" ? "Veröffentlicht" : "Entwurf"}
                </span>
                <span className="flex-1 text-sm text-bdas-ink">{entry.question}</span>
                <span className="text-xs text-bdas-ink-muted">
                  👍 {counts.up} 👎 {counts.down}
                </span>
                <button
                  type="button"
                  disabled={i === 0 || pending}
                  onClick={() => move(group, i, -1)}
                  className="text-bdas-ink-muted disabled:opacity-30"
                  aria-label={`„${entry.question}" nach oben`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === group.entries.length - 1 || pending}
                  onClick={() => move(group, i, 1)}
                  className="text-bdas-ink-muted disabled:opacity-30"
                  aria-label={`„${entry.question}" nach unten`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDialog({ initial: toInitial(entry), currentStatus: entry.status })
                  }
                  className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs text-bdas-ink-body hover:bg-bdas-overlay-hover"
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res =
                        entry.status === "published"
                          ? await unpublishEntryAction(entry.id)
                          : await publishEntryAction(entry.id);
                      if (!res.ok) setError(res.error);
                    })
                  }
                  className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs text-bdas-ink-body hover:bg-bdas-overlay-hover"
                >
                  {entry.status === "published" ? "Zurückziehen" : "Veröffentlichen"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`„${entry.question}" endgültig löschen?`)) return;
                    start(async () => {
                      const res = await deleteEntryAction(entry.id);
                      if (!res.ok) setError(res.error);
                    });
                  }}
                  className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs text-bdas-ink-body hover:bg-bdas-red hover:text-bdas-surface"
                >
                  Löschen
                </button>
              </div>
            );
          })}
        </div>
      ))}
      {groups.length === 0 && (
        <p className="text-sm text-bdas-ink-muted">Noch keine Einträge — leg den ersten an.</p>
      )}
      {dialog && (
        <FaqEntryDialog
          open
          onClose={() => setDialog(null)}
          initial={dialog.initial}
          allEntries={allEntries}
          topics={topics}
          currentStatus={dialog.currentStatus}
        />
      )}
    </div>
  );
}
