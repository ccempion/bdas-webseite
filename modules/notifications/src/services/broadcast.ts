/**
 * Send-to-many: one organizer-authored message to a list of members. Each
 * recipient is an independent `sendTransactional` (own resolve + own
 * `notification_log` row), so a single unresolvable or failing recipient never
 * aborts the rest. v1 is a sequential loop — rosters are small; a real queue is
 * a later concern.
 */
import type { Db } from "@bdas/db";

import { sendTransactional } from "./send";

export type OrganizerMessage = {
  readonly memberIds: ReadonlyArray<string>;
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
  return { sent, failed, skipped };
}
