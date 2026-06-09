import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { events } from "../schema";
import type { EventWithCounts } from "../types";

import { canView, countsFor, type Viewer } from "./get";
import { rowToEvent } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type ListOpts = {
  /** Restrict to one group (null = federation-wide events only). */
  readonly groupId?: string | null;
};

async function withCounts(db: Db, rows: ReadonlyArray<typeof events.$inferSelect>) {
  const out: EventWithCounts[] = [];
  for (const r of rows) {
    const c = await countsFor(db, r.id);
    out.push({ ...rowToEvent(r), confirmedCount: c.confirmed, waitlistCount: c.waitlist });
  }
  return out;
}

/**
 * Upcoming, published events the viewer may see (visibility-filtered), ordered
 * by start time. The visibility predicate runs in JS (small N) — see canView.
 */
export async function listUpcomingEvents(
  db: Db,
  viewer: Viewer,
  opts: ListOpts = {},
): Promise<ReadonlyArray<EventWithCounts>> {
  const conds = [eq(events.status, "published"), gte(events.startsAt, new Date())];
  if (opts.groupId !== undefined) {
    conds.push(opts.groupId === null ? isNull(events.groupId) : eq(events.groupId, opts.groupId));
  }
  const rows = await db
    .select()
    .from(events)
    .where(and(...conds))
    .orderBy(asc(events.startsAt));
  const visible = rows.filter((r) => canView(viewer, rowToEvent(r)));
  return withCounts(db, visible);
}

/**
 * Every event the viewer manages (any status), for the board admin views.
 * Federal board sees all; local board sees its own groups' events.
 */
export async function listManagedEvents(
  db: Db,
  viewer: Viewer,
): Promise<ReadonlyArray<EventWithCounts>> {
  const rows = viewer.isFederal
    ? await db.select().from(events).orderBy(asc(events.startsAt))
    : viewer.boardGroupIds.length === 0
      ? []
      : await db
          .select()
          .from(events)
          .where(inArray(events.groupId, [...viewer.boardGroupIds]))
          .orderBy(asc(events.startsAt));
  return withCounts(db, rows);
}
