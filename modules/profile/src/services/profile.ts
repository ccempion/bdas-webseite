import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { z } from "zod";

import { ForbiddenError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { ProfileCompleted, ProfileUpdated } from "../events";
import { memberProfiles, type MemberProfileRow } from "../schema";
import { SaveProfileFields } from "../types";
import type { MemberProfile, ProfileActor, SaveProfileInput } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

const MAX_INPUT_BYTES = 16 * 1024; // profile JSON is tiny; reject anything huge

function row2profile(row: MemberProfileRow): MemberProfile {
  return {
    userId: row.userId,
    studiengang: row.studiengang,
    abschlussart: row.abschlussart,
    uni: row.uni,
    geburtsdatum: row.geburtsdatum,
    gefundenDurch: row.gefundenDurch,
    empfehlerName: row.empfehlerName,
    photoStorageKey: row.photoStorageKey,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

export async function getProfile(db: Db, userId: string): Promise<MemberProfile | null> {
  const rows = await db
    .select()
    .from(memberProfiles)
    .where(eq(memberProfiles.userId, userId))
    .limit(1);
  const row = rows[0];
  return row ? row2profile(row) : null;
}

/** Read authorization: the owner, or any board grant (local or federal). */
export function canViewProfile(actor: ProfileActor, ownerUserId: string): boolean {
  if (actor.userId === ownerUserId) return true;
  return actor.grants.some(
    (g) => g.role === "federal_board" || g.role === "local_board" || g.role === "local_board_lead",
  );
}

/**
 * Upsert the profile. Owner-only write. Stamps `completed_at` on the first
 * complete submit (null → now) and emits `profile.completed`; later edits emit
 * `profile.updated`. `updated_at`/`updated_by` are stamped every time.
 */
export async function saveProfile(db: Db, input: SaveProfileInput): Promise<MemberProfile> {
  if (input.actor.userId !== input.userId) {
    throw new ForbiddenError("Du darfst nur dein eigenes Profil bearbeiten.");
  }
  if (Buffer.byteLength(JSON.stringify(input.fields ?? {}), "utf8") > MAX_INPUT_BYTES) {
    throw new ValidationError("Eingabe zu groß.");
  }

  const parsed = SaveProfileFields.safeParse(input.fields);
  if (!parsed.success) {
    throw new ValidationError("Profil-Eingabe ungültig", { fields: flatten(parsed.error) });
  }
  const v = parsed.data;
  const now = new Date();

  const existing = await getProfile(db, input.userId); // kept only to preserve an existing photo when this submit omits one

  const values = {
    userId: input.userId,
    studiengang: v.studiengang,
    abschlussart: v.abschlussart,
    uni: v.uni,
    geburtsdatum: v.geburtsdatum,
    gefundenDurch: v.gefundenDurch,
    empfehlerName: v.gefundenDurch === "empfehlung" ? (v.empfehlerName ?? null) : null,
    photoStorageKey: v.photoStorageKey ?? existing?.photoStorageKey ?? null,
    completedAt: now,
    updatedAt: now,
    updatedBy: input.actor.userId,
  };

  const [row] = await db
    .insert(memberProfiles)
    .values(values)
    .onConflictDoUpdate({
      target: memberProfiles.userId,
      set: {
        studiengang: values.studiengang,
        abschlussart: values.abschlussart,
        uni: values.uni,
        geburtsdatum: values.geburtsdatum,
        gefundenDurch: values.gefundenDurch,
        empfehlerName: values.empfehlerName,
        photoStorageKey: values.photoStorageKey,
        // Immutable-once completion: a concurrent re-submit cannot re-stamp it.
        completedAt: sql`COALESCE(${memberProfiles.completedAt}, ${now})`,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      },
    })
    .returning();
  if (!row) throw new Error("saveProfile: upsert returned no row");

  // First completion iff this write is the one that set completed_at (insert
  // path: completedAt === updatedAt; update path keeps the earlier completedAt).
  const firstComplete = row.completedAt != null && row.completedAt.getTime() === row.updatedAt.getTime();

  if (firstComplete) {
    const event: ProfileCompleted = {
      type: "profile.completed",
      userId: input.userId,
      groupId: input.groupId ?? null,
      at: now,
    };
    await getEventBus().publish(event);
  } else {
    const event: ProfileUpdated = { type: "profile.updated", userId: input.userId, at: now };
    await getEventBus().publish(event);
  }

  return row2profile(row);
}

function flatten(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.join(".") || "_"] = i.message;
  return out;
}
