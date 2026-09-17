import { ALLOWED_MIME, MAX_FILE_BYTES, type FileMeta } from "@bdas/files";

import { FileRow } from "./FileRow";
import { FileUploader } from "./FileUploader";

/**
 * File list shared by member and board surfaces. Read/download is always
 * available (filename and button both download). With `canUpload` the whole
 * card — upload bar and every file row — sits inside one drop zone (spec #229).
 * Each file in `deletableIds` gets a delete button — all files for a folder
 * manager, only their own for someone with a personal grant.
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
          <FileRow key={f.id} file={f} canDelete={deletableIds.includes(f.id)} />
        ))}
      </ul>
    );

  if (!canUpload) {
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
