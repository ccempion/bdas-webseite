import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { z } from "zod";

import { ForbiddenError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { ProfileCompleted, ProfileUpdated } from "../events";
import { memberProfiles, type MemberProfileRow } from "../schema";
import { isNutzertyp, PROFILE_FIELD_SCHEMAS } from "../types";
import type {
  AnyProfileFields,
  MemberProfile,
  Nutzertyp,
  ProfileActor,
  SaveProfileInput,
  SaveProfileResult,
} from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

const MAX_INPUT_BYTES = 16 * 1024; // profile JSON is tiny; reject anything huge

function row2profile(row: MemberProfileRow): MemberProfile {
  return {
    userId: row.userId,
    nutzertyp: isNutzertyp(row.nutzertyp) ? row.nutzertyp : "student",
    studiengang: row.studiengang,
    studienfachKategorie: row.studienfachKategorie,
    abschlussart: row.abschlussart,
    uni: row.uni,
    geburtsdatum: row.geburtsdatum,
    interesse: row.interesse,
    bdajFunktion: row.bdajFunktion,
    gefundenDurch: row.gefundenDurch,
    empfehlerName: row.empfehlerName,
    vorstellung: row.vorstellung,
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
  return actor.grants.some((g) => g.role === "federal_board" || g.role === "local_board_lead");
}

/**
 * Upsert the profile. Owner-only write. Stamps `completed_at` on the first
 * complete submit (null → now) and emits `profile.completed`; later edits emit
 * `profile.updated`. `updated_at`/`updated_by` are stamped every time.
 *
 * Reports `supersededPhotoStorageKey` when the write replaced a stored photo,
 * so the caller can delete the object it just unreferenced. All three surfaces
 * that can swap a photo — the account avatar, the account edit form and the
 * signup wizard — come through here, which is why the bookkeeping lives here
 * rather than in each of them.
 *
 * The field set follows `nutzertyp` (spec 2026-09-16 §4.3): taken from the
 * submit, else from the stored row, else `student` — the /account form sends
 * no type and must keep editing a student's profile as before. Columns that
 * belong to another type are written as null.
 */
export async function saveProfile(db: Db, input: SaveProfileInput): Promise<SaveProfileResult> {
  if (input.actor.userId !== input.userId) {
    throw new ForbiddenError("Du darfst nur dein eigenes Profil bearbeiten.");
  }
  if (Buffer.byteLength(JSON.stringify(input.fields ?? {}), "utf8") > MAX_INPUT_BYTES) {
    throw new ValidationError("Eingabe zu groß.");
  }

  // Preserves an existing photo and category when this submit omits them, and
  // tells us which type the row already has.
  const existing = await getProfile(db, input.userId);

  const raw = (input.fields ?? {}) as Record<string, unknown>;
  const requested = raw["nutzertyp"];
  if (requested !== undefined && !isNutzertyp(requested)) {
    throw new ValidationError("Unbekannter Nutzertyp.");
  }
  const nutzertyp: Nutzertyp = isNutzertyp(requested)
    ? requested
    : (existing?.nutzertyp ?? "student");

  const parsed = PROFILE_FIELD_SCHEMAS[nutzertyp].safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Profil-Eingabe ungültig", { fields: flatten(parsed.error) });
  }
  const v: AnyProfileFields = parsed.data;
  const now = new Date();

  const hasStudy = "studiengang" in v;
  const values = {
    userId: input.userId,
    nutzertyp,
    studiengang: hasStudy ? v.studiengang : null,
    studienfachKategorie: hasStudy
      ? (v.studienfachKategorie ?? existing?.studienfachKategorie ?? null)
      : null,
    abschlussart: "abschlussart" in v ? v.abschlussart : null,
    uni: "uni" in v ? v.uni : null,
    geburtsdatum: "geburtsdatum" in v ? v.geburtsdatum : null,
    interesse: "interesse" in v ? v.interesse : null,
    bdajFunktion: "bdajFunktion" in v ? v.bdajFunktion : null,
    gefundenDurch: v.gefundenDurch,
    empfehlerName: v.gefundenDurch === "empfehlung" ? (v.empfehlerName ?? null) : null,
    // Unlike empfehlerName this is not tied to a channel, so it is never
    // cleared on the way in. An empty string means "said nothing" — store it
    // as null so the board panel has one absent case, not two.
    vorstellung: v.vorstellung?.trim() ? v.vorstellung.trim() : null,
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
        nutzertyp: values.nutzertyp,
        studiengang: values.studiengang,
        studienfachKategorie: values.studienfachKategorie,
        abschlussart: values.abschlussart,
        uni: values.uni,
        geburtsdatum: values.geburtsdatum,
        interesse: values.interesse,
        bdajFunktion: values.bdajFunktion,
        gefundenDurch: values.gefundenDurch,
        empfehlerName: values.empfehlerName,
        vorstellung: values.vorstellung,
        photoStorageKey: values.photoStorageKey,
        // Immutable-once completion: a concurrent re-submit cannot re-stamp it.
        // The timestamp goes in as an ISO string with an explicit cast: inside a
        // raw `sql` template there is no column type to infer from, and the
        // driver rejects a bare Date as a bind parameter.
        completedAt: sql`COALESCE(${memberProfiles.completedAt}, ${now.toISOString()}::timestamptz)`,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      },
    })
    .returning();
  if (!row) throw new Error("saveProfile: upsert returned no row");

  // First completion iff this write is the one that set completed_at (insert
  // path: completedAt === updatedAt; update path keeps the earlier completedAt).
  const firstComplete =
    row.completedAt != null && row.completedAt.getTime() === row.updatedAt.getTime();

  // Only a *different* key supersedes the old object. Re-submitting the same
  // key (every profile edit that leaves the photo alone does exactly that)
  // must not delete the photo it still points at.
  const supersededPhotoStorageKey =
    existing?.photoStorageKey && existing.photoStorageKey !== values.photoStorageKey
      ? existing.photoStorageKey
      : null;

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

  return { profile: row2profile(row), supersededPhotoStorageKey };
}

/**
 * Clear the profile photo. Owner-only.
 *
 * Deliberately *not* folded into `saveProfile` as an explicit-null case: the
 * account and wizard forms already submit `photoStorageKey: null` to mean "this
 * form does not carry a photo", which the upsert reads as "keep the stored key"
 * (see `values.photoStorageKey` above). Teaching that null to mean "delete"
 * would make every profile edit wipe the photo. Removal needs a write that says
 * so unambiguously, so it gets its own.
 *
 * Reports the key it just unreferenced so the caller can delete the object
 * itself. This module owns the `photo_storage_key` column, not the bytes it
 * points at, so `@bdas/storage` is not its to call.
 */
export async function clearProfilePhoto(
  db: Db,
  input: { readonly userId: string; readonly actor: ProfileActor },
): Promise<{ readonly cleared: boolean; readonly previousStorageKey: string | null }> {
  if (input.actor.userId !== input.userId) {
    throw new ForbiddenError("Du darfst nur dein eigenes Profil bearbeiten.");
  }

  // Read first: Postgres RETURNING yields the new row, and the caller needs the
  // key that was there before to know what to delete.
  const existing = await getProfile(db, input.userId);
  if (!existing) return { cleared: false, previousStorageKey: null };

  const now = new Date();
  await db
    .update(memberProfiles)
    .set({ photoStorageKey: null, updatedAt: now, updatedBy: input.actor.userId })
    .where(eq(memberProfiles.userId, input.userId));

  const event: ProfileUpdated = { type: "profile.updated", userId: input.userId, at: now };
  await getEventBus().publish(event);
  return { cleared: true, previousStorageKey: existing.photoStorageKey };
}

/**
 * Set the profile photo on an existing profile, whatever its type. Owner-only.
 *
 * The avatar control used to re-submit the whole student record with a new
 * key; that cannot work for types without study fields. Returns the key it
 * replaced so the caller can delete that object (this module does not own the
 * bytes). No profile yet → nothing to attach the photo to.
 */
export async function setProfilePhoto(
  db: Db,
  input: {
    readonly userId: string;
    readonly actor: ProfileActor;
    readonly photoStorageKey: string;
  },
): Promise<{ readonly updated: boolean; readonly supersededPhotoStorageKey: string | null }> {
  if (input.actor.userId !== input.userId) {
    throw new ForbiddenError("Du darfst nur dein eigenes Profil bearbeiten.");
  }
  const key = input.photoStorageKey.trim();
  if (key === "" || key.length > 200) throw new ValidationError("Ungültiger Bildschlüssel.");

  const existing = await getProfile(db, input.userId);
  if (!existing) return { updated: false, supersededPhotoStorageKey: null };

  const now = new Date();
  await db
    .update(memberProfiles)
    .set({ photoStorageKey: key, updatedAt: now, updatedBy: input.actor.userId })
    .where(eq(memberProfiles.userId, input.userId));

  const event: ProfileUpdated = { type: "profile.updated", userId: input.userId, at: now };
  await getEventBus().publish(event);

  const previous = existing.photoStorageKey;
  return {
    updated: true,
    supersededPhotoStorageKey: previous && previous !== key ? previous : null,
  };
}

function flatten(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.join(".") || "_"] = i.message;
  return out;
}
