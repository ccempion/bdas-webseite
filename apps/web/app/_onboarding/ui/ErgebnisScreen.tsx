import React, { type ReactNode } from "react";

import { Button } from "@bdas/design-system";
import { fillText, type Outcome, type TextContext } from "@bdas/onboarding/client";

/** Ehrliches Ergebnis (Spec §2 Punkt 6): was man bekommt, wer entscheidet, wie lange. */
export function ErgebnisScreen({
  outcome,
  ctx,
  onConfirm,
  onChange,
  confirm,
}: {
  outcome: Outcome;
  ctx: TextContext;
  onConfirm: () => void;
  onChange: () => void;
  confirm?: ReactNode | undefined;
}) {
  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-bdas-ink-muted">
        Dein Ergebnis
      </p>
      <h2 tabIndex={-1} className="-mt-3 text-xl font-semibold text-bdas-ink outline-none">
        {fillText(outcome.title, ctx)}
      </h2>
      <ul className="flex flex-col gap-2">
        {outcome.benefits.map((b) => (
          <li key={b} className="flex gap-2 text-bdas-ink-body">
            <span aria-hidden>✓</span>
            <span>{fillText(b, ctx)}</span>
          </li>
        ))}
      </ul>
      {outcome.hint ? <p className="text-bdas-ink-body">{fillText(outcome.hint, ctx)}</p> : null}
      <div className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-4">
        <p className="font-semibold text-bdas-ink">Wer entscheidet?</p>
        <p className="text-bdas-ink-body">
          {fillText(outcome.decider, ctx)} — {outcome.duration}.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {confirm ?? (
          <Button type="button" onClick={onConfirm}>
            Passt — Konto anlegen
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onChange}>
          Doch etwas anderes
        </Button>
      </div>
    </section>
  );
}
