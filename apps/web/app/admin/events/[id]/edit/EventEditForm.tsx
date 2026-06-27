"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Form } from "@bdas/design-system";

import { EventFields, type EventDefaults } from "../../_editor/EventFields";
import { updateEventAction, type EventFormState } from "../../actions";

export function EventEditForm({ d }: { d: Omit<EventDefaults, "errors"> }) {
  const [state, action] = useFormState(updateEventAction, {} as EventFormState);
  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <input type="hidden" name="eventId" value={d.eventId} />
      <EventFields d={{ ...d, errors: state.fields }} />
      <Submit />
    </Form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert…" : "Speichern"}
    </Button>
  );
}
