/**
 * Federal-board group management: create, edit, archive.
 *
 * Authorization is NOT enforced here — callers gate on `requireFederalBoard`
 * at the app action layer, same as modules/members. Keeping this auth-agnostic
 * keeps `groups` free of an `auth`/`members` dependency (CLAUDE.md §1 rule 2).
 *
 * `upsertGroupBySlug` (seed CLI) is intentionally separate: it keys on slug
 * and is idempotent. These services key on id so an edit can never silently
 * fork a second row when a value changes.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { ConflictError, NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { GroupArchived, GroupCreated, GroupUpdated } from "../events";
import { GroupLocationInput, locationColumns, rowLocation } from "../location";
import { groups } from "../schema";
import type { Group, GroupLocation, GroupStatus } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

// Slug is immutable after creation (it is the public /gruppen/[slug] URL), so
// it is deliberately absent from the update surface. Create extends this via
// zod `.extend()` — sharing the shape by object spread widens `.default()`
// inference under exactOptionalPropertyTypes.
// `archived` is intentionally NOT a valid input value: archiving goes
// exclusively through `archiveGroup` so the `groups.group.archived` event is
// always emitted. The DB CHECK still permits it (that is the value
// `archiveGroup` writes).
export const UpdateGroupInput = z.object({
  name: z
    .string()
    .min(2, "Name muss mindestens 2 Zeichen haben")
    .max(120, "Name darf höchstens 120 Zeichen haben"),
  city: z
    .string()
    .min(2, "Stadt muss mindestens 2 Zeichen haben")
    .max(120, "Stadt darf höchstens 120 Zeichen haben"),
  contactEmail: z
    .string()
    .email("Ungültige E-Mail-Adresse")
    .max(254, "E-Mail-Adresse ist zu lang")
    .optional()
    .nullable(),
  instagramUrl: z
    .string()
    .url("Ungültige Instagram-URL")
    .max(500, "URL ist zu lang")
    .optional()
    .nullable(),
  websiteUrl: z
    .string()
    .url("Ungültige Website-URL")
    .max(500, "URL ist zu lang")
    .optional()
    .nullable(),
  status: z.enum(["active", "dormant", "new"]).default("active"),
  location: GroupLocationInput.optional().nullable(),
  imageKey: z.string().max(500, "Bildreferenz ist zu lang").optional().nullable(),
});
export type UpdateGroupInput = z.infer<typeof UpdateGroupInput>;

export const CreateGroupInput = UpdateGroupInput.extend({
  slug: z
    .string()
    .min(2, "Kürzel muss mindestens 2 Zeichen haben")
    .max(64, "Kürzel darf höchstens 64 Zeichen haben")
    .regex(
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
      "Kürzel darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten",
    ),
});
export type CreateGroupInput = z.infer<typeof CreateGroupInput>;

function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      fields[i.path.join(".") || "_"] = i.message;
    }
    throw new ValidationError("Eingabe ungültig", { fields });
  }
  return parsed.data;
}

function rowToGroup(r: typeof groups.$inferSelect): Group {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    contactEmail: r.contactEmail,
    instagramUrl: r.instagramUrl,
    websiteUrl: r.websiteUrl,
    location: rowLocation(r),
    imageKey: r.imageKey,
    status: r.status as GroupStatus,
  };
}

/** Build the returned domain object from validated input (slug passed in
 *  separately since it is immutable / absent from the update surface;
 *  `location` and `imageKey` separately because omitting them means "leave
 *  as stored", not "clear"). */
function toGroup(
  id: string,
  slug: string,
  v: UpdateGroupInput,
  location: GroupLocation | null,
  imageKey: string | null,
): Group {
  return {
    id,
    slug,
    name: v.name,
    city: v.city,
    contactEmail: v.contactEmail ?? null,
    instagramUrl: v.instagramUrl ?? null,
    websiteUrl: v.websiteUrl ?? null,
    status: v.status as GroupStatus,
    location,
    imageKey,
  };
}

export async function createGroup(db: Db, input: unknown): Promise<Group> {
  const v = parseOrThrow(CreateGroupInput, input);

  const clash = await db.select().from(groups).where(eq(groups.slug, v.slug)).limit(1);
  if (clash[0]) {
    throw new ConflictError(`Eine Gruppe mit dem Kürzel „${v.slug}“ existiert bereits.`);
  }

  const id = createId("grp");
  const now = new Date();
  await db.insert(groups).values({
    id,
    slug: v.slug,
    name: v.name,
    city: v.city,
    contactEmail: v.contactEmail ?? null,
    instagramUrl: v.instagramUrl ?? null,
    websiteUrl: v.websiteUrl ?? null,
    status: v.status,
    imageKey: v.imageKey ?? null,
    ...locationColumns(v.location),
  });

  const event: GroupCreated = {
    type: "groups.group.created",
    groupId: id,
    slug: v.slug,
    at: now,
  };
  await getEventBus().publish(event);

  return toGroup(id, v.slug, v, v.location ?? null, v.imageKey ?? null);
}

export async function updateGroup(db: Db, id: string, input: unknown): Promise<Group> {
  const v = parseOrThrow(UpdateGroupInput, input);

  const existing = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  if (!existing[0]) {
    throw new NotFoundError("Gruppe nicht gefunden.");
  }

  const now = new Date();
  await db
    .update(groups)
    .set({
      name: v.name,
      city: v.city,
      contactEmail: v.contactEmail ?? null,
      instagramUrl: v.instagramUrl ?? null,
      websiteUrl: v.websiteUrl ?? null,
      status: v.status,
      // Omitted means "leave the stored banner alone"; an explicit null clears
      // it. Same contract as `location`.
      ...(v.imageKey !== undefined ? { imageKey: v.imageKey } : {}),
      ...(v.location !== undefined ? locationColumns(v.location) : {}),
      updatedAt: now,
    })
    .where(eq(groups.id, id));

  const event: GroupUpdated = {
    type: "groups.group.updated",
    groupId: id,
    slug: existing[0].slug,
    at: now,
  };
  await getEventBus().publish(event);

  const location = v.location === undefined ? rowLocation(existing[0]) : (v.location ?? null);
  const imageKey = v.imageKey === undefined ? existing[0].imageKey : v.imageKey;
  return toGroup(id, existing[0].slug, v, location, imageKey);
}

export async function archiveGroup(db: Db, id: string): Promise<Group> {
  const existing = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  if (!existing[0]) {
    throw new NotFoundError("Gruppe nicht gefunden.");
  }

  const now = new Date();
  await db.update(groups).set({ status: "archived", updatedAt: now }).where(eq(groups.id, id));

  const event: GroupArchived = {
    type: "groups.group.archived",
    groupId: id,
    slug: existing[0].slug,
    at: now,
  };
  await getEventBus().publish(event);

  return rowToGroup({ ...existing[0], status: "archived" });
}
