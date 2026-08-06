"use client";

import { useEffect, useRef, useState } from "react";

import { CropDialog } from "../_profile/CropDialog";
import { PhotoLightbox } from "../_profile/PhotoLightbox";
import { DropZone } from "../_upload/DropZone";
import { IMAGE_ACCEPT, PROFILE_IMAGE } from "../_upload/accept";
import { uploadImage } from "../_upload/upload-image";
import { removePhotoAction, savePhotoAction } from "./photo-actions";

/** Large enough to read as the page's identity anchor, not a form field. */
const SIZE = 112;

/**
 * The profile photo at the top of /account.
 *
 * With a photo the circle opens it enlarged, and the two things you can do to
 * it live in there. With no photo there is nothing to enlarge, so the circle
 * stays the shortcut it always was and goes straight to the file picker.
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
  const [pending, setPending] = useState<File | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // `photoUrl` is a server prop and stays stale until the revalidated route
  // reaches the client, so a removal needs its own flag to take effect now.
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const preview = localPreview ?? (removed ? null : photoUrl);

  async function handle(file: File) {
    setBusy(true);
    setError(null);
    try {
      setRemoved(false);
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

  /** Hand off to the crop step, and get the lightbox out from under it —
   *  two stacked modal dialogs would be one too many. */
  function choose(file: File) {
    setLightboxOpen(false);
    setPending(file);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const out = await removePhotoAction();
      if (out.error) {
        setError(out.error);
        return;
      }
      setLocalPreview(null);
      setRemoved(true);
      setLightboxOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropZone
      accept={PROFILE_IMAGE}
      onFile={choose}
      onReject={(messages) => setError(messages[0] ?? null)}
      label="Bild hier ablegen"
      disabled={busy}
      className="flex flex-col items-center gap-2"
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) choose(file);
          // Or picking the same file twice in a row fires no change event.
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => (preview ? setLightboxOpen(true) : inputRef.current?.click())}
        aria-label={preview ? "Profilbild vergrößern" : "Profilbild hochladen"}
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
      {/* Constrained to the circle's width, or the caption starts at the header
          column's left edge instead of sitting under the circle. */}
      <p style={{ width: SIZE }} className="text-center text-sm text-bdas-ink-muted">
        {busy ? "Einen Moment…" : preview ? "Bild ansehen" : "Bild hochladen"}
      </p>
      {error ? <p className="max-w-xs text-center text-sm text-bdas-red">{error}</p> : null}
      {lightboxOpen && preview ? (
        <PhotoLightbox
          src={preview}
          busy={busy}
          onChange={() => inputRef.current?.click()}
          onRemove={() => void remove()}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
      {pending ? (
        <CropDialog
          file={pending}
          onCancel={() => setPending(null)}
          onDone={(cropped) => {
            setPending(null);
            void handle(cropped);
          }}
        />
      ) : null}
    </DropZone>
  );
}
