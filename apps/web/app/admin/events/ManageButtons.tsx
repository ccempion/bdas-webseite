"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button } from "@bdas/design-system";

import {
  type ActionState,
  cancelEventAction,
  deleteEventAction,
  publishEventAction,
} from "./actions";

const initial: ActionState = {};

export function ManageButtons({
  eventId,
  status,
}: {
  eventId: string;
  status: "draft" | "published" | "cancelled";
}) {
  const [pubState, publish] = useFormState(publishEventAction, initial);
  const [cancelState, cancel] = useFormState(cancelEventAction, initial);
  const [deleteState, remove] = useFormState(deleteEventAction, initial);
  const error = pubState.error ?? cancelState.error ?? deleteState.error;

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        {status === "draft" ? (
          <form action={publish}>
            <input type="hidden" name="eventId" value={eventId} />
            <SubmitButton variant="primary" label="Veröffentlichen" />
          </form>
        ) : null}
        {status !== "cancelled" ? (
          <form action={cancel}>
            <input type="hidden" name="eventId" value={eventId} />
            <SubmitButton variant="ghost" label="Absagen" />
          </form>
        ) : null}
        <form
          action={remove}
          onSubmit={(e) => {
            const msg =
              status === "draft"
                ? "Diesen Entwurf endgültig löschen?"
                : "Diese Veranstaltung und alle Anmeldungen endgültig löschen?";
            if (!window.confirm(msg)) e.preventDefault();
          }}
        >
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton variant="ghost" label="Löschen" />
        </form>
      </div>
    </div>
  );
}

function SubmitButton({ variant, label }: { variant: "primary" | "ghost"; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}
