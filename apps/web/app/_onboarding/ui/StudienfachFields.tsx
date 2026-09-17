"use client";

import React, { useMemo } from "react";

import { Combobox, Field, Input } from "@bdas/design-system";
import { faecherIn, SONSTIGE, STUDIENFACH_KATEGORIEN } from "@bdas/profile";

import type { DetailValues } from "../details";
import type { DetailSetter } from "./DetailFields";

const KATEGORIE_OPTIONS = STUDIENFACH_KATEGORIEN.map((k) => ({ value: k.name, label: k.name }));

/** Erst der Bereich, dann das Fach (Entscheidung 2026-09-16). Die Kategorie wird gespeichert. */
export function StudienfachFields({
  values,
  set,
  errors,
}: {
  values: DetailValues;
  set: DetailSetter;
  errors: Record<string, string>;
}) {
  const faecher = useMemo(
    () => [
      ...faecherIn(values.studienfachKategorie).map((f) => ({ value: f, label: f })),
      { value: SONSTIGE, label: "Mein Fach fehlt …" },
    ],
    [values.studienfachKategorie],
  );

  return (
    <>
      <Field
        label="Studienbereich"
        htmlFor="studienfachKategorie"
        {...(errors["studienfachKategorie"] ? { error: errors["studienfachKategorie"] } : {})}
      >
        <Combobox
          id="studienfachKategorie"
          label="Studienbereich"
          options={KATEGORIE_OPTIONS}
          value={values.studienfachKategorie}
          onChange={(v) => {
            set("studienfachKategorie", v);
            // Ein Fach aus dem alten Bereich passt nicht mehr.
            if (!faecherIn(v).includes(values.studiengang)) set("studiengang", "");
          }}
          invalid={Boolean(errors["studienfachKategorie"])}
        />
      </Field>
      {values.studienfachKategorie ? (
        <Field
          label="Studienfach"
          htmlFor="studiengang"
          {...(errors["studiengang"] ? { error: errors["studiengang"] } : {})}
        >
          <Combobox
            id="studiengang"
            label="Studienfach"
            options={faecher}
            value={values.studiengang}
            onChange={(v) => set("studiengang", v)}
            invalid={Boolean(errors["studiengang"])}
          />
          {values.studiengang === SONSTIGE ? (
            <Input
              aria-label="Anderes Studienfach"
              placeholder="Name deines Fachs"
              className="mt-2"
              value={values.studiengangOther}
              onChange={(e) => set("studiengangOther", e.currentTarget.value)}
            />
          ) : null}
        </Field>
      ) : null}
    </>
  );
}
