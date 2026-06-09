"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button } from "@bdas/design-system";

import { cancelAction, registerAction, type RegState } from "./actions";

const initial: RegState = {};

export function RegisterControls({
  eventId,
  registered,
  waitlistPosition,
}: {
  eventId: string;
  registered: boolean;
  waitlistPosition: number | null;
}) {
  const [regState, register] = useFormState(registerAction, initial);
  const [cancelState, cancel] = useFormState(cancelAction, initial);
  const error = regState.error ?? cancelState.error;

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert variant="error">{error}</Alert> : null}

      {registered ? (
        <>
          {waitlistPosition !== null ? (
            <Alert variant="info" title="Auf der Warteliste">
              Du stehst auf Position {waitlistPosition} der Warteliste.
            </Alert>
          ) : (
            <Alert variant="success" title="Angemeldet">
              Du bist für diese Veranstaltung angemeldet.
            </Alert>
          )}
          <form action={cancel}>
            <input type="hidden" name="eventId" value={eventId} />
            <SubmitButton variant="secondary" label="Abmelden" />
          </form>
        </>
      ) : (
        <form action={register}>
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton variant="primary" label="Anmelden" />
        </form>
      )}
    </div>
  );
}

function SubmitButton({ variant, label }: { variant: "primary" | "secondary"; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}
