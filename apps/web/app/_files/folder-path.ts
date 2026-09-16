import { MAX_FOLDER_DEPTH } from "@bdas/files";
import type { Folder } from "@bdas/files";

/**
 * Root-first path to `folderId`, target included. Built from the flat readable
 * set listFolders already returned. The path starts at the highest readable
 * ancestor: a personal grant can open a subfolder whose parents stay closed.
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

/**
 * Where a member enters the readable tree: every readable folder whose parent is
 * not readable. That is the roots for scope-based access, plus a subfolder opened
 * by a personal grant — it would otherwise be unreachable (ADR 0047).
 */
export function entryFolders(folders: readonly Folder[]): Folder[] {
  const ids = new Set(folders.map((f) => f.id));
  return folders.filter((f) => f.parentId === null || !ids.has(f.parentId));
}

/**
 * Every folder with its full path ("BDAS Köln – Mitglieder / Protokolle"),
 * sorted by that path — the folder picker of the grant page.
 */
export function folderPathOptions(folders: readonly Folder[]): Array<{ id: string; path: string }> {
  return folders
    .map((f) => ({
      id: f.id,
      path: buildBreadcrumbs(folders, f.id)
        .map((p) => p.name)
        .join(" / "),
    }))
    .sort((a, b) => a.path.localeCompare(b.path, "de"));
}
