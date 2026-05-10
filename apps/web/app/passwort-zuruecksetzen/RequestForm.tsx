"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input } from "@bdas/design-system";

import { requestResetAction, type RequestResetState } from "./actions";

const initial: RequestResetState = {};

export function RequestResetForm() {
  const [state, action] = useFormState(requestResetAction, initial);

  if (state.sent) {
    return (
      <Alert variant="success" title="E-Mail versendet">
        Falls die E-Mail-Adresse bei uns registriert ist, haben wir dir einen Link zum Zurücksetzen
        geschickt. Der Link ist 1 Stunde gültig.
      </Alert>
    );
  }

  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <Field label="E-Mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton />
    </Form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gesendet…" : "Link senden"}
    </Button>
  );
}
