"use client";

import { useState, useTransition } from "react";

import { voteEntryAction } from "./actions";

/**
 * One vote per member per entry, changeable (Spec §3). The module exports
 * aggregates only (`feedbackCounts`) and no per-user read service, so the pressed
 * state here is deliberately session-local: after a reload both thumbs render
 * unpressed. Voting again simply upserts the same row.
 */
export function FeedbackButtons({ entryId }: { entryId: string }) {
  const [vote, setVote] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  function cast(helpful: boolean) {
    const previous = vote;
    setVote(helpful);
    setFailed(false);
    start(async () => {
      const res = await voteEntryAction(entryId, helpful);
      if (!res.ok) {
        setVote(previous);
        setFailed(true);
      }
    });
  }

  const base =
    "rounded-bdas-sm border px-2 py-0.5 font-semibold transition-colors duration-bdas-quick ease-bdas disabled:opacity-40";
  const on = "border-bdas-red text-bdas-red";
  const off = "border-bdas-soft text-bdas-ink-muted hover:bg-bdas-overlay-hover";

  return (
    <span className="flex items-center gap-1.5">
      <span>War das hilfreich?</span>
      <button
        type="button"
        disabled={pending}
        aria-pressed={vote === true}
        aria-label="Hilfreich"
        onClick={() => cast(true)}
        className={`${base} ${vote === true ? on : off}`}
      >
        👍
      </button>
      <button
        type="button"
        disabled={pending}
        aria-pressed={vote === false}
        aria-label="Nicht hilfreich"
        onClick={() => cast(false)}
        className={`${base} ${vote === false ? on : off}`}
      >
        👎
      </button>
      {failed && <span className="text-bdas-red">Konnte nicht gespeichert werden.</span>}
    </span>
  );
}
