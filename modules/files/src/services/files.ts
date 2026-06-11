import { and, eq, lt, sql } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@bdas/errors";
import { createId } from "@bdas/id";
import type { CurrentMember } from "@bdas/members";
import { getStorage, type SignedUrl } from "@bdas/storage";

import { ALLOWED_MIME, FOLDER_QUOTA_BYTES, MAX_FILE_BYTES } from "../constants";
import { canRead, canWrite } from "../permissions";
import { fileAccessLog, files } from "../schema";
import type { AccessAction, FileMeta, UploadRequest } from "../types";

import { getFolder } from "./folders";

type FileRow = typeof files.$inferSelect;

function rowToFileMeta(r: FileRow): FileMeta {
  return {
    id: r.id,
    folderId: r.folderId,
    filename: r.filename,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    status: r.status as FileMeta["status"],
    uploadedBy: r.uploadedBy,
    uploadedAt: r.uploadedAt,
    lastModifiedAt: r.lastModifiedAt,
  };
}

/** Every service entry point acts as a member; federal/board users have one. */
function requireActingMember(me: CurrentMember): { id: string } {
  if (!me.member) throw new ForbiddenError("Mitgliedsprofil erforderlich.");
  return { id: me.member.id };
}

/** Sum of READY file sizes in a folder (pending uploads never count). */
async function folderUsage(db: Db, folderId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${files.sizeBytes}), 0)` })
    .from(files)
    .where(and(eq(files.folderId, folderId), eq(files.status, "ready")));
  return Number(rows[0]?.total ?? 0);
}

async function writeAccessLog(db: Db, fileId: string | null, memberId: string, action: AccessAction): Promise<void> {
  await db.insert(fileAccessLog).values({ id: createId("fal"), fileId, memberId, action });
}

async function getFileRow(db: Db, fileId: string): Promise<FileRow> {
  const rows = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Datei nicht gefunden.");
  return row;
}

/**
 * Phase 1 of upload. Gates permission + MIME + cap + quota against the DECLARED
 * size, inserts a 'pending' row, and returns a signed PUT URL. The client PUTs
 * bytes direct to the object store; nothing is visible until confirmUpload.
 */
export async function requestUpload(
  db: Db,
  folderId: string,
  input: UploadRequest,
  byMember: CurrentMember,
): Promise<{ fileId: string; uploadUrl: SignedUrl }> {
  const actor = requireActingMember(byMember);
  const folder = await getFolder(db, folderId);
  if (!canWrite(folder, byMember)) throw new ForbiddenError("Kein Schreibzugriff auf diesen Ordner.");

  if (!ALLOWED_MIME.has(input.mimeType)) throw new ValidationError("Dateityp nicht erlaubt.");
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_FILE_BYTES) {
    throw new ValidationError("Datei überschreitet die maximale Größe (25 MB).");
  }
  const used = await folderUsage(db, folderId);
  if (used + input.sizeBytes > FOLDER_QUOTA_BYTES) {
    throw new ValidationError("Ordner-Speicherkontingent überschritten (5 GB).");
  }

  const fileId = createId("fil");
  const storageKey = `${folder.scope}/${folder.groupId ?? "_"}/${fileId}/${input.filename}`;
  await db.insert(files).values({
    id: fileId,
    folderId,
    filename: input.filename,
    storageKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    status: "pending",
    uploadedBy: actor.id,
  });

  const uploadUrl = await getStorage().signedUploadUrl({
    storageKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });
  return { fileId, uploadUrl };
}

/**
 * Phase 2 of upload. Re-checks the ACTUAL object size server-side (the client
 * could have lied at request time), promotes the row to 'ready', and logs the
 * upload. On a missing object or a real-size/quota violation, deletes the object
 * and the pending row and throws — nothing half-uploaded ever becomes visible.
 */
export async function confirmUpload(db: Db, fileId: string, byMember: CurrentMember): Promise<FileMeta> {
  const actor = requireActingMember(byMember);
  const row = await getFileRow(db, fileId);
  const folder = await getFolder(db, row.folderId);
  if (!canWrite(folder, byMember)) throw new ForbiddenError("Kein Schreibzugriff auf diesen Ordner.");

  const stat = await getStorage().statObject(row.storageKey);
  const rollback = async (): Promise<void> => {
    await getStorage().deleteObject(row.storageKey);
    await db.delete(files).where(eq(files.id, fileId));
  };

  if (!stat) {
    await db.delete(files).where(eq(files.id, fileId));
    throw new ValidationError("Es wurde keine hochgeladene Datei gefunden.");
  }
  if (stat.sizeBytes > MAX_FILE_BYTES) {
    await rollback();
    throw new ValidationError("Hochgeladene Datei überschreitet die maximale Größe (25 MB).");
  }
  const used = await folderUsage(db, row.folderId);
  if (used + stat.sizeBytes > FOLDER_QUOTA_BYTES) {
    await rollback();
    throw new ValidationError("Ordner-Speicherkontingent überschritten (5 GB).");
  }

  await db
    .update(files)
    .set({ status: "ready", sizeBytes: stat.sizeBytes, lastModifiedAt: new Date() })
    .where(eq(files.id, fileId));
  await writeAccessLog(db, fileId, actor.id, "upload");

  return rowToFileMeta({ ...row, status: "ready", sizeBytes: stat.sizeBytes });
}

/** Ready files in a folder, read-gated. Pending uploads are never listed. */
export async function listFiles(db: Db, folderId: string, forMember: CurrentMember): Promise<FileMeta[]> {
  requireActingMember(forMember);
  const folder = await getFolder(db, folderId);
  if (!canRead(folder, forMember)) throw new ForbiddenError("Kein Lesezugriff auf diesen Ordner.");
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.folderId, folderId), eq(files.status, "ready")));
  return rows.map(rowToFileMeta);
}

/** Signed download URL for one ready file. Read-gated; logs a 'download' row. */
export async function getDownloadUrl(db: Db, fileId: string, forMember: CurrentMember): Promise<SignedUrl> {
  const actor = requireActingMember(forMember);
  const row = await getFileRow(db, fileId);
  if (row.status !== "ready") throw new NotFoundError("Datei nicht gefunden.");
  const folder = await getFolder(db, row.folderId);
  if (!canRead(folder, forMember)) throw new ForbiddenError("Kein Lesezugriff auf diese Datei.");
  const url = await getStorage().signedDownloadUrl({ storageKey: row.storageKey });
  await writeAccessLog(db, fileId, actor.id, "download");
  return url;
}

/** Delete a file: object then row. Write-gated; logs 'delete' before removal. */
export async function deleteFile(db: Db, fileId: string, byMember: CurrentMember): Promise<void> {
  const actor = requireActingMember(byMember);
  const row = await getFileRow(db, fileId);
  const folder = await getFolder(db, row.folderId);
  if (!canWrite(folder, byMember)) throw new ForbiddenError("Kein Schreibzugriff auf diese Datei.");
  await writeAccessLog(db, fileId, actor.id, "delete");
  await getStorage().deleteObject(row.storageKey);
  await db.delete(files).where(eq(files.id, fileId));
}

/**
 * Delete pending uploads whose row predates `olderThan` — clients that requested
 * an upload but never confirmed. Removes the (possibly absent) object then the
 * row. Returns the count swept. Unwired in v1; Phase 3 attaches a cron.
 */
export async function sweepStalePendingUploads(db: Db, olderThan: Date): Promise<number> {
  const stale = await db
    .select()
    .from(files)
    .where(and(eq(files.status, "pending"), lt(files.uploadedAt, olderThan)));
  for (const row of stale) {
    try {
      await getStorage().deleteObject(row.storageKey);
    } catch {
      // object may never have been PUT; deleting the row is still correct
    }
    await db.delete(files).where(eq(files.id, row.id));
  }
  return stale.length;
}
