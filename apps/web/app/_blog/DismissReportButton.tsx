"use client";

import { useFormState, useFormStatus } from "react-dom";

import { dismissReportAction, type ActionState } from "../blog/actions";

const initialState: ActionState = {};

export function DismissReportButton({ reportId }: { reportId: string }) {
  const [state, action] = useFormState(dismissReportAction, initialState);
  return (
    <form action={action}>
      <input type="hidden" name="reportId" value={reportId} />
      <SubmitButton />
      {state.error ? <span className="ml-2 text-bdas-red">{state.error}</span> : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="text-bdas-ink-muted hover:underline">
      {pending ? "Wird verworfen…" : "Meldung verwerfen"}
    </button>
  );
}
