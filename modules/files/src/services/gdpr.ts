/**
 * This module's GDPR self-service contributions (Art. 15 export, Art. 17
 * purge step) for the account-deletion feature. `files`/`folders` are keyed
 * by `members.id` (CLAUDE.md §1 rule 1 — this module reads neither `members`
 * nor `auth_users` directly), so both functions translate the caller's
 * `userId` via the composed `MemberIdResolver` before touching either table.
 */
import { and, desc, eq, isNotNull, notExists, sql } from "drizzle-orm";
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
 * Fails loud on a real Storage error: SupabaseStorageClient.deleteObject only
 * throws when Supabase's `error` field is actually set (auth, timeout, 5xx —
 * a missing object does NOT throw), so every catch here is a genuine
 * failure, not a "already gone" false positive. On failure the row is kept
 * (so a retry re-attempts it) and the loop continues to make as much forward
 * progress as possible; once every file has been attempted and folder
 * cleanup has run for whatever became empty, the function throws a single
 * aggregate Error naming every file whose storage object could not be
 * deleted, so the caller (the orchestrator) sees a rejected promise.
 *
 * Idempotent: a second call after everything is already gone finds nothing
 * to resolve, delete, or clean up and returns cleanly — the orchestrator's
 * retry-safe per-step design (spec §5) depends on every step behaving this
 * way, same contract as notifications.deleteLogForMember. A retry after a
 * partial failure re-selects only the still-present file rows (the
 * successfully-deleted ones are already gone) and re-attempts just those.
 *
 * Root folders are never a cleanup candidate (parent_id IS NOT NULL below),
 * matching deleteFolder's D5 invariant (folder-writes.ts) — they're
 * system-provisioned by ensureFolders, not something this purge owns.
 *
 * Concurrent uploads: each folder is removed via deleteFolderIfEmpty, which
 * locks the folder row before checking emptiness, so a file another member
 * is uploading into it at that moment is never cascaded away. deleteFolder
 * (folder-writes.ts) still has the unlocked form of this race; fixing it is
 * a separate follow-up PR.
 */
export async function deleteFilesByMember(db: Db, userId: string): Promise<void> {
  const memberId = await getMemberIdResolver().resolveMemberId(db, userId);
  if (!memberId) return;

  const owned = await db.select().from(files).where(eq(files.uploadedBy, memberId));
  const failures: string[] = [];
  for (const file of owned) {
    try {
      await getStorage().deleteObject(file.storageKey);
    } catch (err) {
      console.error(
        `[files] deleteFilesByMember: failed to delete storage object "${file.storageKey}" for file ${file.id}:`,
        err,
      );
      failures.push(file.id);
      continue;
    }
    await db.delete(files).where(eq(files.id, file.id));
  }

  // Deepest first, so a parent that only becomes empty once its child is
  // gone is still caught in the same pass.
  const created = await db
    .select()
    .from(folders)
    .where(and(eq(folders.createdBy, memberId), isNotNull(folders.parentId)))
    .orderBy(desc(folders.depth));

  for (const folder of created) {
    await deleteFolderIfEmpty(db, folder.id);
  }

  if (failures.length > 0) {
    throw new Error(
      `deleteFilesByMember: failed to delete ${failures.length} storage object(s) for member ${memberId}: ${failures.join(", ")}`,
    );
  }
}

/**
 * Deletes the folder only if it holds no files and no subfolders; true when
 * it was deleted. A single `DELETE ... WHERE NOT EXISTS` is not enough under
 * READ COMMITTED: a concurrent `INSERT INTO files` holds only FOR KEY SHARE
 * on the folder row, the DELETE waits for it but does not re-evaluate its
 * NOT EXISTS afterwards, and files.folder_id's ON DELETE CASCADE then takes
 * the just-committed file with it. Locking the row FOR UPDATE first waits
 * out in-flight inserts and blocks new ones (they fail on the FK once the
 * folder is gone); the DELETE, as a separate statement, then checks
 * emptiness against a fresh snapshot.
 */
async function deleteFolderIfEmpty(db: Db, folderId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: folders.id })
      .from(folders)
      .where(eq(folders.id, folderId))
      .for("update");
    if (!locked) return false;
    const child = alias(folders, "child");
    const gone = await tx
      .delete(folders)
      .where(
        and(
          eq(folders.id, folderId),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(files)
              .where(eq(files.folderId, folderId)),
          ),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(child)
              .where(eq(child.parentId, folderId)),
          ),
        ),
      )
      .returning({ id: folders.id });
    return gone.length > 0;
  });
}
