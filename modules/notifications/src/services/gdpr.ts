/**
 * This module's GDPR self-service contributions (Art. 15 export, Art. 17
 * purge step) for the account-deletion feature. `notification_log` is keyed
 * by `member_id` (CLAUDE.md §1 rule 1 — this module reads neither `members`
 * nor `auth_users` directly), so both functions translate the caller's
 * `userId` via the composed `MemberIdResolver` before touching the table.
 *
 * `deleteLogForMember` is not made redundant by the FK cascade
 * (`notification_log.member_id` → `members.id` → `auth_users.id`, both
 * `ON DELETE CASCADE`): that cascade only fires once `auth.deleteAccount`
 * actually runs. This function is this module's own, independently correct
 * purge step for the orchestrator (a later PR) to call before that point —
 * relying on an implicit downstream cascade would silently break if that FK
 * behavior ever changes for retention reasons, the same class of change
 * decision 2 in the design spec already made for `file_access_log`.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@bdas/db";

import { getMemberIdResolver } from "../resolver";
import { notificationLog } from "../schema";

export type NotificationLogExportRow = {
  readonly id: string;
  readonly channel: string;
  readonly template: string;
  readonly toEmail: string;
  readonly subject: string;
  readonly status: string;
  readonly error: string | null;
  readonly createdAt: Date;
};

/**
 * Art. 15 — this module's slice of a user's full data export. Empty array
 * when the user has no resolvable member row (nothing was ever sent to
 * them, or the member row is already gone).
 */
export async function exportForUser(
  db: Db,
  userId: string,
): Promise<readonly NotificationLogExportRow[]> {
  const memberId = await getMemberIdResolver().resolveMemberId(db, userId);
  if (!memberId) return [];
  return db
    .select({
      id: notificationLog.id,
      channel: notificationLog.channel,
      template: notificationLog.template,
      toEmail: notificationLog.toEmail,
      subject: notificationLog.subject,
      status: notificationLog.status,
      error: notificationLog.error,
      createdAt: notificationLog.createdAt,
    })
    .from(notificationLog)
    .where(eq(notificationLog.memberId, memberId));
}

/**
 * Art. 17 purge step. Idempotent: a second call after the rows (or the
 * member row itself) are already gone finds nothing to resolve or delete
 * and returns cleanly rather than throwing — the orchestrator's retry-safe
 * per-step design (spec §5) depends on every step behaving this way.
 */
export async function deleteLogForMember(db: Db, userId: string): Promise<void> {
  const memberId = await getMemberIdResolver().resolveMemberId(db, userId);
  if (!memberId) return;
  await db.delete(notificationLog).where(eq(notificationLog.memberId, memberId));
}

/**
 * Removes one log row by primary key. Exists because a guest send
 * (`sendTransactionalToGuest`) logs `member_id = NULL` with the recipient's
 * address, so `deleteLogForMember` cannot reach it and it would otherwise keep
 * the erased person's e-mail. Idempotent: an unknown or already-deleted id is
 * a no-op.
 */
export async function deleteLogEntry(db: Db, logId: string): Promise<void> {
  await db.delete(notificationLog).where(eq(notificationLog.id, logId));
}
