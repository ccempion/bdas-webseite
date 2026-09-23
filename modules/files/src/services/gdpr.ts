/**
 * This module's GDPR self-service contributions (Art. 15 export, Art. 17
 * purge step) for the account-deletion feature. `files`/`folders` are keyed
 * by `members.id` (CLAUDE.md §1 rule 1 — this module reads neither `members`
 * nor `auth_users` directly), so both functions translate the caller's
 * `userId` via the composed `MemberIdResolver` before touching either table.
 */
import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@bdas/db";
import { getStorage } from "@bdas/storage";

import { files, folders, type FileStatus } from "../schema";
import { getMemberIdResolver } from "../resolver";

export type FileExportRow = {
  readonly id: string;
  readonly folderId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly status: FileStatus;
  readonly uploadedAt: Date;
};

/**
 * Art. 15 — this module's slice of a user's full data export: metadata for
 * every file they uploaded (never the object's bytes — the storage key stays
 * internal, same rule as FileMeta). Includes both 'pending' and 'ready'
 * files; a pending upload is still their personal data. Empty array when the
 * user has no resolvable member row (nothing was ever uploaded by them, or
 * the member row is already gone).
 */
export async function exportForUser(db: Db, userId: string): Promise<readonly FileExportRow[]> {
  const memberId = await getMemberIdResolver().resolveMemberId(db, userId);
  if (!memberId) return [];
  const rows = await db
    .select({
      id: files.id,
      folderId: files.folderId,
      filename: files.filename,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      status: files.status,
      uploadedAt: files.uploadedAt,
    })
    .from(files)
    .where(eq(files.uploadedBy, memberId));
  return rows.map((r) => ({ ...r, status: r.status as FileStatus }));
}

/**
 * Art. 17 purge step, run by the account-deletion orchestrator (a later PR)
 * BEFORE auth.deleteAccount()'s FK cascade reaches this module. A raw
 * cascade on files.uploaded_by (ON DELETE CASCADE) would delete file ROWS
 * but leak the underlying Storage objects — nothing else ever calls
 * getStorage().deleteObject() for them. This function deletes the object
 * before the row, for every file the member uploaded, then removes folders
 * this member created that the deletion leaves empty.
 *
 * Folders are cleaned up only when EMPTY, reusing deleteFolder's D4
 * invariant (folder-writes.ts): folders.scope has no private/personal
 * variant — every scope is a shared, organizational space — and created_by
 * is metadata about who happened to click "create", not ownership of the
 * contents. Deleting a non-empty folder because its creator is leaving would
 * take other members' files down with it. A folder with foreign content left
 * inside keeps today's behavior: created_by goes NULL (existing
 * ON DELETE SET NULL), the folder and its contents stay untouched.
 *
 * Idempotent: a second call after everything is already gone finds nothing
 * to resolve, delete, or clean up and returns cleanly — the orchestrator's
 * retry-safe per-step design (spec §5) depends on every step behaving this
 * way, same contract as notifications.deleteLogForMember.
 */
export async function deleteFilesByMember(db: Db, userId: string): Promise<void> {
  const memberId = await getMemberIdResolver().resolveMemberId(db, userId);
  if (!memberId) return;

  const owned = await db.select().from(files).where(eq(files.uploadedBy, memberId));
  for (const file of owned) {
    try {
      await getStorage().deleteObject(file.storageKey);
    } catch {
      // object may already be gone (e.g. a retried sweep); the row must still go
    }
    await db.delete(files).where(eq(files.id, file.id));
  }

  // Deepest first, so a parent that only becomes empty once its child is
  // gone is still caught in the same pass.
  const created = await db
    .select()
    .from(folders)
    .where(eq(folders.createdBy, memberId))
    .orderBy(desc(folders.depth));

  const child = alias(folders, "child");
  for (const folder of created) {
    await db.delete(folders).where(
      and(
        eq(folders.id, folder.id),
        notExists(
          db
            .select({ one: sql`1` })
            .from(files)
            .where(eq(files.folderId, folder.id)),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(child)
            .where(eq(child.parentId, folder.id)),
        ),
      ),
    );
  }
}
