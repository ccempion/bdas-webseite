import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { rowLocation } from "../location";
import { groups } from "../schema";
import type { GroupKind, GroupStatus, GroupSummary } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type ListOpts = {
  /** Restrict by status. Omit to include every status (admin views). */
  readonly status?: GroupStatus | undefined;
};

/** Returns groups ordered by city then name. */
export async function listGroups(db: Db, opts: ListOpts = {}): Promise<GroupSummary[]> {
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
    .where(opts.status ? eq(groups.status, opts.status) : undefined)
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
