import React from "react";

import { cx } from "@bdas/design-system";
import type { ChoiceOption } from "@bdas/onboarding";

import { Icon } from "./Icon";

const CARD =
  "flex w-full flex-col items-start gap-2 rounded-bdas border bg-bdas-surface p-4 text-left " +
  "shadow-bdas-card transition duration-bdas-soft ease-bdas " +
  "hover:shadow-bdas-lift-md motion-safe:hover:-translate-y-bdas-lift-sm " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-red/40";

/** Eine antippbare Antwort (Spec §2 Punkt 7). Markenrot nur im gewählten Zustand. */
export function AnswerCard({
  option,
  selected,
  onSelect,
}: {
  option: ChoiceOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(CARD, selected ? "border-bdas-red" : "border-bdas-soft")}
    >
      <span className={selected ? "text-bdas-red" : "text-bdas-ink-muted"}>
        <Icon name={option.icon} />
      </span>
      <span className="font-semibold text-bdas-ink">{option.label}</span>
      <span className="text-sm text-bdas-ink-body">{option.hint}</span>
    </button>
  );
}
