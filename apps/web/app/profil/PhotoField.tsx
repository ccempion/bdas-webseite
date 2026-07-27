"use client";

import { useEffect, useRef, useState } from "react";

import { ACCEPT_ATTR, acceptImageFile } from "../_profile/photo-upload";
import { usePhotoDrop } from "../_profile/use-photo-drop";

/** Uploads a profile photo via /api/profile/upload-url (private bucket, signed
 *  PUT) and stores the returned storage key. The dashed area takes a click or a
 *  dropped file.
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

  // Revoke the object URL on unmount/replacement so the blob is not retained.
  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const preview = localPreview;

  function pick(file: File) {
    const rejected = acceptImageFile(file);
    if (rejected) {
      setError(rejected);
      return;
    }
    setLocalPreview(URL.createObjectURL(file));
    void upload(file);
  }

  const { dragging, dropHandlers } = usePhotoDrop({ onFile: pick, disabled: busy });

  async function upload(file: File) {
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
      const { uploadUrl, storageKey: key } = (await res.json()) as {
        uploadUrl: string;
        storageKey: string;
      };
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) {
        setError("Upload fehlgeschlagen.");
        return;
      }
      onChange(key);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
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
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) pick(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        {...dropHandlers}
        className={`rounded-bdas-sm border border-dashed px-3 py-6 text-sm transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover disabled:opacity-50 ${
          dragging
            ? "border-bdas-red bg-bdas-surface-hover text-bdas-red"
            : "border-bdas-strong text-bdas-ink"
        }`}
      >
        {busy
          ? "Lädt hoch…"
          : dragging
            ? "Loslassen zum Hochladen"
            : storageKey
              ? "Foto ersetzen — klicken oder hierher ziehen"
              : "Foto hochladen (optional) — klicken oder hierher ziehen"}
      </button>
      {error ? <p className="text-sm text-bdas-red">{error}</p> : null}
    </div>
  );
}
