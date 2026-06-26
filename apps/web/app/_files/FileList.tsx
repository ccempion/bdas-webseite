import { ALLOWED_MIME, MAX_FILE_BYTES, type FileMeta } from "@bdas/files";

import { formatDate } from "../../lib/format";
import { DeleteFileButton } from "./DeleteFileButton";
import { DownloadButton } from "./DownloadButton";
import { FileUploader } from "./FileUploader";
import { formatFileSize, mimeIcon } from "./folder-meta";

/**
 * File list shared by member and board surfaces. Read/download is always
 * available; when `canWrite` is true (boards on folders they may write) it adds
 * the upload dropzone and a per-row delete. Member pages pass `canWrite={false}`.
 */
export function FileList({
  files,
  folderId,
  canWrite = false,
}: {
  files: FileMeta[];
  folderId: string;
  canWrite?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <FileUploader
          folderId={folderId}
          maxBytes={MAX_FILE_BYTES}
          acceptMime={Array.from(ALLOWED_MIME)}
        />
      ) : null}

      {files.length === 0 ? (
        <div className="rounded-bdas border border-bdas-soft bg-bdas-surface p-6 text-center text-bdas-ink-muted shadow-bdas-card">
          Dieser Ordner ist leer.
        </div>
      ) : (
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
              {canWrite ? <DeleteFileButton fileId={f.id} filename={f.filename} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
