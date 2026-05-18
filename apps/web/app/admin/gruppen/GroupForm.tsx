"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input } from "@bdas/design-system";

import { saveGroupAction, type GroupFormState } from "./actions";

export type GroupFormProps = {
  /** Present → edit an existing group; absent → create. */
  groupId?: string;
  initial: {
    slug: string;
    name: string;
    city: string;
    contactEmail: string;
    instagramUrl: string;
    websiteUrl: string;
    status: string;
  };
};

const initialState: GroupFormState = {};

const SELECT_CLASS =
  "block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2.5 " +
  "text-base text-bdas-ink transition-colors duration-bdas-quick ease-bdas " +
  "focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20";

export function GroupForm({ groupId, initial }: GroupFormProps) {
  const [state, action] = useFormState(saveGroupAction, initialState);
  const isEdit = Boolean(groupId);
  const err = (k: string) => (state.fields?.[k] ? { error: state.fields[k] } : {});

  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      {isEdit ? (
        <>
          <input type="hidden" name="groupId" value={groupId} />
          <Field label="Kürzel (URL)" htmlFor="slug" hint="Nach dem Anlegen nicht mehr änderbar.">
            <Input id="slug" value={initial.slug} readOnly disabled />
          </Field>
        </>
      ) : (
        <Field
          label="Kürzel (URL)"
          htmlFor="slug"
          hint="Kleinbuchstaben, Bindestriche — z. B. „aachen“. Wird Teil der Adresse /gruppen/…"
          {...err("slug")}
        >
          <Input id="slug" name="slug" defaultValue={initial.slug} required />
        </Field>
      )}

      <Field label="Name" htmlFor="name" {...err("name")}>
        <Input id="name" name="name" defaultValue={initial.name} required />
      </Field>

      <Field label="Stadt" htmlFor="city" {...err("city")}>
        <Input id="city" name="city" defaultValue={initial.city} required />
      </Field>

      <Field label="Kontakt-E-Mail" htmlFor="contactEmail" {...err("contactEmail")}>
        <Input
          id="contactEmail"
          name="contactEmail"
          type="email"
          defaultValue={initial.contactEmail}
        />
      </Field>

      <Field label="Instagram-URL" htmlFor="instagramUrl" {...err("instagramUrl")}>
        <Input
          id="instagramUrl"
          name="instagramUrl"
          type="url"
          defaultValue={initial.instagramUrl}
        />
      </Field>

      <Field label="Website-URL" htmlFor="websiteUrl" {...err("websiteUrl")}>
        <Input id="websiteUrl" name="websiteUrl" type="url" defaultValue={initial.websiteUrl} />
      </Field>

      <Field
        label="Status"
        htmlFor="status"
        hint="Archivieren erfolgt über die Schaltfläche unten."
      >
        <select
          id="status"
          name="status"
          defaultValue={initial.status === "archived" ? "active" : initial.status}
          className={SELECT_CLASS}
        >
          <option value="active">Aktiv</option>
          <option value="dormant">Ruhend</option>
          <option value="new">Neu</option>
        </select>
      </Field>

      <SubmitButton isEdit={isEdit} />
    </Form>
  );
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert…" : isEdit ? "Änderungen speichern" : "Gruppe anlegen"}
    </Button>
  );
}
