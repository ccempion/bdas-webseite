/**
 * This module's GDPR self-service contributions (Art. 15 export, Art. 17
 * purge step) for the account-deletion feature. `files`/`folders` are keyed
 * by `members.id` (CLAUDE.md §1 rule 1 — this module reads neither `members`
 * nor `auth_users` directly), so both functions translate the caller's
 * `userId` via the composed `MemberIdResolver` before touching either table.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@bdas/db";

import { files, type FileStatus } from "../schema";
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
