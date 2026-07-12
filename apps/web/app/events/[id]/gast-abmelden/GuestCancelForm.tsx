"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button } from "@bdas/design-system";

import { cancelGuestAction, type GuestCancelState } from "./actions";

const initial: GuestCancelState = {};

export function GuestCancelForm({ eventId, token }: { eventId: string; token: string }) {
  const [state, action] = useFormState(cancelGuestAction, initial);

  if (state.ok) {
    return (
      <Alert variant="success" title="Abmeldung bestätigt">
        Deine Anmeldung wurde storniert. Schade, dass es nicht klappt — vielleicht beim nächsten
        Mal.
      </Alert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "…" : "Abmeldung bestätigen"}
    </Button>
  );
}
