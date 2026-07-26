"use client";

import { useEffect, useRef, useState } from "react";

import { savePhotoAction } from "./photo-actions";

/** Large enough to read as the page's identity anchor, not a form field. */
const SIZE = 112;

/**
 * The profile photo at the top of /account. The circle *is* the control: click
 * it to pick a file, which uploads to the private bucket and saves straight
 * away — no separate submit.
 *
 * Private objects have no public URL, so the rendered image is either the
 * server-signed `photoUrl` or, right after picking a file, a local object URL
 * so the new photo appears without waiting on the round trip.
 */
export function AccountAvatar({
  photoUrl,
  initials,
}: {
  photoUrl: string | null;
  initials: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const preview = localPreview ?? photoUrl ?? null;

  async function handle(file: File) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Upload fehlgeschlagen.");
        return;
      }
      const { uploadUrl, storageKey } = (await res.json()) as {
        uploadUrl: string;
        storageKey: string;
      };
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) {
        setError("Upload fehlgeschlagen.");
        return;
      }
      const saved = await savePhotoAction(storageKey);
      if (saved.error) setError(saved.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (!file) return;
          setLocalPreview(URL.createObjectURL(file));
          void handle(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        aria-label={preview ? "Profilbild ändern" : "Profilbild hochladen"}
        style={{ width: SIZE, height: SIZE }}
        className="shrink-0 overflow-hidden rounded-bdas-full border border-bdas-soft bg-bdas-overlay-soft transition-shadow duration-bdas-quick ease-bdas hover:shadow-bdas-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bdas-red disabled:opacity-60"
      >
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex h-full w-full items-center justify-center font-semibold text-bdas-ink-body"
            style={{ fontSize: Math.round(SIZE * 0.32) }}
          >
            {initials}
          </span>
        )}
      </button>
      <p className="text-sm text-bdas-ink-muted">
        {busy ? "Lädt hoch…" : preview ? "Bild ändern" : "Bild hochladen"}
      </p>
      {error ? <p className="max-w-xs text-sm text-bdas-red">{error}</p> : null}
    </div>
  );
}
