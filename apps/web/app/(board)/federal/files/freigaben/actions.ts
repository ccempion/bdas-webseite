"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { isFlagOn } from "@bdas/feature-flags";
import { grantFolderAccess, revokeFolderAccess } from "@bdas/files";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../../lib/auth-cookie";

export type FreigabeResult = { ok: true } | { ok: false; error: string };

const PATH = "/federal/files/freigaben";

/**
 * Opens a folder for one person (ADR 0047). Only the federal board may; the
 * service checks that against the session, whatever the client sends.
 */
export async function grantFolderAccessAction(
  folderId: string,
  memberId: string,
  canWrite: boolean,
): Promise<FreigabeResult> {
  if (!isFlagOn("files")) return { ok: false, error: "Nicht verfügbar." };
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return { ok: false, error: "Anmeldung erforderlich." };
  try {
    await grantFolderAccess(db, folderId, memberId, { canWrite }, me);
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function revokeFolderAccessAction(
  folderId: string,
  memberId: string,
): Promise<FreigabeResult> {
  if (!isFlagOn("files")) return { ok: false, error: "Nicht verfügbar." };
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return { ok: false, error: "Anmeldung erforderlich." };
  try {
    await revokeFolderAccess(db, folderId, memberId, me);
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath(PATH);
  return { ok: true };
}
