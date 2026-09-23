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
 * goes. Their export (the member's own registrations/attendance history) is
 * NOT covered by `exportForUser` below either — that needs a resolver
 * (`members.id`, not the plain `userId` this module otherwise uses) and is a
 * confirmed requirement for PR7 (export completion), not this PR.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { events } from "../schema";
import type { EventItem } from "../types";
import { rowToEvent } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Art. 15 — this module's slice of a user's full data export: every event
 * they organized. Does not include registrations/attendance as a
 * participant (see module docstring above — that's PR7's job).
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
