import { and, asc, eq, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { rowLocation } from "../location";
import { groups } from "../schema";
import type { GroupKind, GroupStatus, GroupSummary } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type ListOpts = {
  /** Restrict by status. Omit to include every status (admin views). */
  readonly status?: GroupStatus | undefined;
  /** Restrict by kind — öffentliche Flächen zeigen nur `hochschulgruppe`. */
  readonly kind?: GroupKind | undefined;
};

/** Returns groups ordered by city then name. */
export async function listGroups(db: Db, opts: ListOpts = {}): Promise<GroupSummary[]> {
  const conds: SQL[] = [];
  if (opts.status) conds.push(eq(groups.status, opts.status));
  if (opts.kind) conds.push(eq(groups.kind, opts.kind));

  const rows = await db
    .select({
      id: groups.id,
      slug: groups.slug,
      name: groups.name,
      city: groups.city,
      status: groups.status,
      kind: groups.kind,
      locationName: groups.locationName,
      locationAddress: groups.locationAddress,
      locationLat: groups.locationLat,
      locationLng: groups.locationLng,
    })
    .from(groups)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(groups.city), asc(groups.name));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    status: r.status as GroupStatus,
    kind: r.kind as GroupKind,
    location: rowLocation(r),
  }));
}

/**
 * Nur die IDs einer Gruppenart. Für `@bdas/members`, das für die Statistik
 * wissen muss, welche Gruppen Hochschulgruppen sind, die Tabelle aber nicht
 * selbst abfragen darf (CLAUDE.md §1 Regel 1).
 */
export async function listGroupIdsByKind(db: Db, kind: GroupKind): Promise<string[]> {
  const rows = await db.select({ id: groups.id }).from(groups).where(eq(groups.kind, kind));
  return rows.map((r) => r.id);
}
