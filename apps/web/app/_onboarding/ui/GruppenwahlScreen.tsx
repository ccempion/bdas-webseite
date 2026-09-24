"use client";

import React, { useState } from "react";

import { Field, Input } from "@bdas/design-system";
import {
  fillText,
  type AnswerValue,
  type FlowEnv,
  type PlaceAnswer,
  type Question,
  type TextContext,
} from "@bdas/onboarding/client";

import { BegriffText } from "../../_glossar/BegriffText";
import { ONBOARDING_WOERTER } from "../../_glossar/woerter";

const HIT =
  "flex w-full flex-col rounded-bdas border border-bdas-soft bg-bdas-surface px-4 py-3 text-left " +
  "transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-red/40";

const norm = (s: string): string => s.trim().toLocaleLowerCase("de");

/** Die Gruppe, der jemand beitreten will (Spec §2, Ausgang „beitreten"). */
export function GruppenwahlScreen({
  question,
  ctx,
  env,
  value,
  onAnswer,
}: {
  question: Extract<Question, { kind: "group_choice" }>;
  ctx: TextContext;
  env: FlowEnv;
  value: AnswerValue | undefined;
  onAnswer: (value: PlaceAnswer) => void;
}) {
  const [query, setQuery] = useState("");
  const chosen =
    typeof value === "object" && value !== null && "kind" in value && value.kind === "group"
      ? value.groupId
      : null;

  const q = norm(query);
  const groups = [...env.groups]
    .sort((a, b) => a.city.localeCompare(b.city, "de"))
    .filter((g) => q === "" || norm(g.name).includes(q) || norm(g.city).includes(q));

  return (
    <section className="flex flex-col gap-4">
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        {fillText(question.title, ctx)}
      </h2>
      <Field
        label="Gruppe suchen"
        htmlFor="onb-gruppe"
        hint={<BegriffText text={fillText(question.help, ctx)} begriffe={ONBOARDING_WOERTER} />}
      >
        <Input
          id="onb-gruppe"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          placeholder="z. B. Köln"
        />
      </Field>

      {groups.length === 0 ? (
        <p aria-live="polite" className="text-sm text-bdas-ink-body">
          Keine Gruppe gefunden. Probier es mit einem anderen Namen.
        </p>
      ) : (
        <ul aria-label="Gruppen" className="flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                aria-pressed={chosen === g.id}
                className={HIT}
                onClick={() => onAnswer({ kind: "group", groupId: g.id })}
              >
                <span className="font-medium text-bdas-ink">{g.name}</span>
                <span className="text-sm text-bdas-ink-muted">{g.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
