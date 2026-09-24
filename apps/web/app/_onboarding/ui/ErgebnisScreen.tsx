import React, { type ReactNode } from "react";

import { Button } from "@bdas/design-system";
import { fillText, type Outcome, type TextContext } from "@bdas/onboarding/client";

import { BegriffText } from "../../_glossar/BegriffText";
import { ONBOARDING_WOERTER } from "../../_glossar/woerter";

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
  const seen = new Set<string>();
  const t = (text: string) => (
    <BegriffText text={fillText(text, ctx)} begriffe={ONBOARDING_WOERTER} seen={seen} />
  );
  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-bdas-ink-muted">
        Dein Ergebnis
      </p>
      <h2 tabIndex={-1} className="-mt-3 text-xl font-semibold text-bdas-ink outline-none">
        {t(outcome.title)}
      </h2>
      <ul className="flex flex-col gap-2">
        {outcome.benefits.map((b) => (
          <li key={b} className="flex gap-2 text-bdas-ink-body">
            <span aria-hidden>✓</span>
            <span>{t(b)}</span>
          </li>
        ))}
      </ul>
      {outcome.hint ? <p className="text-bdas-ink-body">{t(outcome.hint)}</p> : null}
      <div className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-4">
        <p className="font-semibold text-bdas-ink">Wer entscheidet?</p>
        <p className="text-bdas-ink-body">
          {t(outcome.decider)}, {outcome.duration}.
        </p>
      </div>
      <p className="font-medium text-bdas-ink">Passt das so?</p>
      <div className="flex flex-wrap gap-3">
        {confirm ?? (
          <Button type="button" onClick={onConfirm}>
            Passt so, Konto anlegen
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onChange}>
          Etwas ändern
        </Button>
      </div>
    </section>
  );
}
