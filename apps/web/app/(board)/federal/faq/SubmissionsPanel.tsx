"use client";

import type { SubmissionCardView } from "./submission-view";

export function SubmissionsPanel({
  submissions,
  onAnswer,
  onDiscard,
  pending,
}: {
  submissions: readonly SubmissionCardView[];
  onAnswer: (card: SubmissionCardView) => void;
  onDiscard: (card: SubmissionCardView) => void;
  pending: boolean;
}) {
  if (submissions.length === 0) {
    return <p className="text-sm text-bdas-ink-muted">Keine offenen Fragen.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {submissions.map((s) => (
        <article
          key={s.id}
          className="rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card"
        >
          <h3 className="text-sm font-bold text-bdas-ink">{s.question}</h3>
          {s.details && <p className="mt-2 text-sm text-bdas-ink-body">{s.details}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-bdas-ink-muted">
            <span>{s.submitterName}</span>
            <span>
              {new Date(s.submittedAtIso).toLocaleDateString("de-DE", {
                timeZone: "Europe/Berlin",
              })}
            </span>
            {s.contextLabel && (
              <span className="rounded-bdas-pill border border-bdas-soft px-2 py-0.5 font-semibold">
                {s.contextLabel}
              </span>
            )}
            {s.draftEntryId !== null && (
              <span className="rounded-bdas-pill border border-bdas-red px-2 py-0.5 font-semibold text-bdas-red">
                Entwurf angelegt
              </span>
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => onAnswer(s)}
              className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-xs font-semibold text-bdas-surface disabled:opacity-40"
            >
              {s.draftEntryId !== null ? "Entwurf fortsetzen" : "Antwort verfassen"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onDiscard(s)}
              className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-xs text-bdas-ink-body hover:bg-bdas-overlay-hover disabled:opacity-40"
            >
              Verwerfen
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
