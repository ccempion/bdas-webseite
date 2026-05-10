"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input } from "@bdas/design-system";

import { saveProfileAction, type ProfileFormState } from "./actions";

export type ProfileFormProps = {
  initial: {
    firstName: string;
    lastName: string;
    primaryGroupId: string | null;
  };
  groups: Array<{ id: string; slug: string; name: string; city: string }>;
  isNew: boolean;
};

const initial: ProfileFormState = {};

export function ProfileForm({ initial: data, groups, isNew }: ProfileFormProps) {
  const [state, action] = useFormState(saveProfileAction, initial);
  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <Field
        label="Vorname"
        htmlFor="firstName"
        {...(state.fields?.["firstName"] ? { error: state.fields["firstName"] } : {})}
      >
        <Input
          id="firstName"
          name="firstName"
          autoComplete="given-name"
          defaultValue={data.firstName}
          required
        />
      </Field>
      <Field
        label="Nachname"
        htmlFor="lastName"
        {...(state.fields?.["lastName"] ? { error: state.fields["lastName"] } : {})}
      >
        <Input
          id="lastName"
          name="lastName"
          autoComplete="family-name"
          defaultValue={data.lastName}
          required
        />
      </Field>
      <Field label="Hochschulgruppe" htmlFor="primaryGroupId">
        <select
          id="primaryGroupId"
          name="primaryGroupId"
          defaultValue={data.primaryGroupId ?? ""}
          className="block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2.5 text-base text-bdas-ink transition-colors duration-bdas-quick ease-bdas focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20"
        >
          <option value="">— keine Gruppe —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.city})
            </option>
          ))}
        </select>
      </Field>
      <SubmitButton isNew={isNew} />
    </Form>
  );
}

function SubmitButton({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  const label = isNew ? "Profil einreichen" : "Speichern";
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert…" : label}
    </Button>
  );
}
