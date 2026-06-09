"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input } from "@bdas/design-system";

import { resendAction, type ResendFormState } from "./actions";

const initial: ResendFormState = {};

export function ResendForm() {
  const [state, action] = useFormState(resendAction, initial);

  if (state.sent) {
    return (
      <Alert variant="success" title="E-Mail gesendet">
        Falls ein unbestätigtes Konto mit dieser Adresse existiert, haben wir dir einen neuen
        Bestätigungslink geschickt. Der Link ist 24 Stunden gültig. Prüfe auch deinen Spam-Ordner.
      </Alert>
    );
  }

  return (
    <Form action={action}>
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
      {pending ? "Wird gesendet…" : "Bestätigungsmail senden"}
    </Button>
  );
}
