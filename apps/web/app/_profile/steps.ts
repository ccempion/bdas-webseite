import { SaveProfileFields, SONSTIGE } from "@bdas/profile";

export type WizardValues = {
  studiengang: string;
  abschlussart: string;
  uni: string; // a list value or the SONSTIGE sentinel
  uniOther: string; // free text when uni === SONSTIGE
  primaryGroupId: string;
  geburtsdatum: string; // yyyy-mm-dd
  gefundenDurch: string;
  empfehlerName: string;
  photoStorageKey: string | null;
};

export const WIZARD_STEPS = [
  { id: "studium", label: "Studium", fields: ["studiengang", "abschlussart"] },
  { id: "uni_gruppe", label: "Hochschule & Gruppe", fields: ["uni", "primaryGroupId"] },
  { id: "geburtsdatum", label: "Geburtsdatum", fields: ["geburtsdatum"] },
  { id: "gefunden", label: "Gefunden durch", fields: ["gefundenDurch", "empfehlerName"] },
  { id: "foto", label: "Profilbild", fields: [] },
  { id: "review", label: "Überprüfen", fields: [] },
] as const;

/** The value stored in `uni`: the free text for Sonstige, else the list value. */
export function resolveUni(v: WizardValues): string {
  return v.uni === SONSTIGE ? v.uniOther.trim() : v.uni;
}

/** Map the flat wizard state onto the module's field shape for validation. */
function toFields(v: WizardValues) {
  return {
    studiengang: v.studiengang,
    abschlussart: v.abschlussart,
    uni: resolveUni(v),
    geburtsdatum: v.geburtsdatum,
    gefundenDurch: v.gefundenDurch,
    empfehlerName: v.empfehlerName,
    photoStorageKey: v.photoStorageKey,
  };
}

const STEP_FIELDS: Record<string, ReadonlyArray<string>> = Object.fromEntries(
  WIZARD_STEPS.map((s) => [s.id, s.fields]),
);

/**
 * Validate only the fields a given step owns, reusing the module's zod schema
 * as the single source of truth. `primaryGroupId` is app-owned (members), not
 * in the schema, so it is checked separately.
 */
export function validateStep(stepId: string, v: WizardValues): Record<string, string> {
  const owned = STEP_FIELDS[stepId] ?? [];
  const errors: Record<string, string> = {};

  if (owned.includes("primaryGroupId") && v.primaryGroupId.trim() === "") {
    errors["primaryGroupId"] = "Bitte wähle deine BDAS-Gruppe.";
  }

  const schemaFields = owned.filter((f) => f !== "primaryGroupId");
  if (schemaFields.length > 0) {
    const res = SaveProfileFields.safeParse(toFields(v));
    if (!res.success) {
      for (const issue of res.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (schemaFields.includes(key) && !errors[key]) errors[key] = issue.message;
      }
    }
  }
  return errors;
}
