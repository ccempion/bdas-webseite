"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { createCommentAction, type CommentFormState } from "../blog/actions";
import { TEXTAREA_CLASS } from "./form-styles";

const initialState: CommentFormState = {};
const MAX = 1000;

/** Plain-text composer. Comments are capped at 1000 characters (ADR 0033). */
export function CommentForm({ postId }: { postId: string }) {
  const [state, action] = useFormState(createCommentAction, initialState);
  const [body, setBody] = useState("");

  // `state` is a fresh object on every action return, so this effect re-fires
  // on each successful post (not just the first) — the textarea and its
  // counter, now both driven by `body`, clear together instead of the
  // counter going stale once the (uncontrolled) field reset on its own.
  useEffect(() => {
    if (state.success) setBody("");
  }, [state]);

  return (
    <form action={action} className="mt-5 flex flex-col gap-2 border-t border-bdas-soft pt-5">
      <input type="hidden" name="postId" value={postId} />
      <label htmlFor="body" className="sr-only">
        Kommentar
      </label>
      <textarea
        id="body"
        name="body"
        rows={3}
        maxLength={MAX}
        required
        placeholder="Schreib einen Kommentar …"
        className={TEXTAREA_CLASS}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-describedby={state.error ? "comment-count comment-error" : "comment-count"}
      />
      <div className="flex items-center justify-between">
        <span id="comment-count" aria-live="polite" className="text-xs text-bdas-ink-muted">
          {body.length}/{MAX}
        </span>
        <SubmitButton />
      </div>
      {state.error ? (
        <span id="comment-error" role="alert" className="text-sm text-bdas-red">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-bdas bg-bdas-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Wird gesendet…" : "Kommentieren"}
    </button>
  );
}
