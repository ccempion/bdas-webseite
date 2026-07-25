"use client";

import { Field, Input } from "@bdas/design-system";
import {
  ABSCHLUSSART_OPTIONS,
  GEFUNDEN_DURCH_OPTIONS,
  SONSTIGE,
  UNIVERSITIES,
} from "@bdas/profile";

import type { WizardValues } from "../_profile/steps";
import { PhotoField } from "./PhotoField";

export const SELECT_CLASS =
  "block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2.5 text-base text-bdas-ink transition-colors duration-bdas-quick ease-bdas focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20";

type Groups = ReadonlyArray<{ id: string; name: string; city: string }>;
type Setter = <K extends keyof WizardValues>(k: K, v: WizardValues[K]) => void;

/** Prefix for the field element ids. `/account` renders these fields alongside
 *  the members profile form, which owns a `primaryGroupId` select of its own —
 *  duplicate ids would bind that form's control to this form's label. */
type WithIdPrefix = { idPrefix?: string };

export function StudiumFields({
  values,
  set,
  errors,
  idPrefix = "",
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
} & WithIdPrefix) {
  return (
    <>
      <Field
        label="Studiengang"
        htmlFor={`${idPrefix}studiengang`}
        {...(errors["studiengang"] ? { error: errors["studiengang"] } : {})}
      >
        <Input
          id={`${idPrefix}studiengang`}
          value={values.studiengang}
          onChange={(e) => set("studiengang", e.currentTarget.value)}
          required
        />
      </Field>
      <Field
        label="Abschlussart"
        htmlFor={`${idPrefix}abschlussart`}
        {...(errors["abschlussart"] ? { error: errors["abschlussart"] } : {})}
      >
        <select
          id={`${idPrefix}abschlussart`}
          className={SELECT_CLASS}
          value={values.abschlussart}
          onChange={(e) => set("abschlussart", e.currentTarget.value)}
        >
          <option value="">— bitte wählen —</option>
          {ABSCHLUSSART_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

export function UniGruppeFields({
  values,
  set,
  errors,
  groups,
  idPrefix = "",
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
  groups: Groups;
} & WithIdPrefix) {
  return (
    <>
      <Field
        label="Hochschule"
        htmlFor={`${idPrefix}uni`}
        {...(errors["uni"] ? { error: errors["uni"] } : {})}
      >
        <select
          id={`${idPrefix}uni`}
          className={SELECT_CLASS}
          value={values.uni}
          onChange={(e) => set("uni", e.currentTarget.value)}
        >
          <option value="">— bitte wählen —</option>
          {UNIVERSITIES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
          <option value={SONSTIGE}>Sonstige …</option>
        </select>
        {values.uni === SONSTIGE ? (
          <Input
            aria-label="Andere Hochschule"
            placeholder="Name deiner Hochschule"
            className="mt-2"
            value={values.uniOther}
            onChange={(e) => set("uniOther", e.currentTarget.value)}
          />
        ) : null}
      </Field>
      <Field
        label="BDAS-Gruppe"
        htmlFor={`${idPrefix}primaryGroupId`}
        {...(errors["primaryGroupId"] ? { error: errors["primaryGroupId"] } : {})}
      >
        <select
          id={`${idPrefix}primaryGroupId`}
          className={SELECT_CLASS}
          value={values.primaryGroupId}
          onChange={(e) => set("primaryGroupId", e.currentTarget.value)}
        >
          <option value="">— bitte wählen —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.city})
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

export function GeburtsdatumField({
  values,
  set,
  errors,
  idPrefix = "",
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
} & WithIdPrefix) {
  return (
    <Field
      label="Geburtsdatum"
      htmlFor={`${idPrefix}geburtsdatum`}
      {...(errors["geburtsdatum"] ? { error: errors["geburtsdatum"] } : {})}
    >
      <Input
        id={`${idPrefix}geburtsdatum`}
        type="date"
        value={values.geburtsdatum}
        onChange={(e) => set("geburtsdatum", e.currentTarget.value)}
        required
      />
    </Field>
  );
}

export function GefundenFields({
  values,
  set,
  errors,
  idPrefix = "",
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
} & WithIdPrefix) {
  return (
    <>
      <Field
        label="Wie hast du BDAS gefunden?"
        htmlFor={`${idPrefix}gefundenDurch`}
        {...(errors["gefundenDurch"] ? { error: errors["gefundenDurch"] } : {})}
      >
        <select
          id={`${idPrefix}gefundenDurch`}
          className={SELECT_CLASS}
          value={values.gefundenDurch}
          onChange={(e) => set("gefundenDurch", e.currentTarget.value)}
        >
          <option value="">— bitte wählen —</option>
          {GEFUNDEN_DURCH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      {values.gefundenDurch === "empfehlung" ? (
        <Field
          label="Von wem wurdest du empfohlen?"
          htmlFor={`${idPrefix}empfehlerName`}
          {...(errors["empfehlerName"] ? { error: errors["empfehlerName"] } : {})}
        >
          <Input
            id={`${idPrefix}empfehlerName`}
            value={values.empfehlerName}
            onChange={(e) => set("empfehlerName", e.currentTarget.value)}
          />
        </Field>
      ) : null}
    </>
  );
}

export function FotoStep({ values, set }: { values: WizardValues; set: Setter }) {
  return (
    <PhotoField
      storageKey={values.photoStorageKey}
      onChange={(key) => set("photoStorageKey", key)}
    />
  );
}
