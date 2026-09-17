"use client";

import React from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button } from "@bdas/design-system";
import type { Answers } from "@bdas/onboarding/client";

import { resumeJourneyAction, type ResumeState } from "../resume-action";

const initial: ResumeState = {};

export function ResumeButton({ answers, source }: { answers: Answers; source: string }) {
  const [state, action] = useFormState(resumeJourneyAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      <input type="hidden" name="from" value={source} />
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Einen Moment…" : "Passt — weiter"}
    </Button>
  );
}
