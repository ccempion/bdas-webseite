"use server";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { isFlagOn } from "@bdas/feature-flags";
import {
  confirmUpload,
  deleteFile,
  getDownloadUrl,
  requestUpload,
  type FileMeta,
  type UploadRequest,
} from "@bdas/files";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";

export type DownloadResult = { readonly url: string } | { readonly error: string };
export type RequestUploadResult =
  | { readonly fileId: string; readonly uploadUrl: string }
  | { readonly error: string };
export type ConfirmUploadResult = { readonly file: FileMeta } | { readonly error: string };
export type DeleteFileResult = { readonly ok: true } | { readonly error: string };

/**
 * Resolve a signed, time-limited download URL for one file. The service
 * read-gates by the caller's permissions and logs a 'download' entry; the
 * browser then fetches the bytes straight from storage (the app never proxies).
 */
export async function getDownloadUrlAction(fileId: string): Promise<DownloadResult> {
  if (!isFlagOn("files")) return { error: "Nicht verfügbar." };

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    const signed = await getDownloadUrl(getDb(), fileId, me);
    return { url: signed.url };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}

/**
 * Upload phase 1: reserve a pending row and mint a signed PUT URL. The service
 * write-gates the folder and validates the DECLARED type/size/quota; the client
 * then PUTs bytes straight to the returned URL (the app never proxies bytes).
 */
export async function requestUploadAction(
  folderId: string,
  input: UploadRequest,
): Promise<RequestUploadResult> {
  if (!isFlagOn("files")) return { error: "Nicht verfügbar." };

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    const { fileId, uploadUrl } = await requestUpload(getDb(), folderId, input, me);
    return { fileId, uploadUrl: uploadUrl.url };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}

/**
 * Upload phase 2: after the bytes land, re-check the real object size server-side
 * and promote the row to 'ready'. Anything half-uploaded is rolled back inside
 * the service and surfaced here as a German error.
 */
export async function confirmUploadAction(fileId: string): Promise<ConfirmUploadResult> {
  if (!isFlagOn("files")) return { error: "Nicht verfügbar." };

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    const file = await confirmUpload(getDb(), fileId, me);
    return { file };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}

/** Delete one file (object then row). Write-gated and logged by the service. */
export async function deleteFileAction(fileId: string): Promise<DeleteFileResult> {
  if (!isFlagOn("files")) return { error: "Nicht verfügbar." };

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    await deleteFile(getDb(), fileId, me);
    return { ok: true };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}
