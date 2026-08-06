"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Input } from "@bdas/design-system";

import { type EmailRegistrantsState, emailRegistrantsAction } from "../actions";

const initial: EmailRegistrantsState = {};

export function EmailRegistrants({
  eventId,
  recipientCount,
}: {
  eventId: string;
  recipientCount: number;
}) {
  const [state, action] = useFormState(emailRegistrantsAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.ok ? (
        <Alert variant="success">
          Nachricht an {state.count} bestätigte Teilnehmende gesendet.
        </Alert>
      ) : null}
      <Input name="subject" placeholder="Betreff" maxLength={200} required />
      <textarea
        name="body"
        placeholder="Nachricht an alle bestätigten Teilnehmenden"
        rows={5}
        maxLength={5000}
        required
        className="block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2.5 text-base text-bdas-ink placeholder:text-bdas-ink-muted transition-colors duration-bdas-quick ease-bdas focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20"
      />
      <Submit recipientCount={recipientCount} />
    </form>
  );
}

function Submit({ recipientCount }: { recipientCount: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending || recipientCount === 0}>
      {pending ? "Wird gesendet…" : `An ${recipientCount} senden`}
    </Button>
  );
}
