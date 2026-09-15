import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { rowLocation } from "../location";
import { groups } from "../schema";
import type { Group, GroupKind, GroupStatus } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

function row2group(r: typeof groups.$inferSelect): Group {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    kind: r.kind as GroupKind,
    contactEmail: r.contactEmail,
    instagramUrl: r.instagramUrl,
    websiteUrl: r.websiteUrl,
    location: rowLocation(r),
    imageKey: r.imageKey,
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

/**
 * Nur die Art einer Gruppe. Bewusst schmal statt `getGroup(...).kind`: das
 * ist der einzige Zugriff, den `@bdas/members` auf diese Tabelle braucht
 * (CLAUDE.md §1 Regel 2), und eine Ein-Spalten-Projektion hält dessen
 * Test-Datenbank frei davon, das vollständige Gruppen-Schema nachzubauen.
 */
export async function getGroupKind(db: Db, id: string): Promise<GroupKind | null> {
  const rows = await db
    .select({ kind: groups.kind })
    .from(groups)
    .where(eq(groups.id, id))
    .limit(1);
  return rows[0] ? (rows[0].kind as GroupKind) : null;
}
