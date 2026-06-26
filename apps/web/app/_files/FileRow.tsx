"use client";

import { useState } from "react";

import { Button } from "@bdas/design-system";
import type { FileMeta } from "@bdas/files";

import { formatDate } from "../../lib/format";
import { DeleteFileButton } from "./DeleteFileButton";
import { getDownloadUrlAction } from "./file-actions";
import { formatFileSize, mimeIcon } from "./folder-meta";

/**
 * One file row. Both the filename and the "Herunterladen" button trigger the
 * same download (signed URL → open in a new tab), sharing one busy/error state.
 * Delete is shown only when `canWrite`.
 */
export function FileRow({ file, canWrite }: { file: FileMeta; canWrite: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await getDownloadUrlAction(file.id);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <li className="flex items-center gap-4 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card">
      <span aria-hidden className="text-xl">
        {mimeIcon(file.mimeType)}
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="block max-w-full truncate text-left font-medium text-bdas-ink hover:text-bdas-red hover:underline disabled:opacity-50"
        >
          {file.filename}
        </button>
        <p className="mt-0.5 text-sm text-bdas-ink-muted">
          {formatFileSize(file.sizeBytes)} · {formatDate(file.uploadedAt)}
        </p>
        {error ? <p className="mt-0.5 text-xs text-bdas-red">{error}</p> : null}
      </div>
      <Button variant="secondary" size="sm" onClick={download} disabled={busy}>
        {busy ? "…" : "Herunterladen"}
      </Button>
      {canWrite ? <DeleteFileButton fileId={file.id} filename={file.filename} /> : null}
    </li>
  );
}
