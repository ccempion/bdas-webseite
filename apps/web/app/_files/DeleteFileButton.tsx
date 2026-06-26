"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@bdas/design-system";

import { deleteFileAction } from "./file-actions";

/**
 * Per-row delete with an inline two-step confirm (mirrors the GrantRoleModal
 * idiom — no overlay primitive). On success refreshes the route
 * so the server-rendered list re-fetches; surfaces the service's German error.
 */
export function DeleteFileButton({ fileId, filename }: { fileId: string; filename: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          Löschen
        </Button>
        {error ? <span className="text-xs text-bdas-red">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-bdas-ink-muted">Wirklich löschen?</span>
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await deleteFileAction(fileId);
              if ("error" in res) {
                setError(res.error);
                setConfirming(false);
                return;
              }
              router.refresh();
            })
          }
        >
          {pending ? "…" : "Löschen"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Abbrechen
        </Button>
      </div>
      <span className="sr-only">{filename}</span>
    </div>
  );
}
