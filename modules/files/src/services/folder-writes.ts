import { and, eq } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { ConflictError, ForbiddenError, ValidationError } from "@bdas/errors";
import { createId } from "@bdas/id";
import type { CurrentMember } from "@bdas/members";

import { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from "../constants";
import { canWrite } from "../permissions";
import { folders } from "../schema";
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
