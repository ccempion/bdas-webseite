"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Form } from "@bdas/design-system";

import { EventFields } from "./_editor/EventFields";
import { createEventAction, type EventFormState } from "./actions";

const initialState: EventFormState = {};

export function EventForm({
  groups,
  allowFederation,
}: {
  groups: ReadonlyArray<{ id: string; name: string }>;
  allowFederation: boolean;
}) {
  const [state, action] = useFormState(createEventAction, initialState);

  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <EventFields
        d={{
          eventId: "",
          title: "",
          summary: null,
          content: null,
          coverImageKey: null,
          startsAtLocal: "",
          endsAtLocal: "",
          registrationDeadlineLocal: "",
          capacity: null,
          visibility: "members_only",
          location: null,
          groups,
          allowFederation,
          groupId: allowFederation ? null : (groups[0]?.id ?? null),
          errors: state.fields,
        }}
      />
      <SubmitButton />
    </Form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird angelegt…" : "Veranstaltung anlegen"}
    </Button>
  );
}
