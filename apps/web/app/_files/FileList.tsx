import { ALLOWED_MIME, MAX_FILE_BYTES, type FileMeta } from "@bdas/files";

import { FileRow } from "./FileRow";
import { FileUploader } from "./FileUploader";

/**
 * File list shared by member and board surfaces. Read/download is always
 * available (filename and button both download); when `canWrite` is true (boards
 * on folders they may write) it adds the upload dropzone and a per-row delete.
 * Member pages pass `canWrite={false}`.
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
            <FileRow key={f.id} file={f} canWrite={canWrite} />
          ))}
        </ul>
      )}
    </div>
  );
}
