import Link from "next/link";

import type { Folder } from "@bdas/files";

import { formatFolderCounts, SCOPE_LABEL } from "./folder-meta";
import { FolderGlyph } from "./icons";

/**
 * Folder index shared by the member surface (/dateien) and the board surfaces
 * (/federal/files, /gruppe/[slug]/files). `hrefBase` is the parent path; each
 * row deep-links to `${hrefBase}/${folder.id}`.
 */
export function FolderIndex({
  folders,
  groupNames,
  counts,
  subfolderCounts,
  hrefBase,
  emptyLabel = "Keine Ordner.",
}: {
  folders: Folder[];
  groupNames: Record<string, string>;
  counts: Record<string, number>;
  subfolderCounts: Record<string, number>;
  hrefBase: string;
  emptyLabel?: string;
}) {
  if (folders.length === 0) {
    return (
      <div className="rounded-bdas border border-bdas-soft bg-bdas-surface p-6 text-center text-bdas-ink-muted shadow-bdas-card">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {folders.map((f) => (
        <li key={f.id}>
          <Link
            href={`${hrefBase}/${f.id}`}
            className="group flex items-center gap-4 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card transition-transform duration-bdas-card ease-bdas hover:-translate-y-0.5"
          >
            <span className="text-bdas-ink-muted">
              <FolderGlyph />
            </span>
            <div className="flex-1">
              <p className="font-medium text-bdas-ink">{f.name}</p>
              <p className="mt-0.5 text-sm text-bdas-ink-muted">
                {SCOPE_LABEL[f.scope]}
                {f.groupId ? ` · ${groupNames[f.groupId] ?? "—"}` : ""}
              </p>
            </div>
            <span className="text-sm text-bdas-ink-muted">
              {formatFolderCounts(counts[f.id] ?? 0, subfolderCounts[f.id] ?? 0)}
            </span>
            <span aria-hidden className="text-bdas-ink-muted">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
