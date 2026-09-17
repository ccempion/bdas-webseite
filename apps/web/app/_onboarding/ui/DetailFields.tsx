"use client";

import { Field } from "@bdas/design-system";
import { ABSCHLUSSART_OPTIONS, BDAJ_FUNKTION_OPTIONS, MAX_INTERESSE } from "@bdas/profile";

import type { WizardValues } from "../../_profile/steps";
import {
  FotoStep,
  GefundenFields,
  GeburtsdatumField,
  SELECT_CLASS,
  UniGruppeFields,
} from "../../profil/ProfileFields";
import type { DetailScreen, DetailValues } from "../details";
import { AnswerCard } from "./AnswerCard";
import { StudienfachFields } from "./StudienfachFields";

export type DetailSetter = <K extends keyof DetailValues>(key: K, value: DetailValues[K]) => void;

/** Rendert die Felder eines Bildschirms von Teil 3. Die Bausteine des alten
 *  Wizards werden wiederverwendet; sie ziehen in den Aufräum-PR mit um. */
export function DetailFields({
  screen,
  values,
  set,
  errors,
}: {
  screen: DetailScreen;
  values: DetailValues;
  set: DetailSetter;
  errors: Record<string, string>;
}) {
  // `WizardValues`'s keys are a subset of `DetailValues` with identical value
  // types, so this setter is safe for every field the old components own.
  // `tsc` can't see that through two independent generics' indexed-access
  // types, so the bridge is asserted once here rather than widening the old
  // wizard's unexported `Setter` type (used well beyond this file).
  const wizardSet = set as unknown as <K extends keyof WizardValues>(
    k: K,
    v: WizardValues[K],
  ) => void;

  return (
    <>
      {screen.fields.map((field) => {
        switch (field) {
          case "studienfach":
            return <StudienfachFields key={field} values={values} set={set} errors={errors} />;
          case "abschlussart":
            return (
              <Field
                key={field}
                label="Abschlussart"
                htmlFor="abschlussart"
                {...(errors["abschlussart"] ? { error: errors["abschlussart"] } : {})}
              >
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
            );
          case "uni":
            return (
              <UniGruppeFields
                key={field}
                values={values}
                set={wizardSet}
                errors={errors}
                showGruppe={false}
              />
            );
          case "geburtsdatum":
            return (
              <GeburtsdatumField key={field} values={values} set={wizardSet} errors={errors} />
            );
          case "gefundenDurch":
            return <GefundenFields key={field} values={values} set={wizardSet} errors={errors} />;
          case "photo":
            return <FotoStep key={field} values={values} set={wizardSet} />;
          case "interesse":
            return (
              <Field
                key={field}
                label="Was interessiert dich?"
                htmlFor="interesse"
                {...(errors["interesse"] ? { error: errors["interesse"] } : {})}
              >
                <textarea
                  id="interesse"
                  rows={4}
                  maxLength={MAX_INTERESSE}
                  className={`${SELECT_CLASS} resize-y`}
                  value={values.interesse}
                  onChange={(e) => set("interesse", e.currentTarget.value)}
                />
              </Field>
            );
          case "bdajFunktion":
            return (
              <div key={field} className="flex flex-col gap-2">
                <div
                  role="group"
                  aria-label="Funktion in der BDAJ"
                  className="grid gap-3 sm:grid-cols-3"
                >
                  {BDAJ_FUNKTION_OPTIONS.map((o) => (
                    <AnswerCard
                      key={o.value}
                      option={{ label: o.label }}
                      selected={values.bdajFunktion === o.value}
                      onSelect={() => set("bdajFunktion", o.value)}
                    />
                  ))}
                </div>
                {errors["bdajFunktion"] ? (
                  <p role="alert" className="text-sm text-bdas-red">
                    {errors["bdajFunktion"]}
                  </p>
                ) : null}
              </div>
            );
        }
      })}
    </>
  );
}
