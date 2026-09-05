"use client";

import React, { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Combobox, Field, Form, Input } from "@bdas/design-system";

import type { ProfileFormState } from "./actions";

export type ProfileFormProps = {
  initial: {
    firstName: string;
    lastName: string;
    primaryGroupId: string | null;
  };
  groups: Array<{ id: string; slug: string; name: string; city: string }>;
  isNew: boolean;
  openChangeGroupName: string | null;
  /** Owned by EditableProfile: a save that completes the profile unmounts this
   *  form, so the action state has to outlive it. */
  state: ProfileFormState;
  action: (formData: FormData) => void;
};

export function ProfileForm({
  initial: data,
  groups,
  isNew,
  openChangeGroupName,
  state,
  action,
}: ProfileFormProps) {
  const [groupId, setGroupId] = useState(data.primaryGroupId ?? "");
  const [confirmExit, setConfirmExit] = useState(false);

  // A brand-new profile has no group to leave — createProfile (ADR 0021)
  // writes the first pick directly, so "— keine Gruppe —" is already the
  // unpicked default and needs no explicit option here.
  const groupOptions = useMemo(
    () => [
      ...(isNew ? [] : [{ value: "", label: "— keine Gruppe —" }]),
      ...groups.map((g) => ({ value: g.id, label: `${g.name} (${g.city})` })),
    ],
    [groups, isNew],
  );

  function pickGroup(next: string) {
    setGroupId(next);
    setConfirmExit(false);
  }

  // Same reasoning: a brand-new profile's first group pick is an application,
  // not a transfer — neither warning applies.
  const currentGroupId = data.primaryGroupId ?? "";
  const isTransfer = !isNew && groupId !== "" && groupId !== currentGroupId;
  const isExit = !isNew && groupId === "" && currentGroupId !== "";
  const targetGroup = isTransfer ? groups.find((g) => g.id === groupId) : undefined;

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
        <Combobox
          id="primaryGroupId"
          name="primaryGroupId"
          label="Hochschulgruppe"
          placeholder="— keine Gruppe —"
          options={groupOptions}
          value={groupId}
          onChange={pickGroup}
        />
        {openChangeGroupName ? (
          <p className="mt-1 text-sm text-bdas-ink-muted">
            Ein Wechsel zu {openChangeGroupName} ist beantragt. Eine andere Auswahl ersetzt den
            Antrag; die aktuelle Gruppe erneut zu wählen zieht ihn zurück.
          </p>
        ) : null}
        {isTransfer ? (
          <Alert variant="info" className="mt-2">
            Achtung: Der Wechsel zu {targetGroup?.name ?? "der gewählten Gruppe"} muss vom dortigen
            Vorstand freigegeben werden. Bis zur Freigabe bleibst du vollständig Mitglied deiner
            aktuellen Gruppe. Erst mit der Freigabe verlierst du deine Rechte in deiner bisherigen
            Gruppe (z. B. ein Vorstandsamt dort).
          </Alert>
        ) : null}
        {isExit ? (
          <Alert variant="info" className="mt-2">
            <p>
              Achtung: Der Austritt aus deiner aktuellen Gruppe erfolgt sofort, ohne Freigabe durch
              den Vorstand. Du verlierst umgehend deine Mitgliedschaft und deine Rechte in dieser
              Gruppe (z. B. ein Vorstandsamt). Das lässt sich nicht rückgängig machen — ein späterer
              erneuter Beitritt braucht wieder eine Freigabe.
            </p>
            <label className="mt-2 flex items-start gap-2 text-sm text-bdas-ink-body">
              <input
                type="checkbox"
                checked={confirmExit}
                onChange={(e) => setConfirmExit(e.target.checked)}
                className="mt-0.5 accent-bdas-red"
              />
              <span>
                Ich habe verstanden, dass ich sofort aus meiner Gruppe austrete und das nicht
                rückgängig machen kann.
              </span>
            </label>
          </Alert>
        ) : null}
      </Field>
      <SubmitButton isNew={isNew} disabled={isExit && !confirmExit} />
    </Form>
  );
}

function SubmitButton({ isNew, disabled }: { isNew: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  const label = isNew ? "Profil einreichen" : "Speichern";
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Wird gespeichert…" : label}
    </Button>
  );
}
