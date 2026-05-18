"use client";

import { useFormState, useFormStatus } from "react-dom";

import { PASSWORD_RULE_HINT } from "@bdas/auth";
import { Alert, Button, Field, Form, Input } from "@bdas/design-system";

import { registerAction, type RegisterFormState } from "./actions";

const initial: RegisterFormState = {};

export function RegistrierenForm({ privacyUrl }: { privacyUrl: string }) {
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
        hint={PASSWORD_RULE_HINT}
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
      <div className="flex flex-col gap-1">
        <label htmlFor="consent" className="flex items-start gap-2 text-sm text-bdas-ink-body">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            value="true"
            required
            aria-describedby={consentError ? "consent-error" : undefined}
            className="mt-0.5 accent-bdas-red"
          />
          <span>
            Ich habe die{" "}
            <a
              href={privacyUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-bdas-red hover:underline"
            >
              Datenschutzerklärung
            </a>{" "}
            gelesen und stimme der Verarbeitung meiner Daten zu.
          </span>
        </label>
        {consentError ? (
          <p id="consent-error" role="alert" className="text-sm text-bdas-red">
            {consentError}
          </p>
        ) : null}
      </div>
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
