"use client";

import { useEffect, useRef, useState } from "react";

import { DropZone } from "../../_upload/DropZone";
import { CONTENT_IMAGE, IMAGE_ACCEPT } from "../../_upload/accept";
import { uploadImage } from "../../_upload/upload-image";

/**
 * 16:9 title image for a group's public page (#62).
 *
 * Uploads through `/api/content/upload-url` with the group's content slug, so
 * the existing per-group authorization (ADR 0026) and the existing
 * `content-media` bucket are reused — no new route, bucket, or env var. The
 * form stores the returned storage key; the public page turns it into a URL.
 *
 * The whole preview area is the drop target, not a strip beneath it: a banner
 * is dragged onto the picture it will become.
 */
export function BannerField({
  slug,
  imageUrl,
  onChange,
}: {
  slug: string;
  /** Server-resolved URL of the stored banner, or null. */
  imageUrl: string | null;
  onChange: (imageKey: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(imageUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the preview in step when the server sends a different stored banner
  // (e.g. after a save revalidates the page).
  useEffect(() => setPreview(imageUrl), [imageUrl]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const out = await uploadImage<{ uploadUrl: string; storageKey: string; publicUrl: string }>(
        "/api/content/upload-url",
        file,
        { slug: `gruppen/${slug}` },
      );
      if ("error" in out) {
        setError(out.error);
        return;
      }
      setPreview(out.ok.publicUrl);
      onChange(out.ok.storageKey);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-bdas-ink-muted">Titelbild</span>
      <DropZone
        accept={CONTENT_IMAGE}
        onFile={(file) => void upload(file)}
        onReject={(messages) => setError(messages[0] ?? null)}
        label="Bild hier ablegen"
        disabled={busy}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-bdas border border-dashed border-bdas-strong bg-bdas-surface-hover transition-colors duration-bdas-quick ease-bdas hover:border-bdas-red disabled:opacity-50"
        >
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="px-4 text-center text-sm text-bdas-ink-muted">
              {busy ? "Lädt hoch…" : "Bild hierher ziehen oder klicken zum Auswählen"}
              <br />
              <span className="text-xs">Querformat 16:9, bis {CONTENT_IMAGE.maxLabel}</span>
            </span>
          )}
        </button>
      </DropZone>

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        aria-label="Titelbild auswählen"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void upload(file);
        }}
      />

      {preview ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setPreview(null);
            onChange(null);
          }}
          className="self-start text-sm text-bdas-ink-muted underline hover:text-bdas-red"
        >
          Bild entfernen
        </button>
      ) : null}

      {error ? <p className="text-sm text-bdas-red">{error}</p> : null}
    </div>
  );
}
