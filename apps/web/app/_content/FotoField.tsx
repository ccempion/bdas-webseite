"use client";

import { useContext, useRef, useState } from "react";

import { ContentSlugContext } from "./content-slug-context";

/** Custom Puck field: uploads an image via /api/content/upload-url (signed
 *  Supabase upload, federal- or group-editor gated per slug) and stores the
 *  public URL. */
export function FotoField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slug = useContext(ContentSlugContext);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/content/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          slug,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Upload fehlgeschlagen.");
        return;
      }
      const { uploadUrl, publicUrl } = (await res.json()) as {
        uploadUrl: string;
        publicUrl: string;
      };
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) {
        setError("Upload fehlgeschlagen.");
        return;
      }
      onChange(publicUrl);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? <img src={value} alt="" className="h-24 w-24 rounded-bdas-sm object-cover" /> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover disabled:opacity-50"
      >
        {busy ? "Lädt hoch…" : value ? "Foto ersetzen" : "Foto hochladen"}
      </button>
      {error ? <p className="text-sm text-bdas-ink-body">{error}</p> : null}
    </div>
  );
}
