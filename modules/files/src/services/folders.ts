import { eq } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { NotFoundError } from "@bdas/errors";
import { listGroups } from "@bdas/groups";
import { createId } from "@bdas/id";
import type { CurrentMember } from "@bdas/members";

import { canRead } from "../permissions";
import { folders } from "../schema";
import type { Folder } from "../types";

type FolderRow = typeof folders.$inferSelect;

export function rowToFolder(r: FolderRow): Folder {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    scope: r.scope as Folder["scope"],
    groupId: r.groupId,
    parentId: r.parentId,
    depth: r.depth,
    description: r.description,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
  };
}

const SINGLETONS: ReadonlyArray<{ slug: string; name: string; scope: Folder["scope"] }> = [
  { slug: "members-all", name: "Alle Mitglieder", scope: "members_all" },
  { slug: "federal-board", name: "Bundesvorstand", scope: "federal_board" },
];

/**
 * Idempotently provision every required folder: the two singletons + one
 * group_members and one local_board folder per existing group. Safe to re-run
 * (the (scope, group_id) unique makes each insert a no-op on conflict). Called
 * at boot and self-heals any folder a missed group.created event would leave.
 */
export async function ensureFolders(db: Db): Promise<void> {
  for (const s of SINGLETONS) {
    await db
      .insert(folders)
      .values({
        id: createId("fld"),
        slug: s.slug,
        name: s.name,
        scope: s.scope,
        groupId: null,
        parentId: null,
        depth: 0,
      })
      .onConflictDoNothing();
  }

  const groups = await listGroups(db);
  for (const g of groups) {
    await provisionGroupFolders(db, g.id, g.name);
  }
}

/** Create the two per-group folders for one group. Idempotent. */
export async function provisionGroupFolders(
  db: Db,
  groupId: string,
  groupName: string,
): Promise<void> {
  await db
    .insert(folders)
    .values({
      id: createId("fld"),
      slug: `group-members-${groupId}`,
      name: `${groupName} – Mitglieder`,
      scope: "group_members",
      groupId,
      parentId: null,
      depth: 0,
    })
    .onConflictDoNothing();
  await db
    .insert(folders)
    .values({
      id: createId("fld"),
      slug: `local-board-${groupId}`,
      name: `${groupName} – Vorstand`,
      scope: "local_board",
      groupId,
      parentId: null,
      depth: 0,
    })
    .onConflictDoNothing();
}

/** Internal: load one folder or throw NotFound. Not on the public surface. */
export async function getFolder(db: Db, folderId: string): Promise<Folder> {
  const rows = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new NotFoundError("Ordner nicht gefunden.");
  }
  return rowToFolder(row);
}

/** Folders the member may read (spec §11). */
export async function listFolders(db: Db, forMember: CurrentMember): Promise<Folder[]> {
  const rows = await db.select().from(folders);
  return rows.map(rowToFolder).filter((f) => canRead(f, forMember));
}
