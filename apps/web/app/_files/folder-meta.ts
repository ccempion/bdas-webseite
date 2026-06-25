import type { FolderScope } from "@bdas/files";

/** German labels for each folder visibility scope (was inline in FoldersTable). */
export const SCOPE_LABEL: Record<FolderScope, string> = {
  members_all: "Alle Mitglieder",
  group_members: "Gruppenmitglieder",
  local_board: "Lokaler Vorstand",
  federal_board: "Bundesvorstand",
};

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

const CATEGORY_ICON: Record<FileCategory, string> = {
  pdf: "📕",
  image: "🖼️",
  spreadsheet: "📊",
  document: "📄",
  generic: "📦",
};

/** Emoji icon for a file's MIME type. No in-app previews beyond this (spec §11). */
export function mimeIcon(mimeType: string): string {
  return CATEGORY_ICON[mimeCategory(mimeType)];
}

/** Human-readable file size: bytes / KB / MB (one decimal above 1 KB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
