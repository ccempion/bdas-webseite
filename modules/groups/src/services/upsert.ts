/**
 * Idempotent upsert by slug — used by the seed CLI. Inserts a new group
 * row or updates the existing one for the same slug. Emits the
 * appropriate event on success.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { GroupCreated, GroupUpdated } from "../events";
import { GroupLocationInput, locationColumns, rowLocation } from "../location";
import { groups } from "../schema";
import type { Group, GroupLocation, GroupStatus } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const UpsertGroupInput = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Slug must be lowercase kebab-case"),
  name: z.string().min(2).max(120),
  city: z.string().min(2).max(120),
  contactEmail: z.string().email().max(254).optional().nullable(),
  instagramUrl: z.string().url().max(500).optional().nullable(),
  websiteUrl: z.string().url().max(500).optional().nullable(),
  status: z.enum(["active", "dormant", "new", "archived"]).default("active"),
  location: GroupLocationInput.optional().nullable(),
});
export type UpsertGroupInput = z.infer<typeof UpsertGroupInput>;

export type UpsertResult = {
  readonly group: Group;
  readonly created: boolean;
};

export async function upsertGroupBySlug(db: Db, input: unknown): Promise<UpsertResult> {
  const parsed = UpsertGroupInput.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      fields[i.path.join(".") || "_"] = i.message;
    }
    throw new ValidationError("Group input invalid", { fields });
  }
  const v = parsed.data;

  const existing = await db.select().from(groups).where(eq(groups.slug, v.slug)).limit(1);
  const now = new Date();

  if (existing[0]) {
    const id = existing[0].id;
    await db
      .update(groups)
      .set({
        name: v.name,
        city: v.city,
        contactEmail: v.contactEmail ?? null,
        instagramUrl: v.instagramUrl ?? null,
        websiteUrl: v.websiteUrl ?? null,
        status: v.status,
        ...(v.location !== undefined ? locationColumns(v.location) : {}),
        updatedAt: now,
      })
      .where(eq(groups.id, id));

    const event: GroupUpdated = {
      type: "groups.group.updated",
      groupId: id,
      slug: v.slug,
      at: now,
    };
    await getEventBus().publish(event);

    const location = v.location === undefined ? rowLocation(existing[0]) : (v.location ?? null);
    return { group: toGroup(id, v, location), created: false };
  }

  const id = createId("grp");
  await db.insert(groups).values({
    id,
    slug: v.slug,
    name: v.name,
    city: v.city,
    contactEmail: v.contactEmail ?? null,
    instagramUrl: v.instagramUrl ?? null,
    websiteUrl: v.websiteUrl ?? null,
    status: v.status,
    ...locationColumns(v.location),
  });

  const event: GroupCreated = {
    type: "groups.group.created",
    groupId: id,
    slug: v.slug,
    at: now,
  };
  await getEventBus().publish(event);

  return { group: toGroup(id, v, v.location ?? null), created: true };
}

function toGroup(id: string, v: UpsertGroupInput, location: GroupLocation | null): Group {
  return {
    id,
    slug: v.slug,
    name: v.name,
    city: v.city,
    contactEmail: v.contactEmail ?? null,
    instagramUrl: v.instagramUrl ?? null,
    websiteUrl: v.websiteUrl ?? null,
    status: v.status as GroupStatus,
    location,
  };
}
