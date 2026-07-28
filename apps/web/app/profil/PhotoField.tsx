"use client";

import { useEffect, useRef, useState } from "react";

import { CropDialog } from "../_profile/CropDialog";
import { DropZone } from "../_upload/DropZone";
import { IMAGE_ACCEPT, PROFILE_IMAGE } from "../_upload/accept";
import { uploadImage } from "../_upload/upload-image";

/** Uploads a profile photo via /api/profile/upload-url (private bucket, signed
 *  PUT) and stores the returned storage key.
 *
 *  Private objects have no public URL, so the preview is a local object URL of
 *  the file just picked — enough to confirm the upload during the signup
 *  wizard, where nothing is persisted yet. Stored photos are shown on /account
 *  by AccountAvatar, which gets a server-signed URL. */
export function PhotoField({
  storageKey,
  onChange,
}: {
  storageKey: string | null;
  onChange: (key: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);

  // Revoke the object URL on unmount/replacement so the blob is not retained.
  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const preview = localPreview;

  async function upload(file: File) {
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
      onChange(out.ok.storageKey);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropZone
      accept={PROFILE_IMAGE}
      onFile={(file) => setPending(file)}
      onReject={(messages) => setError(messages[0] ?? null)}
      label="Foto hier ablegen"
      disabled={busy}
      className="flex flex-col gap-2"
    >
      {preview ? (
        <img
          src={preview}
          alt="Aktuelles Profilbild"
          width={96}
          height={96}
          className="h-24 w-24 shrink-0 rounded-full object-cover"
        />
      ) : storageKey ? (
        <p className="text-sm text-bdas-ink-body">Profilbild hochgeladen ✓</p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) setPending(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover disabled:opacity-50"
      >
        {busy ? "Lädt hoch…" : storageKey ? "Foto ersetzen" : "Foto hochladen (optional)"}
      </button>
      {error ? <p className="text-sm text-bdas-red">{error}</p> : null}
      {pending ? (
        <CropDialog
          file={pending}
          onCancel={() => setPending(null)}
          onDone={(cropped) => {
            setPending(null);
            void upload(cropped);
          }}
        />
      ) : null}
    </DropZone>
  );
}
