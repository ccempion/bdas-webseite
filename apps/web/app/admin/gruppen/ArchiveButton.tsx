"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button } from "@bdas/design-system";

import { archiveGroupAction, type GroupFormState } from "./actions";

const initialState: GroupFormState = {};

export function ArchiveButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [state, action] = useFormState(archiveGroupAction, initialState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `„${groupName}“ wirklich archivieren? Die Gruppe verschwindet von der öffentlichen Seite.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      {state.error ? (
        <Alert variant="error" className="mb-3">
          {state.error}
        </Alert>
      ) : null}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" disabled={pending}>
      {pending ? "Wird archiviert…" : "Gruppe archivieren"}
    </Button>
  );
}
