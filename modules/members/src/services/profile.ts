/**
 * Profile create + update.
 *
 * The auth module owns identity (auth_users); the members module owns the
 * federation-side profile (display name, primary group, status, roles).
 *
 * Profiles start as `pending` and stay there until the group's local board
 * approves them (ADR 0021). The primary group is not editable through this
 * service — see services/group-change.ts (ADR 0022).
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { ConflictError, NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { ProfileCreated, ProfileUpdated } from "../events";
import { members } from "../schema";
import type { Member } from "../types";

import { row2member } from "./get";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const CreateProfileInput = z.object({
  userId: z.string().min(1),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  primaryGroupId: z.string().min(1).optional().nullable(),
});
export type CreateProfileInput = z.infer<typeof CreateProfileInput>;

/**
 * Names only. The primary group is NOT editable here (ADR 0022) — it moves via
 * `changePrimaryGroup` (self-service, files a request the destination board
 * decides) or `decideGroupChange` (the board). Zod strips the unknown key, so a
 * smuggled `primaryGroupId` is ignored rather than honoured.
 */
export const UpdateProfileInput = z.object({
  firstName: z.string().min(1).max(120).optional(),
  lastName: z.string().min(1).max(120).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

export async function createProfile(db: Db, input: unknown): Promise<Member> {
  const parsed = CreateProfileInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Profil-Eingabe ungültig", {
      fields: flatten(parsed.error),
    });
  }
  const v = parsed.data;

  const existing = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.userId, v.userId))
    .limit(1);
  if (existing.length > 0) {
    throw new ConflictError("Für dieses Konto existiert bereits ein Profil.");
  }

  const id = createId("mem");
  const [row] = await db
    .insert(members)
    .values({
      id,
      userId: v.userId,
      firstName: v.firstName,
      lastName: v.lastName,
      primaryGroupId: v.primaryGroupId ?? null,
      status: "pending",
    })
    .returning();
  if (!row) throw new Error("createProfile: insert returned no row");

  const event: ProfileCreated = {
    type: "members.profile.created",
    memberId: id,
    userId: v.userId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return row2member(row);
}

export async function updateProfile(db: Db, memberId: string, input: unknown): Promise<Member> {
  const parsed = UpdateProfileInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Eingabe ungültig", { fields: flatten(parsed.error) });
  }
  const v = parsed.data;

  const set: Partial<typeof members.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (v.firstName !== undefined) set.firstName = v.firstName;
  if (v.lastName !== undefined) set.lastName = v.lastName;

  const [row] = await db.update(members).set(set).where(eq(members.id, memberId)).returning();
  if (!row) throw new NotFoundError("Profil nicht gefunden.");

  const event: ProfileUpdated = {
    type: "members.profile.updated",
    memberId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return row2member(row);
}

function flatten(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    out[i.path.join(".") || "_"] = i.message;
  }
  return out;
}
