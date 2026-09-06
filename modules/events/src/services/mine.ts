/**
 * Read-side for "what has this member committed to".
 *
 * Separate from list.ts on purpose: that file answers "what may this viewer
 * see" and runs a visibility predicate. This one answers "what did this member
 * sign up for", where the registration itself is the authorisation — a member
 * holding a registration may always see that event on their own account page.
 */
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { eventRegistrations, events } from "../schema";
import type { MyRegistration } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

/** Default number of rows `/account` shows. */
const DEFAULT_LIMIT = 3;

/**
 * The member's next upcoming, non-cancelled registrations, soonest first.
 *
 * One joined query, not a list of events followed by a registration lookup per
 * event — the events module has been bitten by that fan-out before (see
 * `withCounts` in list.ts).
 *
 * Cancelled *events* drop out with the `published` predicate. That is
 * intentional: a cancelled event is not something to plan around, and the
 * member is told about the cancellation by e-mail.
 */
export async function listMyUpcomingRegistrations(
  db: Db,
  memberId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<ReadonlyArray<MyRegistration>> {
  const rows = await db
    .select({
      eventId: events.id,
      title: events.title,
      startsAt: events.startsAt,
      location: events.location,
      locationName: events.locationName,
      groupId: events.groupId,
      waitlistPosition: eventRegistrations.waitlistPosition,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .where(
      and(
        eq(eventRegistrations.memberId, memberId),
        isNull(eventRegistrations.cancelledAt),
        eq(events.status, "published"),
        gte(events.startsAt, new Date()),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(limit);

  return rows.map((r) => ({
    eventId: r.eventId,
    title: r.title,
    startsAt: r.startsAt,
    location: r.locationName ?? r.location,
    groupId: r.groupId,
    waitlistPosition: r.waitlistPosition,
  }));
}
