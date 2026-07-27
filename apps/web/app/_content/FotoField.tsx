"use client";

import { useContext, useRef, useState } from "react";

import { DropZone } from "../_upload/DropZone";
import { CONTENT_IMAGE, IMAGE_ACCEPT } from "../_upload/accept";
import { uploadImage } from "../_upload/upload-image";
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
      const out = await uploadImage<{ uploadUrl: string; publicUrl: string }>(
        "/api/content/upload-url",
        file,
        { slug },
      );
      if ("error" in out) {
        setError(out.error);
        return;
      }
      onChange(out.ok.publicUrl);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropZone
      accept={CONTENT_IMAGE}
      onFile={(file) => void upload(file)}
      onReject={(messages) => setError(messages[0] ?? null)}
      label="Foto hier ablegen"
      disabled={busy}
      className="flex flex-col gap-2"
    >
      {value ? <img src={value} alt="" className="h-24 w-24 rounded-bdas-sm object-cover" /> : null}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
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
    </DropZone>
  );
}
