import type { FileMeta } from "@bdas/files";

import { formatDate } from "../../lib/format";
import { DownloadButton } from "./DownloadButton";
import { formatFileSize, mimeIcon } from "./folder-meta";

/**
 * Read-only file list shared by member and board surfaces. PR 3 adds write
 * affordances (upload dropzone, per-row delete) gated on a future `canWrite`
 * prop; PR 2 is download-only.
 */
export function FileList({ files }: { files: FileMeta[] }) {
  if (files.length === 0) {
    return (
      <div className="rounded-bdas border border-bdas-soft bg-bdas-surface p-6 text-center text-bdas-ink-muted shadow-bdas-card">
        Dieser Ordner ist leer.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {files.map((f) => (
        <li
          key={f.id}
          className="flex items-center gap-4 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card"
        >
          <span aria-hidden className="text-xl">
            {mimeIcon(f.mimeType)}
          </span>
          <div className="flex-1">
            <p className="font-medium text-bdas-ink">{f.filename}</p>
            <p className="mt-0.5 text-sm text-bdas-ink-muted">
              {formatFileSize(f.sizeBytes)} · {formatDate(f.uploadedAt)}
            </p>
          </div>
          <DownloadButton fileId={f.id} />
        </li>
      ))}
    </ul>
  );
}
