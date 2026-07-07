import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
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

async function listByTimeframe(
  db: Db,
  viewer: Viewer,
  timeframe: "upcoming" | "past",
  opts: ListOpts,
): Promise<ReadonlyArray<EventWithCounts>> {
  const now = new Date();
  const conds = [
    eq(events.status, "published"),
    timeframe === "upcoming" ? gte(events.startsAt, now) : lt(events.startsAt, now),
  ];
  if (opts.groupId !== undefined) {
    conds.push(opts.groupId === null ? isNull(events.groupId) : eq(events.groupId, opts.groupId));
  }
  const rows = await db
    .select()
    .from(events)
    .where(and(...conds))
    .orderBy(timeframe === "upcoming" ? asc(events.startsAt) : desc(events.startsAt));
  const visible = rows.filter((r) => canView(viewer, rowToEvent(r)));
  return withCounts(db, visible);
}

/**
 * Upcoming, published events the viewer may see (visibility-filtered), ordered
 * by start time. The visibility predicate runs in JS (small N) — see canView.
 */
export function listUpcomingEvents(
  db: Db,
  viewer: Viewer,
  opts: ListOpts = {},
): Promise<ReadonlyArray<EventWithCounts>> {
  return listByTimeframe(db, viewer, "upcoming", opts);
}

/**
 * Past, published events the viewer may see (visibility-filtered), newest-first.
 * Mirrors listUpcomingEvents for the /events "Vergangene" section.
 */
export function listPastEvents(
  db: Db,
  viewer: Viewer,
  opts: ListOpts = {},
): Promise<ReadonlyArray<EventWithCounts>> {
  return listByTimeframe(db, viewer, "past", opts);
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
