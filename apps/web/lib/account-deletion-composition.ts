import type { CompletionMail, DeletionStep } from "@bdas/auth";
import { deleteContentByAuthor, deleteMediaByAuthor, type PrefixDeletableBucket } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { clearOrganizerForUser } from "@bdas/events-module";
import { deleteFilesByMember } from "@bdas/files";
import { deleteLogEntry, deleteLogForMember, sendTransactionalToGuest } from "@bdas/notifications";
import { getBlogMediaStorage } from "@bdas/storage";

/**
 * The module steps of the account-deletion sweep, in the order the engine runs
 * them (files → blog → events → notifications; the engine adds `auth` and
 * `email_c`). Every step resolves member ids from the still-existing user, so
 * none may run after `auth`. The newsletter has no step: it erases itself when
 * `deleteAccount` publishes `auth.user.deleted`, which needs `bootNewsletter()`
 * in the calling process.
 */
export function buildDeletionSteps(
  blogMedia: () => PrefixDeletableBucket = getBlogMediaStorage,
): DeletionStep[] {
  return [
    { name: "files", run: (db, userId) => deleteFilesByMember(db, userId) },
    {
      name: "blog",
      run: async (db, userId) => {
        await deleteContentByAuthor(db, userId);
        await deleteMediaByAuthor(blogMedia(), userId);
      },
    },
    { name: "events", run: (db, userId) => clearOrganizerForUser(db, userId) },
    { name: "notifications", run: (db, userId) => deleteLogForMember(db, userId) },
  ];
}

/**
 * The guest send logs `to_email` with a null member, which
 * `deleteLogForMember` cannot reach, so the row is deleted here — whether or
 * not the mail went out — or the erased address would outlive the account.
 */
export const completionMail: CompletionMail = {
  async send(to) {
    const db = getDb();
    const result = await sendTransactionalToGuest(db, "account_deletion_completed", to, {});
    await deleteLogEntry(db, result.logId);
    return result.status;
  },
};
