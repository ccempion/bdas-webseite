"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input } from "@bdas/design-system";

import { registerAction, type RegisterFormState } from "./actions.js";

const initial: RegisterFormState = {};

export function RegistrierenForm() {
  const [state, action] = useFormState(registerAction, initial);
  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <Field label="Vorname" htmlFor="firstName">
        <Input id="firstName" name="firstName" autoComplete="given-name" required />
      </Field>
      <Field label="Nachname" htmlFor="lastName">
        <Input id="lastName" name="lastName" autoComplete="family-name" required />
      </Field>
      <Field
        label="E-Mail"
        htmlFor="email"
        hint="Wir verwenden sie für die Anmeldung und wichtige Mitteilungen."
        {...(state.fields?.["email"] ? { error: state.fields["email"] } : {})}
      >
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field
        label="Passwort"
        htmlFor="password"
        hint="Mindestens 12 Zeichen."
        {...(state.fields?.["password"] ? { error: state.fields["password"] } : {})}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </Field>
      <SubmitButton />
    </Form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird erstellt…" : "Konto erstellen"}
    </Button>
  );
}
