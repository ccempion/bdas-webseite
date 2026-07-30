import Link from "next/link";

import type { Folder } from "@bdas/files";

/**
 * Root-first breadcrumb trail. The last entry is the current folder and is not
 * a link. `hrefBase` is the surface's folder path prefix, e.g. "/dateien".
 */
export function Breadcrumbs({ trail, hrefBase }: { trail: Folder[]; hrefBase: string }) {
  return (
    <nav aria-label="Pfad" className="flex flex-wrap items-center gap-1 text-sm">
      <Link href={hrefBase} className="text-bdas-ink-muted hover:underline">
        Alle Ordner
      </Link>
      {trail.map((folder, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={folder.id} className="flex items-center gap-1">
            <span aria-hidden className="text-bdas-ink-muted">
              ›
            </span>
            {isLast ? (
              <span className="text-bdas-ink-body">{folder.name}</span>
            ) : (
              <Link
                href={`${hrefBase}/${folder.id}`}
                className="text-bdas-ink-muted hover:underline"
              >
                {folder.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
