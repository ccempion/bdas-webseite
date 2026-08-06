"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Button, Form } from "@bdas/design-system";
import { canonicalUniversity, SONSTIGE } from "@bdas/profile";

import { resolveUni, type WizardValues } from "../_profile/steps";
import {
  StudiumFields,
  UniGruppeFields,
  GeburtsdatumField,
  GefundenFields,
} from "../profil/ProfileFields";
import type { EditProfileState } from "./profile-actions";

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
  /** Owned by EditableProfile — see ProfileFormProps.state. */
  state: EditProfileState;
  action: (formData: FormData) => void;
};

function toWizardValues(initial: EditProfileFormProps["initial"]): WizardValues {
  const stored = initial.uni;
  const listed = stored === "" ? null : canonicalUniversity(stored);
  const [uni, uniOther] =
    stored === "" ? ["", ""] : listed !== null ? [listed, ""] : [SONSTIGE, stored];

  return {
    studiengang: initial.studiengang,
    abschlussart: initial.abschlussart,
    uni,
    uniOther,
    // The group is owned by the members form on this page (see UniGruppeFields'
    // showGruppe): not shown, not submitted, so the action keeps the stored one.
    primaryGroupId: "",
    geburtsdatum: initial.geburtsdatum,
    gefundenDurch: initial.gefundenDurch,
    empfehlerName: initial.empfehlerName ?? "",
    photoStorageKey: initial.photoStorageKey,
  };
}

/** `/account` also renders the members profile form, which owns its own
 *  `primaryGroupId` select — namespace these ids so no two controls collide. */
const ID_PREFIX = "konto-";

export function EditProfileForm({ initial, state, action }: EditProfileFormProps) {
  const [values, setValues] = useState<WizardValues>(() => toWizardValues(initial));

  const set: <K extends keyof WizardValues>(k: K, v: WizardValues[K]) => void = (k, v) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const errors = state.fields ?? {};

  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <StudiumFields values={values} set={set} errors={errors} idPrefix={ID_PREFIX} />
      <UniGruppeFields
        values={values}
        set={set}
        errors={errors}
        idPrefix={ID_PREFIX}
        showGruppe={false}
      />
      <GeburtsdatumField values={values} set={set} errors={errors} idPrefix={ID_PREFIX} />
      <GefundenFields values={values} set={set} errors={errors} idPrefix={ID_PREFIX} />

      <input type="hidden" name="studiengang" value={values.studiengang} />
      <input type="hidden" name="abschlussart" value={values.abschlussart} />
      <input type="hidden" name="uni" value={resolveUni(values)} />
      <input type="hidden" name="geburtsdatum" value={values.geburtsdatum} />
      <input type="hidden" name="gefundenDurch" value={values.gefundenDurch} />
      <input type="hidden" name="empfehlerName" value={values.empfehlerName} />

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
