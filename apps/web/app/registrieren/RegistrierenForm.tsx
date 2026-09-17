"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input, PasswordInput } from "@bdas/design-system";

import { registerAction, type RegisterFormState } from "./actions";
import { ConsentFields } from "./ConsentFields";

const initial: RegisterFormState = {};

export function RegistrierenForm({
  privacyUrl,
  passwordHint,
  newsletterOn,
}: {
  privacyUrl: string;
  passwordHint: string;
  newsletterOn: boolean;
}) {
  const [state, action] = useFormState(registerAction, initial);
  const consentError = state.fields?.["consent"];
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
        hint={passwordHint}
        {...(state.fields?.["password"] ? { error: state.fields["password"] } : {})}
      >
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>
      <ConsentFields
        privacyUrl={privacyUrl}
        newsletterOn={newsletterOn}
        consentError={consentError}
      />
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
