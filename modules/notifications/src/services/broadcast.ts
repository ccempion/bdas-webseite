/**
 * Send-to-many: one organizer-authored message to a list of members. Each
 * recipient is an independent `sendTransactional` (own resolve + own
 * `notification_log` row), so a single unresolvable or failing recipient never
 * aborts the rest. v1 is a sequential loop — rosters are small; a real queue is
 * a later concern.
 */
import type { Db } from "@bdas/db";
import { createId } from "@bdas/id";
import { desc, eq } from "drizzle-orm";

import { eventBroadcast } from "../schema";
import { sendTransactional, sendTransactionalToGuest } from "./send";

export type OrganizerMessage = {
  readonly memberIds: ReadonlyArray<string>;
  /** Non-member guest recipients (Slice 4), addressed by raw email. */
  readonly guests?: ReadonlyArray<{ readonly email: string; readonly name?: string | null }>;
  readonly eventTitle: string;
  readonly eventId?: string;
  readonly eventUrl?: string | undefined;
  readonly subject: string;
  readonly body: string;
};

export type BroadcastResult = {
  readonly sent: number;
  readonly failed: number;
  /** Recipients whose contact could not be resolved (no send, no log). */
  readonly skipped: number;
};

export async function sendOrganizerMessage(
  db: Db,
  msg: OrganizerMessage,
): Promise<BroadcastResult> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const memberId of msg.memberIds) {
    const result = await sendTransactional(db, "event_organizer_message", memberId, {
      eventTitle: msg.eventTitle,
      eventId: msg.eventId,
      eventUrl: msg.eventUrl,
      subject: msg.subject,
      messageBody: msg.body,
    });
    if (!result) skipped += 1;
    else if (result.status === "sent") sent += 1;
    else failed += 1;
  }
  for (const guest of msg.guests ?? []) {
    const result = await sendTransactionalToGuest(
      db,
      "event_organizer_message",
      { email: guest.email, name: guest.name },
      {
        eventTitle: msg.eventTitle,
        eventId: msg.eventId,
        eventUrl: msg.eventUrl,
        subject: msg.subject,
        messageBody: msg.body,
      },
    );
    if (result.status === "sent") sent += 1;
    else failed += 1;
  }

  // No eventId (not currently a real caller) means nothing to key the history
  // view on, so the broadcast itself goes unrecorded — the sends still happen.
  if (msg.eventId) {
    await db.insert(eventBroadcast).values({
      id: createId("bcst"),
      eventId: msg.eventId,
      subject: msg.subject,
      body: msg.body,
      recipientCount: sent,
    });
  }

  return { sent, failed, skipped };
}

export type BroadcastLogEntry = {
  readonly id: string;
  readonly eventId: string;
  readonly subject: string;
  readonly body: string;
  readonly recipientCount: number;
  readonly createdAt: Date;
};

/** Past broadcasts for one event, newest first — for the admin history view. */
export async function listBroadcastsForEvent(
  db: Db,
  eventId: string,
): Promise<ReadonlyArray<BroadcastLogEntry>> {
  return db
    .select()
    .from(eventBroadcast)
    .where(eq(eventBroadcast.eventId, eventId))
    .orderBy(desc(eventBroadcast.createdAt));
}
