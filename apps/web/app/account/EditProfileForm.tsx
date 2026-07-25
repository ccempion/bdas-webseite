"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Form } from "@bdas/design-system";
import { isKnownUniversity, SONSTIGE } from "@bdas/profile";

import { resolveUni, type WizardValues } from "../_profile/steps";
import {
  StudiumFields,
  UniGruppeFields,
  GeburtsdatumField,
  GefundenFields,
  FotoStep,
} from "../profil/ProfileFields";
import { saveProfileFieldsAction, type EditProfileState } from "./profile-actions";

export type EditProfileFormProps = {
  initial: {
    studiengang: string;
    abschlussart: string;
    uni: string;
    geburtsdatum: string;
    gefundenDurch: string;
    empfehlerName: string | null;
    photoStorageKey: string | null;
  };
  primaryGroupId: string | null;
  groups: ReadonlyArray<{ id: string; name: string; city: string }>;
};

function toWizardValues(
  initial: EditProfileFormProps["initial"],
  primaryGroupId: string | null,
): WizardValues {
  const stored = initial.uni;
  const [uni, uniOther] =
    stored === "" ? ["", ""] : isKnownUniversity(stored) ? [stored, ""] : [SONSTIGE, stored];

  return {
    studiengang: initial.studiengang,
    abschlussart: initial.abschlussart,
    uni,
    uniOther,
    primaryGroupId: primaryGroupId ?? "",
    geburtsdatum: initial.geburtsdatum,
    gefundenDurch: initial.gefundenDurch,
    empfehlerName: initial.empfehlerName ?? "",
    photoStorageKey: initial.photoStorageKey,
  };
}

const EMPTY_STATE: EditProfileState = {};

/** `/account` also renders the members profile form, which owns its own
 *  `primaryGroupId` select — namespace these ids so no two controls collide. */
const ID_PREFIX = "konto-";

export function EditProfileForm({ initial, primaryGroupId, groups }: EditProfileFormProps) {
  const [values, setValues] = useState<WizardValues>(() => toWizardValues(initial, primaryGroupId));
  const [state, action] = useFormState(saveProfileFieldsAction, EMPTY_STATE);

  const set: <K extends keyof WizardValues>(k: K, v: WizardValues[K]) => void = (k, v) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const errors = state.fields ?? {};

  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.notice ? <Alert variant="info">{state.notice}</Alert> : null}

      <StudiumFields values={values} set={set} errors={errors} idPrefix={ID_PREFIX} />
      <UniGruppeFields
        values={values}
        set={set}
        errors={errors}
        groups={groups}
        idPrefix={ID_PREFIX}
      />
      <GeburtsdatumField values={values} set={set} errors={errors} idPrefix={ID_PREFIX} />
      <GefundenFields values={values} set={set} errors={errors} idPrefix={ID_PREFIX} />
      <FotoStep values={values} set={set} />

      <input type="hidden" name="studiengang" value={values.studiengang} />
      <input type="hidden" name="abschlussart" value={values.abschlussart} />
      <input type="hidden" name="uni" value={resolveUni(values)} />
      <input type="hidden" name="primaryGroupId" value={values.primaryGroupId} />
      <input type="hidden" name="geburtsdatum" value={values.geburtsdatum} />
      <input type="hidden" name="gefundenDurch" value={values.gefundenDurch} />
      <input type="hidden" name="empfehlerName" value={values.empfehlerName} />
      <input type="hidden" name="photoStorageKey" value={values.photoStorageKey ?? ""} />

      <SubmitButton />
    </Form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert…" : "Speichern"}
    </Button>
  );
}
