import { MAX_FOLDER_DEPTH } from "@bdas/files";
import type { Folder } from "@bdas/files";

/**
 * Root-first path to `folderId`, target included. Built from the flat readable
 * set listFolders already returned — a member who may read a child may always
 * read its ancestors, because a subfolder inherits its parent's scope exactly.
 */
export function buildBreadcrumbs(folders: readonly Folder[], folderId: string): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];

  let current = byId.get(folderId);
  // Bounded by the depth cap + 1 so a dangling or cyclic parent link cannot spin.
  for (let i = 0; current && i <= MAX_FOLDER_DEPTH + 1; i++) {
    path.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return path;
}
