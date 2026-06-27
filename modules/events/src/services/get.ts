import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { eventRegistrations, events } from "../schema";
import type { EventItem, EventWithCounts } from "../types";

import { rowToEvent } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * The reader's context, used for visibility filtering. The app builds this from
 * `getCurrentMember` (grants + member). Anonymous visitors pass an empty viewer.
 */
export type Viewer = {
  /** Member with status 'active' (gates `members_only` events). */
  readonly isActiveMember: boolean;
  /** Groups the viewer belongs to (gates `group_only` events). */
  readonly memberGroupIds: ReadonlyArray<string>;
  /** Federal board sees and manages everything. */
  readonly isFederal: boolean;
  /** Groups the viewer is local board of (sees drafts + manages those events). */
  readonly boardGroupIds: ReadonlyArray<string>;
  /** Groups the viewer is an event_organizer of (manages those events; ADR 0017). */
  readonly organizerGroupIds: ReadonlyArray<string>;
};

export const ANON: Viewer = {
  isActiveMember: false,
  memberGroupIds: [],
  isFederal: false,
  boardGroupIds: [],
  organizerGroupIds: [],
};

/** Whether the viewer may create/edit/publish/cancel/delete this event. */
export function canManage(v: Viewer, event: Pick<EventItem, "groupId">): boolean {
  if (v.isFederal) return true;
  if (event.groupId === null) return false;
  return v.boardGroupIds.includes(event.groupId) || v.organizerGroupIds.includes(event.groupId);
}

/** Whether the viewer may see this event at all. */
export function canView(v: Viewer, event: EventItem): boolean {
  if (canManage(v, event)) return true;
  if (event.status !== "published") return false; // drafts/cancelled: managers only
  switch (event.visibility) {
    case "public":
      return true;
    case "members_only":
      return v.isActiveMember;
    case "group_only":
      return event.groupId !== null && v.memberGroupIds.includes(event.groupId);
  }
}

export async function countsFor(
  db: Db,
  eventId: string,
): Promise<{ confirmed: number; waitlist: number }> {
  const confirmed = await db
    .select({ n: count() })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, eventId),
        isNull(eventRegistrations.cancelledAt),
        isNull(eventRegistrations.waitlistPosition),
      ),
    );
  const waitlist = await db
    .select({ n: count() })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, eventId),
        isNull(eventRegistrations.cancelledAt),
        isNotNull(eventRegistrations.waitlistPosition),
      ),
    );
  return { confirmed: Number(confirmed[0]?.n ?? 0), waitlist: Number(waitlist[0]?.n ?? 0) };
}

/** Returns the event with counts if the viewer may see it, else null. */
export async function getEvent(
  db: Db,
  id: string,
  viewer: Viewer,
): Promise<EventWithCounts | null> {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!rows[0]) return null;
  const event = rowToEvent(rows[0]);
  if (!canView(viewer, event)) return null;
  const c = await countsFor(db, id);
  return { ...event, confirmedCount: c.confirmed, waitlistCount: c.waitlist };
}
