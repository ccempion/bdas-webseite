"use client";

import React, { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input, PasswordInput } from "@bdas/design-system";
import type { Answers, EntryContext } from "@bdas/onboarding/client";

import { Begriff } from "../../_glossar/Begriff";
import { ConsentFields } from "../../registrieren/ConsentFields";
import { createAccountAction, type CreateAccountState } from "../actions";

const initial: CreateAccountState = {};

export function KontoScreen({
  answers,
  entry,
  privacyUrl,
  passwordHint,
  newsletterOn,
  onSent,
}: {
  answers: Answers;
  entry: EntryContext;
  privacyUrl: string;
  passwordHint: string;
  newsletterOn: boolean;
  onSent: (email: string) => void;
}) {
  const [state, action] = useFormState(createAccountAction, initial);
  const sentTo = state.sentTo;
  useEffect(() => {
    if (sentTo) onSent(sentTo);
  }, [sentTo, onSent]);

  const err = (key: string) => (state.fields?.[key] ? { error: state.fields[key] } : {});

  return (
    <Form action={action}>
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        Fast geschafft, dein Konto
      </h2>
      <p className="-mt-2 text-sm text-bdas-ink-body">
        Mit E-Mail und Passwort meldest du dich später an.
      </p>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      <input type="hidden" name="from" value={entry.source} />
      <Field
        label="E-Mail"
        htmlFor="email"
        hint={
          <>
            Dorthin schicken wir den <Begriff k="bestaetigungslink">Bestätigungslink</Begriff>.
          </>
        }
        {...err("email")}
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={entry.email ?? ""}
          required
        />
      </Field>
      <Field label="Passwort" htmlFor="password" hint={passwordHint} {...err("password")}>
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
        consentError={state.fields?.["consent"]}
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
