"use server";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { isFlagOn } from "@bdas/feature-flags";
import { createFolder, deleteFolder, renameFolder } from "@bdas/files";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";

export type FolderActionResult = { readonly ok: true } | { readonly error: string };

/**
 * Create a subfolder. The service write-gates against the PARENT and copies its
 * scope/group onto the child, so there is no permission input to validate here.
 */
export async function createFolderAction(
  parentId: string,
  name: string,
  description: string,
): Promise<FolderActionResult> {
  if (!isFlagOn("files")) return { error: "Nicht verfügbar." };

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    await createFolder(getDb(), { parentId, name, description }, me);
    return { ok: true };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}

/** Rename a subfolder and reword its description. Roots are refused by the service. */
export async function renameFolderAction(
  folderId: string,
  name: string,
  description: string,
): Promise<FolderActionResult> {
  if (!isFlagOn("files")) return { error: "Nicht verfügbar." };

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    await renameFolder(getDb(), folderId, { name, description }, me);
    return { ok: true };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}

/** Delete an empty subfolder. Non-empty and root deletions are refused by the service. */
export async function deleteFolderAction(folderId: string): Promise<FolderActionResult> {
  if (!isFlagOn("files")) return { error: "Nicht verfügbar." };

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    await deleteFolder(getDb(), folderId, me);
    return { ok: true };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}
