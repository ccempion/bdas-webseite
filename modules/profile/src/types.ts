import { z } from "zod";

import {
  ABSCHLUSSART_KEYS,
  BDAJ_FUNKTION_KEYS,
  GEFUNDEN_DURCH_KEYS,
  STUDIENFACH_KATEGORIE_NAMES,
} from "./data";

const MAX_TEXT = 200;
const MAX_UNI = 200;
const MIN_BIRTH_YEAR = 1900;
/** Room for a paragraph or two, not an essay (#122). */
export const MAX_VORSTELLUNG = 1000;
/** „Was interessiert dich an BDAS?" — ein, zwei Sätze. */
export const MAX_INTERESSE = 500;

/** Die vier Nutzertypen (Spec 2026-09-16 §4.3). Gleiche Namen wie `UserType` in @bdas/onboarding. */
export const NUTZERTYPEN = ["student", "alumnus", "foerderer", "bdaj"] as const;
export type Nutzertyp = (typeof NUTZERTYPEN)[number];

export function isNutzertyp(v: unknown): v is Nutzertyp {
  return typeof v === "string" && (NUTZERTYPEN as ReadonlyArray<string>).includes(v);
}

const studiengang = z.string().trim().min(1, "Bitte gib dein Studienfach an.").max(MAX_TEXT);

const studienfachKategorie = z
  .string()
  .refine((k) => STUDIENFACH_KATEGORIE_NAMES.includes(k), "Bitte wähle einen Studienbereich.")
  .optional()
  .nullable();

const uni = z.string().trim().min(1, "Bitte gib deine Hochschule an.").max(MAX_UNI);

const abschlussart = z.enum(ABSCHLUSSART_KEYS as [string, ...string[]], {
  errorMap: () => ({ message: "Bitte wähle eine Abschlussart." }),
});

const geburtsdatum = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte gib ein gültiges Datum an.")
  .refine((s) => {
    const [yearStr, monthStr, dayStr] = s.split("-") as [string, string, string];
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const d = new Date(`${s}T00:00:00Z`);
    return (
      !Number.isNaN(d.getTime()) &&
      d.getUTCFullYear() === year &&
      d.getUTCMonth() + 1 === month &&
      d.getUTCDate() === day &&
      year >= MIN_BIRTH_YEAR &&
      d < new Date()
    );
  }, "Das Geburtsdatum muss in der Vergangenheit liegen.");

/** Felder, die jeder Typ hat. */
const common = {
  gefundenDurch: z.enum(GEFUNDEN_DURCH_KEYS as [string, ...string[]], {
    errorMap: () => ({ message: "Bitte wähle aus, wie du BDAS gefunden hast." }),
  }),
  empfehlerName: z.string().trim().max(MAX_TEXT).optional().nullable(),
  // Optional for every channel, never required (#122). It gives the board
  // something to read; it verifies nothing and gates nothing.
  vorstellung: z
    .string()
    .trim()
    .max(MAX_VORSTELLUNG, `Bitte fasse dich auf ${MAX_VORSTELLUNG} Zeichen.`)
    .optional()
    .nullable(),
  photoStorageKey: z.string().trim().max(MAX_TEXT).optional().nullable(),
};

const referral = {
  check: (v: { gefundenDurch: string; empfehlerName?: string | null | undefined }) =>
    v.gefundenDurch !== "empfehlung" || (v.empfehlerName?.trim().length ?? 0) > 0,
  message: { message: "Bitte gib den Namen der empfehlenden Person an.", path: ["empfehlerName"] },
};

/**
 * Studierende. `uni` is the *resolved* university string: a list value, or the
 * free text typed under "Sonstige". `nutzertyp` may be omitted — the /account
 * edit form predates it — but if present it must match.
 */
export const StudentProfileFields = z
  .object({
    nutzertyp: z.literal("student").optional(),
    studiengang,
    studienfachKategorie,
    abschlussart,
    uni,
    geburtsdatum,
    ...common,
  })
  .refine(referral.check, referral.message);

/** Alumni: Studienfach und ehemalige Hochschule, kein Abschluss, kein Geburtsdatum. */
export const AlumnusProfileFields = z
  .object({
    nutzertyp: z.literal("alumnus").optional(),
    studiengang,
    studienfachKategorie,
    uni,
    ...common,
  })
  .refine(referral.check, referral.message);

/** Förderer*innen und Interessierte, einschließlich Studierender ohne Gruppe. */
export const FoerdererProfileFields = z
  .object({
    nutzertyp: z.literal("foerderer").optional(),
    interesse: z
      .string()
      .trim()
      .min(1, "Bitte erzähl uns kurz, was dich interessiert.")
      .max(MAX_INTERESSE, `Bitte fasse dich auf ${MAX_INTERESSE} Zeichen.`),
    ...common,
  })
  .refine(referral.check, referral.message);

/** BDAJ-Funktionär*innen: eine feste Auswahl. */
export const BdajProfileFields = z
  .object({
    nutzertyp: z.literal("bdaj").optional(),
    bdajFunktion: z.enum(BDAJ_FUNKTION_KEYS as [string, ...string[]], {
      errorMap: () => ({ message: "Bitte wähle deine Funktion in der BDAJ." }),
    }),
    ...common,
  })
  .refine(referral.check, referral.message);

/** Der alte Name. Heißt weiter so, weil `/account` und der alte Wizard ihn benutzen. */
export const SaveProfileFields = StudentProfileFields;
export type SaveProfileFields = z.infer<typeof StudentProfileFields>;

export type AnyProfileFields =
  | z.infer<typeof StudentProfileFields>
  | z.infer<typeof AlumnusProfileFields>
  | z.infer<typeof FoerdererProfileFields>
  | z.infer<typeof BdajProfileFields>;

export const PROFILE_FIELD_SCHEMAS: Record<
  Nutzertyp,
  z.ZodType<AnyProfileFields, z.ZodTypeDef, unknown>
> = {
  student: StudentProfileFields,
  alumnus: AlumnusProfileFields,
  foerderer: FoerdererProfileFields,
  bdaj: BdajProfileFields,
};

/** Ein Feld aus Sicht der Oberfläche. `studienfach` steht für Kategorie + Fach. */
export type ProfileField =
  | "studienfach"
  | "abschlussart"
  | "uni"
  | "geburtsdatum"
  | "gefundenDurch"
  | "photo"
  | "interesse"
  | "bdajFunktion";

/** Welche Felder ein Typ ausfüllt, in der Reihenfolge der Spec (§4.3). */
export const FIELD_SETS: Record<Nutzertyp, ReadonlyArray<ProfileField>> = {
  student: ["studienfach", "abschlussart", "uni", "geburtsdatum", "gefundenDurch", "photo"],
  alumnus: ["studienfach", "uni", "gefundenDurch"],
  foerderer: ["interesse", "gefundenDurch"],
  bdaj: ["bdajFunktion", "gefundenDurch"],
};

export type ProfileActor = {
  readonly userId: string;
  readonly grants: ReadonlyArray<{ role: string; groupId: string | null }>;
};

export type SaveProfileInput = {
  readonly userId: string;
  readonly fields: unknown;
  readonly actor: ProfileActor;
  /** Event-only: the member's primary group id, forwarded into
   *  `profile.completed` so the notifications subscriber can resolve the board.
   *  NOT persisted here — `members` owns the group (spec §9). */
  readonly groupId?: string | null;
};

export type SaveProfileResult = {
  readonly profile: MemberProfile;
  /** The photo object this write unreferenced, if it replaced a stored one.
   *  The caller deletes it: this module owns `photo_storage_key`, not the
   *  bytes it points at. Null when the photo was unchanged or absent. */
  readonly supersededPhotoStorageKey: string | null;
};

export type MemberProfile = {
  readonly userId: string;
  readonly nutzertyp: Nutzertyp;
  /** Null bei Förderer*innen und BDAJ. */
  readonly studiengang: string | null;
  readonly studienfachKategorie: string | null;
  /** Nur Studierende. */
  readonly abschlussart: string | null;
  /** Studierende und Alumni. */
  readonly uni: string | null;
  /** Nur Studierende. */
  readonly geburtsdatum: string | null;
  /** Nur Förderer*innen. */
  readonly interesse: string | null;
  /** Nur BDAJ. */
  readonly bdajFunktion: string | null;
  readonly gefundenDurch: string;
  readonly empfehlerName: string | null;
  readonly vorstellung: string | null;
  readonly photoStorageKey: string | null;
  readonly completedAt: Date | null;
  readonly updatedAt: Date;
  readonly updatedBy: string;
};
