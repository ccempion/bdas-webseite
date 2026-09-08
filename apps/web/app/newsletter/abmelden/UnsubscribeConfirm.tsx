"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button } from "@bdas/design-system";

import { unsubscribeByTokenAction, type UnsubscribeState } from "./actions";

const initial: UnsubscribeState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Wird abgemeldet …" : "Ja, abmelden"}
    </Button>
  );
}

/**
 * The unsubscribe button. Deliberately a POST: mailbox scanners follow links in
 * email before a person ever sees them, and a GET here would quietly
 * unsubscribe people who never asked to be.
 */
export function UnsubscribeConfirm({ token, email }: { token: string; email: string }) {
  const [state, action] = useFormState(unsubscribeByTokenAction, initial);

  if (state.ok) {
    return (
      <Alert variant="success" title="Abgemeldet">
        Du bekommst von uns keinen Newsletter mehr. Schade — aber du kannst dich jederzeit wieder
        eintragen.
      </Alert>
    );
  }

  return (
    <>
      <p className="text-bdas-ink-body">
        Willst du <strong className="text-bdas-ink">{email}</strong> wirklich vom Newsletter
        abmelden?
      </p>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton />
      </form>
    </>
  );
}
