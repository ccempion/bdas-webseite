"use client";

import { useEffect, useRef, useState } from "react";

/** Uploads a profile photo via /api/profile/upload-url (private bucket, signed
 *  PUT) and stores the returned storage key.
 *
 *  Private objects have no public URL, so the preview comes from two sources:
 *  `photoUrl` — a short-lived signed URL the server resolved for the *stored*
 *  photo — and, once the member picks a new file, a local object URL so the
 *  replacement is visible immediately instead of after a round trip. */
export function PhotoField({
  storageKey,
  onChange,
  photoUrl,
}: {
  storageKey: string | null;
  onChange: (key: string) => void;
  photoUrl?: string | null | undefined;
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

  const preview = localPreview ?? photoUrl ?? null;

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
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (!file) return;
          setLocalPreview(URL.createObjectURL(file));
          void upload(file);
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
    </div>
  );
}
