"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input } from "@bdas/design-system";

import { loginAction, type LoginFormState } from "./actions";

const initial: LoginFormState = {};

export function AnmeldenForm() {
  const [state, action] = useFormState(loginAction, initial);
  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.needsVerification ? (
        <p className="text-sm text-bdas-ink-body">
          <Link href="/verifizierung-erneut-senden" className="text-bdas-red hover:underline">
            Bestätigungsmail erneut senden
          </Link>
        </p>
      ) : null}
      <Field label="E-Mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Passwort" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <div className="flex items-center justify-between">
        <Link href="/passwort-zuruecksetzen" className="text-sm text-bdas-red hover:underline">
          Passwort vergessen?
        </Link>
        <SubmitButton />
      </div>
    </Form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Anmelden…" : "Anmelden"}
    </Button>
  );
}
