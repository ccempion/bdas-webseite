import type { Folder, FolderScope } from "@bdas/files";

/** German labels for each folder visibility scope (was inline in FoldersTable). */
export const SCOPE_LABEL: Record<FolderScope, string> = {
  members_all: "Alle Mitglieder",
  group_members: "Gruppenmitglieder",
  local_board: "Lokaler Vorstand",
  federal_board: "Bundesvorstand",
  board_broadcast: "Bundesvorstand-Verteiler",
};

/**
 * Federation-wide singleton scopes (groupId null) that surface on every
 * group's own page, alongside its group-scoped roots — ADR 0042.
 * `federal_board` is deliberately not here: that folder is federal-only
 * working storage, never shown on a group page.
 */
export const GROUP_PAGE_FEDERATION_SCOPES: ReadonlySet<FolderScope> = new Set([
  "members_all",
  "board_broadcast",
]);

/**
 * Root folders shown on the federal board's own files overview
 * (`/federal/files`). Deliberately excludes every group's `local_board` /
 * `group_members` root, even though the federal board can read all of them
 * (`canManageGroup` is federal-inclusive) — those are reached per group via
 * `/gruppen/<slug>`, not listed here.
 */
export const FEDERAL_FILES_ROOT_SCOPES: ReadonlySet<FolderScope> = new Set([
  "members_all",
  "federal_board",
  "board_broadcast",
]);

export type FileCategory = "pdf" | "image" | "spreadsheet" | "document" | "generic";

/** Map a MIME type to a coarse category for the file-list icon (spec §11). */
export function mimeCategory(mimeType: string): FileCategory {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "text/csv"
  ) {
    return "spreadsheet";
  }
  if (
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mimeType === "text/plain"
  ) {
    return "document";
  }
  return "generic";
}

/** Human-readable file size: bytes / KB / MB (one decimal above 1 KB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Direct-child folder count per parent id (not recursive). Folders with no
 * children are simply absent from the result — callers default with `?? 0`.
 */
export function subfolderCounts(allFolders: Folder[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of allFolders) {
    if (f.parentId === null) continue;
    out[f.parentId] = (out[f.parentId] ?? 0) + 1;
  }
  return out;
}

/**
 * Folder-index count label: files and subfolders shown separately, a zero
 * segment dropped rather than printed as "0 Ordner", "Leer" when both are
 * zero (spec: issue #228).
 */
export function formatFolderCounts(fileCount: number, folderCount: number): string {
  const filesPart = fileCount > 0 ? `${fileCount} ${fileCount === 1 ? "Datei" : "Dateien"}` : null;
  const foldersPart = folderCount > 0 ? `${folderCount} Ordner` : null;
  if (filesPart && foldersPart) return `${filesPart} · ${foldersPart}`;
  if (filesPart) return filesPart;
  if (foldersPart) return foldersPart;
  return "Leer";
}
