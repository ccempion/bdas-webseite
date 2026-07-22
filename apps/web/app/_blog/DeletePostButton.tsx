"use client";

import { useFormState, useFormStatus } from "react-dom";

import { deletePostAction, type ActionState } from "../blog/actions";

const initialState: ActionState = {};

/** Author/board delete control. Confirms before firing the server action. */
export function DeletePostButton({ postId }: { postId: string }) {
  const [state, action] = useFormState(deletePostAction, initialState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Diesen Beitrag wirklich löschen?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <DeleteButton />
      {state.error ? <span className="ml-2 text-bdas-red">{state.error}</span> : null}
    </form>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="text-bdas-red hover:underline">
      {pending ? "Wird gelöscht…" : "Löschen"}
    </button>
  );
}
