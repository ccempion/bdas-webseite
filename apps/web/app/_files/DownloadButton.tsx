"use client";

import { useState } from "react";

import { Button } from "@bdas/design-system";

import { getDownloadUrlAction } from "./file-actions";

/**
 * Requests a signed download URL on click, then opens it so the browser fetches
 * the bytes directly from storage. Surfaces the service's German error inline.
 */
export function DownloadButton({ fileId }: { fileId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await getDownloadUrlAction(fileId);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={onClick} disabled={busy}>
        {busy ? "…" : "Herunterladen"}
      </Button>
      {error ? <span className="text-xs text-bdas-red">{error}</span> : null}
    </div>
  );
}
