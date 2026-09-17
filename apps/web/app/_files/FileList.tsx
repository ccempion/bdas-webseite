import { ALLOWED_MIME, MAX_FILE_BYTES, type FileMeta } from "@bdas/files";

import { FileRow } from "./FileRow";
import { FileUploader } from "./FileUploader";

/**
 * File list shared by member and board surfaces. Read/download is always
 * available (filename and button both download); when `canWrite` is true
 * (boards on folders they may write) the whole card — upload bar and every
 * file row — sits inside one drop zone (spec #229), plus a per-row delete.
 * Member pages pass `canWrite={false}`.
 */
export function FileList({
  files,
  folderId,
  canUpload = false,
  deletableIds = [],
}: {
  files: FileMeta[];
  folderId: string;
  canUpload?: boolean;
  deletableIds?: ReadonlyArray<string>;
}) {
  const list =
    files.length === 0 ? (
      <div className="rounded-bdas border border-bdas-soft bg-bdas-surface p-6 text-center text-bdas-ink-muted shadow-bdas-card">
        Dieser Ordner ist leer.
      </div>
    ) : (
      <ul className="flex flex-col gap-2">
        {files.map((f) => (
          <FileRow key={f.id} file={f} canWrite={canWrite} />
        ))}
      </ul>
    );

  if (!canWrite) {
    return <div className="flex flex-col gap-4">{list}</div>;
  }

  return (
    <FileUploader
      folderId={folderId}
      maxBytes={MAX_FILE_BYTES}
      acceptMime={Array.from(ALLOWED_MIME)}
    >
      {list}
    </FileUploader>
  );
}
