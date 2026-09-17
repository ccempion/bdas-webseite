"use client";

import React, { useState, type FormEvent } from "react";

import { Button, Field, Input } from "@bdas/design-system";
import {
  fillText,
  MAX_NAME,
  type AnswerValue,
  type NameAnswer,
  type Question,
  type TextContext,
} from "@bdas/onboarding";

export function NameScreen({
  question,
  ctx,
  value,
  onAnswer,
}: {
  question: Extract<Question, { kind: "name" }>;
  ctx: TextContext;
  value: AnswerValue | undefined;
  onAnswer: (value: NameAnswer) => void;
}) {
  const initial = typeof value === "object" && "firstName" in value ? value : null;
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("Bitte gib Vor- und Nachnamen an.");
      return;
    }
    onAnswer({ firstName: firstName.trim(), lastName: lastName.trim() });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        {fillText(question.title, ctx)}
      </h2>
      <p className="-mt-3 text-sm text-bdas-ink-body">{fillText(question.help, ctx)}</p>
      <Field label="Vorname" htmlFor="onb-vorname" {...(error ? { error } : {})}>
        <Input
          id="onb-vorname"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
          maxLength={MAX_NAME}
          invalid={Boolean(error) && !firstName.trim()}
        />
      </Field>
      <Field label="Nachname" htmlFor="onb-nachname">
        <Input
          id="onb-nachname"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          autoComplete="family-name"
          maxLength={MAX_NAME}
          invalid={Boolean(error) && !lastName.trim()}
        />
      </Field>
      <div>
        <Button type="submit">Weiter</Button>
      </div>
    </form>
  );
}
