import { and, count, eq, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Db } from "@bdas/db";
import { ConflictError, ForbiddenError, ValidationError } from "@bdas/errors";
import { createId } from "@bdas/id";
import type { CurrentMember } from "@bdas/members";

import { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from "../constants";
import { canWrite } from "../permissions";
import { files, folders } from "../schema";
import { slugifyFolderName } from "../slug";
import type { Folder } from "../types";
import { getFolder, rowToFolder } from "./folders";

function requireActingMember(me: CurrentMember): { id: string } {
  if (!me.member) throw new ForbiddenError("Mitgliedsprofil erforderlich.");
  return { id: me.member.id };
}

/** Trim + length-check a folder name, returning it with its slug. */
function normalizeName(raw: string): { name: string; slug: string } {
  const name = raw.trim();
  if (name === "") throw new ValidationError("Ordnername darf nicht leer sein.");
  if (name.length > MAX_FOLDER_NAME_LENGTH) {
    throw new ValidationError(`Ordnername ist zu lang (max. ${MAX_FOLDER_NAME_LENGTH} Zeichen).`);
  }
  return { name, slug: slugifyFolderName(name) };
}

/** Throw if `slug` is already taken by a different child of `parentId`. */
async function assertSlugFree(
  db: Db,
  parentId: string,
  slug: string,
  exceptFolderId?: string,
): Promise<void> {
  const clash = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.parentId, parentId), eq(folders.slug, slug)))
    .limit(2);
  if (clash.some((r) => r.id !== exceptFolderId)) {
    throw new ConflictError("Ein Ordner mit diesem Namen existiert hier bereits.");
  }
}

/**
 * Create a subfolder. It permanently inherits the parent's scope and group
 * (spec D1), so no permission choice is offered and none can be made. The
 * right to create is exactly the right to upload into the parent (D2) — no
 * new role logic.
 */
export async function createFolder(
  db: Db,
  input: { parentId: string; name: string; description?: string },
  byMember: CurrentMember,
): Promise<Folder> {
  const actor = requireActingMember(byMember);
  const parent = await getFolder(db, input.parentId);
  if (!canWrite(parent, byMember)) {
    throw new ForbiddenError("Kein Schreibzugriff auf diesen Ordner.");
  }
  if (parent.depth >= MAX_FOLDER_DEPTH) {
    throw new ValidationError(`Maximale Ordnertiefe (${MAX_FOLDER_DEPTH}) erreicht.`);
  }

  const { name, slug } = normalizeName(input.name);
  await assertSlugFree(db, parent.id, slug);

  const rows = await db
    .insert(folders)
    .values({
      id: createId("fld"),
      slug,
      name,
      scope: parent.scope,
      groupId: parent.groupId,
      parentId: parent.id,
      depth: parent.depth + 1,
      description: input.description?.trim() ?? "",
      createdBy: actor.id,
    })
    .returning();

  const row = rows[0];
  if (!row) throw new ConflictError("Ordner konnte nicht angelegt werden.");
  return rowToFolder(row);
}

/**
 * Rename a subfolder and optionally reword its description. Roots are
 * system-provisioned (D5) — ensureFolders rewrites their names at every boot,
 * so allowing a rename here would produce a change that silently reverts.
 */
export async function renameFolder(
  db: Db,
  folderId: string,
  input: { name: string; description?: string },
  byMember: CurrentMember,
): Promise<Folder> {
  requireActingMember(byMember);
  const folder = await getFolder(db, folderId);
  if (folder.parentId === null) {
    throw new ForbiddenError("Systemordner können nicht umbenannt werden.");
  }
  if (!canWrite(folder, byMember)) {
    throw new ForbiddenError("Kein Schreibzugriff auf diesen Ordner.");
  }

  const { name, slug } = normalizeName(input.name);
  await assertSlugFree(db, folder.parentId, slug, folder.id);

  const rows = await db
    .update(folders)
    .set({
      name,
      slug,
      ...(input.description === undefined ? {} : { description: input.description.trim() }),
    })
    .where(eq(folders.id, folder.id))
    .returning();

  const row = rows[0];
  if (!row) throw new ConflictError("Ordner konnte nicht geändert werden.");
  return rowToFolder(row);
}

/**
 * Delete an empty subfolder. Refuses while anything is inside it (D4): no
 * cascade means no click can destroy a year of protocols, and no storage
 * object is ever orphaned by a folder deletion.
 */
export async function deleteFolder(
  db: Db,
  folderId: string,
  byMember: CurrentMember,
): Promise<void> {
  requireActingMember(byMember);
  const folder = await getFolder(db, folderId);
  if (folder.parentId === null) {
    throw new ForbiddenError("Systemordner können nicht gelöscht werden.");
  }
  if (!canWrite(folder, byMember)) {
    throw new ForbiddenError("Kein Schreibzugriff auf diesen Ordner.");
  }

  const [fileCount] = await db
    .select({ n: count() })
    .from(files)
    .where(eq(files.folderId, folder.id));
  const [childCount] = await db
    .select({ n: count() })
    .from(folders)
    .where(eq(folders.parentId, folder.id));

  if ((fileCount?.n ?? 0) > 0 || (childCount?.n ?? 0) > 0) {
    throw new ConflictError("Ordner ist nicht leer.");
  }

  // The counts above are only for the error message. They cannot be trusted for
  // the delete itself: files.folder_id is ON DELETE CASCADE, so an upload that
  // commits between the count and the DELETE would be destroyed silently and
  // its storage object orphaned. Re-assert emptiness inside the DELETE so the
  // check and the write are one atomic statement.
  const child = alias(folders, "child");
  const deleted = await db
    .delete(folders)
    .where(
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
    )
    .returning({ id: folders.id });

  if (deleted.length === 0) throw new ConflictError("Ordner ist nicht leer.");
}
