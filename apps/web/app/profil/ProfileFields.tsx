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

export function StudiumFields({
  values,
  set,
  errors,
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Field label="Studiengang" htmlFor="studiengang" {...(errors["studiengang"] ? { error: errors["studiengang"] } : {})}>
        <Input
          id="studiengang"
          value={values.studiengang}
          onChange={(e) => set("studiengang", e.currentTarget.value)}
          required
        />
      </Field>
      <Field label="Abschlussart" htmlFor="abschlussart" {...(errors["abschlussart"] ? { error: errors["abschlussart"] } : {})}>
        <select
          id="abschlussart"
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
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
  groups: Groups;
}) {
  return (
    <>
      <Field label="Hochschule" htmlFor="uni" {...(errors["uni"] ? { error: errors["uni"] } : {})}>
        <select
          id="uni"
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
      <Field label="BDAS-Gruppe" htmlFor="primaryGroupId" {...(errors["primaryGroupId"] ? { error: errors["primaryGroupId"] } : {})}>
        <select
          id="primaryGroupId"
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
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
}) {
  return (
    <Field label="Geburtsdatum" htmlFor="geburtsdatum" {...(errors["geburtsdatum"] ? { error: errors["geburtsdatum"] } : {})}>
      <Input
        id="geburtsdatum"
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
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Field label="Wie hast du BDAS gefunden?" htmlFor="gefundenDurch" {...(errors["gefundenDurch"] ? { error: errors["gefundenDurch"] } : {})}>
        <select
          id="gefundenDurch"
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
        <Field label="Von wem wurdest du empfohlen?" htmlFor="empfehlerName" {...(errors["empfehlerName"] ? { error: errors["empfehlerName"] } : {})}>
          <Input
            id="empfehlerName"
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
