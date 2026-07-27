"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { DropZone } from "../_upload/DropZone";
import { confirmUploadAction, requestUploadAction } from "./file-actions";
import { formatFileSize, mimeIcon } from "./folder-meta";
import { runUploads, validateFile, type UploadInput, type UploadItem } from "./upload-manager";

/** PUT bytes straight to the signed URL via XHR so upload progress is reported. */
function putViaXhr(
  url: string,
  body: Blob,
  mimeType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`PUT ${String(xhr.status)}`));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(body);
  });
}

/**
 * Drag-and-drop multi-file uploader for boards. Pre-validates against the
 * module's MIME allowlist + 25 MB cap, then runs the request → PUT → confirm
 * pipeline (bounded concurrency) via the framework-free upload-manager. Refreshes
 * the route when uploads settle so the server-rendered list re-fetches.
 */
export function FileUploader({
  folderId,
  maxBytes,
  acceptMime,
}: {
  folderId: string;
  maxBytes: number;
  acceptMime: readonly string[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<readonly UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  // Files the zone turned away before an upload was ever attempted. Without
  // this they would vanish silently — `runUploads` only reports on files it is
  // actually given.
  const [rejected, setRejected] = useState<readonly string[]>([]);
  const allowedMime = useMemo(() => new Set(acceptMime), [acceptMime]);
  const accept = acceptMime.join(",");
  // This surface takes documents, not images, so it supplies its own spec.
  // `runUploads` still re-checks every file through `validateFile` and reports
  // per-file failures in the list below.
  const spec = useMemo(
    () => ({ mime: acceptMime, maxBytes, maxLabel: formatFileSize(maxBytes) }),
    [acceptMime, maxBytes],
  );

  async function upload(dropped: readonly File[]): Promise<void> {
    if (dropped.length === 0 || busy) return;
    setRejected([]);
    const files: UploadInput[] = dropped.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      mimeType: f.type,
      sizeBytes: f.size,
      body: f,
    }));

    setBusy(true);
    await runUploads({
      files,
      deps: {
        requestUpload: (input) => requestUploadAction(folderId, input),
        putBytes: putViaXhr,
        confirmUpload: (fileId) => confirmUploadAction(fileId),
      },
      onChange: setItems,
      validate: (f) => validateFile(f, { allowedMime, maxBytes }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <DropZone
        accept={spec}
        onFiles={(files) => void upload(files)}
        onReject={setRejected}
        label="Dateien hier ablegen"
        disabled={busy}
      >
        <div
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-bdas border border-dashed border-bdas-soft bg-bdas-surface p-8 text-center transition-colors duration-bdas-quick hover:bg-bdas-overlay-hover"
        >
          <p className="font-medium text-bdas-ink">Dateien hierher ziehen oder klicken</p>
          <p className="text-sm text-bdas-ink-muted">Bis zu {formatFileSize(maxBytes)} pro Datei</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={accept}
            className="hidden"
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      </DropZone>

      {rejected.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {rejected.map((message) => (
            <li key={message} className="text-sm text-bdas-red">
              {message}
            </li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-bdas border border-bdas-soft bg-bdas-surface p-3 text-sm shadow-bdas-card"
            >
              <span aria-hidden className="text-lg">
                {mimeIcon(it.mimeType)}
              </span>
              <div className="flex-1">
                <p className="font-medium text-bdas-ink">{it.name}</p>
                <p className="mt-0.5 text-bdas-ink-muted">
                  {it.status.kind === "uploading"
                    ? `Wird hochgeladen… ${String(it.status.progress)}%`
                    : it.status.kind === "done"
                      ? "Fertig"
                      : it.status.kind === "failed"
                        ? it.status.message
                        : "In Warteschlange"}
                </p>
              </div>
              <span
                className={
                  it.status.kind === "failed"
                    ? "text-bdas-red"
                    : it.status.kind === "done"
                      ? "text-bdas-ink-muted"
                      : "text-bdas-ink-muted"
                }
                aria-hidden
              >
                {it.status.kind === "done"
                  ? "✓"
                  : it.status.kind === "failed"
                    ? "✕"
                    : it.status.kind === "uploading"
                      ? `${String(it.status.progress)}%`
                      : "…"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
