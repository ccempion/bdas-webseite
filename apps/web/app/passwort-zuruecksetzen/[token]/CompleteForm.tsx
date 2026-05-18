"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input } from "@bdas/design-system";

import { completeResetAction, type CompleteResetState } from "../actions";

const initial: CompleteResetState = {};

export function CompleteResetForm({
  token,
  passwordHint,
}: {
  token: string;
  passwordHint: string;
}) {
  const [state, action] = useFormState(completeResetAction, initial);
  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <Field label="Neues Passwort" htmlFor="password" hint={passwordHint}>
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
      {pending ? "Wird gespeichert…" : "Passwort speichern"}
    </Button>
  );
}
