"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input } from "@bdas/design-system";

import { createEventAction, type EventFormState } from "./actions";

const SELECT_CLASS =
  "block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2.5 " +
  "text-base text-bdas-ink focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20";

const initialState: EventFormState = {};

/**
 * Minimal "create draft" form. Rich content (cover, formatted body, inline
 * images, location, deadline) is added afterwards on the edit page — creating
 * the draft first is what gives the editor an event id to upload against.
 */
export function EventForm({
  groups,
  allowFederation,
}: {
  groups: ReadonlyArray<{ id: string; name: string }>;
  allowFederation: boolean;
}) {
  const [state, action] = useFormState(createEventAction, initialState);
  const err = (k: string) => (state.fields?.[k] ? { error: state.fields[k] } : {});

  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <p className="text-sm text-bdas-ink-muted">
        Lege zuerst die Eckdaten an. Titelbild, Beschreibung, Bilder und Ort fügst du anschließend
        im Bearbeiten-Schritt hinzu.
      </p>

      <Field label="Titel" htmlFor="title" {...err("title")}>
        <Input id="title" name="title" required />
      </Field>

      <Field
        label="Kurzbeschreibung (optional)"
        htmlFor="summary"
        hint="1–2 Sätze für die Übersicht."
      >
        <Input id="summary" name="summary" maxLength={300} />
      </Field>

      <Field label="Beginn" htmlFor="startsAt" {...err("startsAt")}>
        <Input id="startsAt" name="startsAt" type="datetime-local" required />
      </Field>

      <Field label="Ende (optional)" htmlFor="endsAt" {...err("endsAt")}>
        <Input id="endsAt" name="endsAt" type="datetime-local" />
      </Field>

      <Field
        label="Kapazität (optional)"
        htmlFor="capacity"
        hint="Leer lassen = unbegrenzt."
        {...err("capacity")}
      >
        <Input id="capacity" name="capacity" type="number" min={1} />
      </Field>

      <Field label="Sichtbarkeit" htmlFor="visibility" {...err("visibility")}>
        <select
          id="visibility"
          name="visibility"
          defaultValue="members_only"
          className={SELECT_CLASS}
        >
          <option value="public">Öffentlich</option>
          <option value="members_only">Nur Mitglieder</option>
          <option value="group_only">Nur Gruppe</option>
        </select>
      </Field>

      <Field label="Gruppe" htmlFor="groupId" {...err("groupId")}>
        <select
          id="groupId"
          name="groupId"
          defaultValue={allowFederation ? "" : (groups[0]?.id ?? "")}
          className={SELECT_CLASS}
        >
          {allowFederation ? <option value="">Föderationsweit</option> : null}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>

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
