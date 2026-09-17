"use client";

import React, { useState } from "react";

import { Button, Field, Input } from "@bdas/design-system";
import {
  fillText,
  MAX_CITY,
  type AnswerValue,
  type FlowEnv,
  type PlaceAnswer,
  type Question,
  type TextContext,
} from "@bdas/onboarding";

import { groupInCity, MIN_QUERY, searchPlaces } from "../place-search";

const HIT =
  "flex w-full flex-col rounded-bdas border border-bdas-soft bg-bdas-surface px-4 py-3 text-left " +
  "transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-red/40";

function initialQuery(value: AnswerValue | undefined, env: FlowEnv): string {
  if (typeof value !== "object" || !("kind" in value)) return "";
  if (value.kind === "city") return value.city;
  if (value.kind === "group") return env.groups.find((g) => g.id === value.groupId)?.city ?? "";
  return "";
}

export function PlaceScreen({
  question,
  ctx,
  env,
  universities,
  value,
  onAnswer,
}: {
  question: Extract<Question, { kind: "place" }>;
  ctx: TextContext;
  env: FlowEnv;
  universities: ReadonlyArray<readonly [string, string]>;
  value: AnswerValue | undefined;
  onAnswer: (value: PlaceAnswer) => void;
}) {
  const [query, setQuery] = useState(() => initialQuery(value, env));
  const typed = query.trim();
  const tooShort = typed.length < MIN_QUERY;
  const hits = searchPlaces(typed, env.groups, universities);

  function goOn() {
    // Eine getippte Stadt mit Gruppe ist eine Gruppe — sonst landete man ohne Not im Netzwerk.
    const group = groupInCity(typed, env.groups);
    onAnswer(group ? { kind: "group", groupId: group.id } : { kind: "city", city: typed });
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        {fillText(question.title, ctx)}
      </h2>
      <Field label="Stadt oder Hochschule" htmlFor="onb-ort" hint={fillText(question.help, ctx)}>
        <Input
          id="onb-ort"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          maxLength={MAX_CITY}
          placeholder="z. B. Passau"
        />
      </Field>

      {hits.length > 0 ? (
        <ul aria-label="Treffer" className="flex flex-col gap-2">
          {hits.map((h) => (
            <li key={`${h.label}-${h.groupId}`}>
              <button
                type="button"
                className={HIT}
                onClick={() => onAnswer({ kind: "group", groupId: h.groupId })}
              >
                <span className="font-medium text-bdas-ink">✓ {h.label}</span>
                <span className="text-sm text-bdas-ink-muted">{h.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : !tooShort ? (
        <p
          aria-live="polite"
          className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-3 text-sm text-bdas-ink-body"
        >
          {fillText(question.noGroupHint, ctx, typed)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={tooShort} onClick={goOn}>
          Weiter
        </Button>
        {question.skippable ? (
          <Button type="button" variant="ghost" onClick={() => onAnswer({ kind: "skipped" })}>
            Überspringen
          </Button>
        ) : null}
      </div>
    </section>
  );
}
