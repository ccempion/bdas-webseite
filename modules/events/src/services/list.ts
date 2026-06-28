import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { eventRegistrations, events } from "../schema";
import type { EventWithCounts } from "../types";

import { canView, type Viewer } from "./get";
import { rowToEvent } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type ListOpts = {
  /** Restrict to one group (null = federation-wide events only). */
  readonly groupId?: string | null;
};

/**
 * Attach confirmed/waitlist counts to a set of events with a single grouped
 * aggregate (one round-trip) rather than two count() queries per event — the
 * latter fanned out to 1 + 2N serialized queries and timed out the federal
 * board views. Matches the partial index event_registrations_event_idx.
 */
async function withCounts(db: Db, rows: ReadonlyArray<typeof events.$inferSelect>) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const counts = await db
    .select({
      eventId: eventRegistrations.eventId,
      confirmed: sql<number>`count(*) filter (where ${eventRegistrations.waitlistPosition} is null)`,
      waitlist: sql<number>`count(*) filter (where ${eventRegistrations.waitlistPosition} is not null)`,
    })
    .from(eventRegistrations)
    .where(and(inArray(eventRegistrations.eventId, ids), isNull(eventRegistrations.cancelledAt)))
    .groupBy(eventRegistrations.eventId);
  const byId = new Map(counts.map((c) => [c.eventId, c]));
  return rows.map((r) => {
    const c = byId.get(r.id);
    return {
      ...rowToEvent(r),
      confirmedCount: Number(c?.confirmed ?? 0),
      waitlistCount: Number(c?.waitlist ?? 0),
    } satisfies EventWithCounts;
  });
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
 * Federal board sees all; local board and event organizers see their groups' events.
 */
export async function listManagedEvents(
  db: Db,
  viewer: Viewer,
): Promise<ReadonlyArray<EventWithCounts>> {
  if (viewer.isFederal) {
    const rows = await db.select().from(events).orderBy(asc(events.startsAt));
    return withCounts(db, rows);
  }
  const manageGroupIds = [...new Set([...viewer.boardGroupIds, ...viewer.organizerGroupIds])];
  if (manageGroupIds.length === 0) return withCounts(db, []);
  const rows = await db
    .select()
    .from(events)
    .where(inArray(events.groupId, manageGroupIds))
    .orderBy(asc(events.startsAt));
  return withCounts(db, rows);
}
