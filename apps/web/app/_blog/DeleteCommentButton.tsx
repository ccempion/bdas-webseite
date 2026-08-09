"use client";

import { useFormState, useFormStatus } from "react-dom";

import { deleteCommentAction, type ActionState } from "../blog/actions";

const initialState: ActionState = {};

/** Author/board delete control for one comment. Confirms before firing. */
export function DeleteCommentButton({ commentId }: { commentId: string }) {
  const [state, action] = useFormState(deleteCommentAction, initialState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Diesen Kommentar wirklich löschen?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="commentId" value={commentId} />
      <DeleteButton />
      {state.error ? <span className="ml-2 text-bdas-red">{state.error}</span> : null}
    </form>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-bdas-ink-muted hover:text-bdas-red"
    >
      {pending ? "Wird gelöscht…" : "Löschen"}
    </button>
  );
}
