"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@bdas/design-system";

import { deleteFolderAction, renameFolderAction } from "./folder-actions";
import type { FolderActionResult } from "./folder-actions";

/**
 * Rename + delete for one subfolder. Delete is a two-step inline confirm and
 * the service refuses a non-empty folder, so the confirm is about intent, not
 * about data loss.
 */
export function FolderAdminControls({
  folderId,
  name,
  description,
}: {
  folderId: string;
  name: string;
  description: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "rename" | "confirmDelete">("idle");
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: () => Promise<FolderActionResult>) {
    setError(null);
    start(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("idle");
      router.refresh();
    });
  }

  if (mode === "rename") {
    return (
      <div className="flex flex-col gap-2">
        <input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          maxLength={80}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
        <input
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          placeholder="Beschreibung (optional)"
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
        {error ? <span className="text-sm text-bdas-red">{error}</span> : null}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => renameFolderAction(folderId, draftName, draftDescription))}
          >
            {pending ? "Wird gespeichert…" : "Speichern"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("idle")} disabled={pending}>
            Abbrechen
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "confirmDelete") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => deleteFolderAction(folderId))}
          >
            {pending ? "Wird gelöscht…" : "Wirklich löschen"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("idle")} disabled={pending}>
            Abbrechen
          </Button>
        </div>
        {error ? <span className="text-xs text-bdas-red">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => setMode("rename")}>
          Umbenennen
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setMode("confirmDelete")}>
          Löschen
        </Button>
      </div>
      {error ? <span className="text-xs text-bdas-red">{error}</span> : null}
    </div>
  );
}
