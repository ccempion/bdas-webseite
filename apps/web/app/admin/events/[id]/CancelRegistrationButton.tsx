"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button } from "@bdas/design-system";

import { type ActionState, cancelRegistrationAction } from "../actions";

const initial: ActionState = {};

export function CancelRegistrationButton({
  eventId,
  registrationId,
}: {
  eventId: string;
  registrationId: string;
}) {
  const [state, action] = useFormState(cancelRegistrationAction, initial);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Diese Anmeldung stornieren?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="registrationId" value={registrationId} />
      {state.error ? (
        <Alert variant="error" className="mb-2">
          {state.error}
        </Alert>
      ) : null}
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? "…" : "Stornieren"}
    </Button>
  );
}
