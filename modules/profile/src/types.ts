import { z } from "zod";

import { ABSCHLUSSART_KEYS, GEFUNDEN_DURCH_KEYS } from "./data";

const MAX_TEXT = 200;
const MAX_UNI = 200;
const MIN_BIRTH_YEAR = 1900;

/**
 * The six domain fields written to member_profiles. `uni` is the *resolved*
 * university string: either a value from the curated list, or the free text a
 * user typed after choosing "Sonstige" — validated as non-empty in either case.
 * `empfehlerName` is required only when `gefundenDurch === "empfehlung"`.
 */
export const SaveProfileFields = z
  .object({
    studiengang: z.string().trim().min(1, "Bitte gib deinen Studiengang an.").max(MAX_TEXT),
    abschlussart: z.enum(ABSCHLUSSART_KEYS as [string, ...string[]], {
      errorMap: () => ({ message: "Bitte wähle eine Abschlussart." }),
    }),
    uni: z.string().trim().min(1, "Bitte gib deine Hochschule an.").max(MAX_UNI),
    geburtsdatum: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte gib ein gültiges Datum an.")
      .refine((s) => {
        const [yearStr, monthStr, dayStr] = s.split("-");
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
      }, "Das Geburtsdatum muss in der Vergangenheit liegen."),
    gefundenDurch: z.enum(GEFUNDEN_DURCH_KEYS as [string, ...string[]], {
      errorMap: () => ({ message: "Bitte wähle aus, wie du BDAS gefunden hast." }),
    }),
    empfehlerName: z.string().trim().max(MAX_TEXT).optional().nullable(),
    photoStorageKey: z.string().trim().max(MAX_TEXT).optional().nullable(),
  })
  .refine((v) => v.gefundenDurch !== "empfehlung" || (v.empfehlerName?.trim().length ?? 0) > 0, {
    message: "Bitte gib den Namen der empfehlenden Person an.",
    path: ["empfehlerName"],
  });

export type SaveProfileFields = z.infer<typeof SaveProfileFields>;

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

export type MemberProfile = {
  readonly userId: string;
  readonly studiengang: string;
  readonly abschlussart: string;
  readonly uni: string;
  readonly geburtsdatum: string;
  readonly gefundenDurch: string;
  readonly empfehlerName: string | null;
  readonly photoStorageKey: string | null;
  readonly completedAt: Date | null;
  readonly updatedAt: Date;
  readonly updatedBy: string;
};
