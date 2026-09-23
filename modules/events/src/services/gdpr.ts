/**
 * This module's GDPR self-service contributions (Art. 15 export, Art. 17
 * purge) for the account-deletion feature. `events.created_by` is a plain
 * auth-user id with no FK (same shape as blog's `posts.created_by`) — this
 * module needs no MemberIdResolver, unlike `files`/`notifications`.
 *
 * Events survive account deletion — they're institutional club history, not
 * personal expression the way a blog post is (design spec §5 step 3). Only
 * the organizer reference is cleared, never the event row itself.
 *
 * `event_registrations`/`event_attendance` are NOT touched here: both are
 * keyed by `members.id` with `ON DELETE CASCADE`, so they're already removed
 * for free by the final `auth.deleteAccount()` cascade once the member row
 * goes. Registrations/attendance are exported by `exportParticipationForMember`
 * (keyed by `members.id`, passed in by the caller from the session).
 */
import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { eventAttendance, eventRegistrations, events } from "../schema";
import type { EventItem } from "../types";
import { rowToEvent } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Art. 15 — this module's slice of a user's full data export: every event
 * they organized. Does not include registrations/attendance as a
 * participant (see `exportParticipationForMember`).
 */
export async function exportForUser(db: Db, userId: string): Promise<readonly EventItem[]> {
  const rows = await db.select().from(events).where(eq(events.createdBy, userId));
  return rows.map(rowToEvent);
}

/**
 * Art. 17 purge step, run by the account-deletion orchestrator (a later
 * PR). Clears the organizer reference on every event this user organized —
 * the events themselves are never deleted or modified beyond this one
 * column.
 */
export async function clearOrganizerForUser(db: Db, userId: string): Promise<void> {
  await db.update(events).set({ createdBy: null }).where(eq(events.createdBy, userId));
}

export type ParticipationRegistration = {
  readonly registrationId: string;
  readonly eventId: string;
  readonly eventTitle: string;
  readonly eventStartsAt: Date;
  readonly registeredAt: Date;
  readonly cancelledAt: Date | null;
  readonly waitlistPosition: number | null;
};

export type ParticipationAttendance = {
  readonly eventId: string;
  readonly eventTitle: string;
  readonly eventStartsAt: Date;
  readonly attended: boolean;
  readonly checkedInAt: Date | null;
};

export type ParticipationExport = {
  readonly registrations: readonly ParticipationRegistration[];
  readonly attendance: readonly ParticipationAttendance[];
};

/**
 * Art. 15 — the member's registrations and attendance as a participant. Takes
 * `members.id` and TRUSTS its caller: derive it from the session principal,
 * never from request input (plan D3). Omits `checked_in_by` (another
 * person's id) and all `guest_*` fields incl. `guest_cancel_token` (secret);
 * cancelled and waitlisted registrations are included on purpose — still
 * the member's data.
 */
export async function exportParticipationForMember(
  db: Db,
  memberId: string,
): Promise<ParticipationExport> {
  const registrations = await db
    .select({
      registrationId: eventRegistrations.id,
      eventId: events.id,
      eventTitle: events.title,
      eventStartsAt: events.startsAt,
      registeredAt: eventRegistrations.registeredAt,
      cancelledAt: eventRegistrations.cancelledAt,
      waitlistPosition: eventRegistrations.waitlistPosition,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .where(eq(eventRegistrations.memberId, memberId))
    .orderBy(asc(eventRegistrations.registeredAt));

  const attendance = await db
    .select({
      eventId: events.id,
      eventTitle: events.title,
      eventStartsAt: events.startsAt,
      attended: eventAttendance.attended,
      checkedInAt: eventAttendance.checkedInAt,
    })
    .from(eventAttendance)
    .innerJoin(events, eq(eventAttendance.eventId, events.id))
    .where(eq(eventAttendance.memberId, memberId))
    .orderBy(asc(events.startsAt));

  return { registrations, attendance };
}
