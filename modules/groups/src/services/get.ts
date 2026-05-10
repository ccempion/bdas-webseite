import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { groups } from "../schema";
import type { Group, GroupStatus } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

function row2group(r: typeof groups.$inferSelect): Group {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    university: r.university,
    description: r.description,
    contactEmail: r.contactEmail,
    instagramUrl: r.instagramUrl,
    websiteUrl: r.websiteUrl,
    status: r.status as GroupStatus,
  };
}

export async function getGroupBySlug(db: Db, slug: string): Promise<Group | null> {
  const rows = await db.select().from(groups).where(eq(groups.slug, slug)).limit(1);
  return rows[0] ? row2group(rows[0]) : null;
}

export async function getGroup(db: Db, id: string): Promise<Group | null> {
  const rows = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  return rows[0] ? row2group(rows[0]) : null;
}
