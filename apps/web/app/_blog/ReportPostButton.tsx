"use client";

import { useFormState, useFormStatus } from "react-dom";

import { reportPostAction, type ReportFormState } from "../blog/actions";
import { TEXTAREA_CLASS } from "./form-styles";

const initialState: ReportFormState = {};

/** Member-facing report control: a collapsed disclosure with an optional reason. */
export function ReportPostButton({ postId }: { postId: string }) {
  const [state, action] = useFormState(reportPostAction, initialState);

  if (state.success) {
    return <p className="text-sm text-bdas-ink-muted">Danke, die Meldung ist eingegangen.</p>;
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-bdas-ink-muted hover:text-bdas-red">
        Beitrag melden
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="postId" value={postId} />
        <textarea
          name="reason"
          maxLength={300}
          placeholder="Grund (optional)"
          className={TEXTAREA_CLASS}
        />
        <SubmitButton />
        {state.error ? <span className="text-bdas-red">{state.error}</span> : null}
      </form>
    </details>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="self-start text-bdas-red hover:underline">
      {pending ? "Wird gesendet…" : "Melden"}
    </button>
  );
}
