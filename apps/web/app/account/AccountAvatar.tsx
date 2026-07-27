"use client";

import { useEffect, useRef, useState } from "react";

import { DropZone } from "../_upload/DropZone";
import { IMAGE_ACCEPT, PROFILE_IMAGE } from "../_upload/accept";
import { uploadImage } from "../_upload/upload-image";
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
      setLocalPreview(URL.createObjectURL(file));
      const out = await uploadImage<{ uploadUrl: string; storageKey: string }>(
        "/api/profile/upload-url",
        file,
      );
      if ("error" in out) {
        setError(out.error);
        return;
      }
      const saved = await savePhotoAction(out.ok.storageKey);
      if (saved.error) setError(saved.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropZone
      accept={PROFILE_IMAGE}
      onFile={(file) => void handle(file)}
      onReject={(messages) => setError(messages[0] ?? null)}
      label="Bild hier ablegen"
      disabled={busy}
      className="flex flex-col gap-2"
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void handle(file);
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
    </DropZone>
  );
}
