"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Input } from "@bdas/design-system";

import { registerGuestAction, type GuestRegState } from "./actions";

const initial: GuestRegState = {};

/** Public sign-up for non-members on events that opted into guest registration. */
export function GuestRegisterForm({ eventId }: { eventId: string }) {
  const [state, action] = useFormState(registerGuestAction, initial);

  if (state.ok) {
    return (
      <Alert variant="success" title="Anmeldung bestätigt">
        {state.waitlisted
          ? "Die Veranstaltung ist ausgebucht — du stehst auf der Warteliste und rückst automatisch nach."
          : "Deine Anmeldung ist eingegangen."}{" "}
        Wir haben dir eine Bestätigung per E-Mail geschickt. Über den Link darin kannst du dich
        jederzeit wieder abmelden.
      </Alert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <input type="hidden" name="eventId" value={eventId} />

      <Field label="Name" htmlFor="guest-name">
        <Input id="guest-name" name="name" required minLength={2} autoComplete="name" />
      </Field>
      <Field label="E-Mail" htmlFor="guest-email">
        <Input id="guest-email" name="email" type="email" required autoComplete="email" />
      </Field>

      <label className="flex items-start gap-2 text-sm text-bdas-ink-body">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>
          Ich bin damit einverstanden, dass mein Name und meine E-Mail-Adresse zur Verwaltung meiner
          Anmeldung gespeichert und verarbeitet werden. Mehr dazu in der{" "}
          <a href="/datenschutz" className="text-bdas-red hover:underline">
            Datenschutzerklärung
          </a>
          .
        </span>
      </label>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "…" : "Als Gast anmelden"}
    </Button>
  );
}
