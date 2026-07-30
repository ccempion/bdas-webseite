"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@bdas/design-system";

import { createFolderAction } from "./folder-actions";

/**
 * Inline create form for a subfolder. Rendered only where the server already
 * determined the viewer may write to the parent — this component performs no
 * permission check of its own; the service is the authority.
 */
export function NewFolderButton({ parentId }: { parentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const result = await createFolderAction(parentId, name, description);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setName("");
      setDescription("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Neuer Ordner
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card">
      <label className="flex flex-col gap-1 text-sm text-bdas-ink-body">
        Name
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-bdas-ink-body">
        Beschreibung (optional)
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
      </label>
      {error ? <span className="text-sm text-bdas-red">{error}</span> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Wird angelegt…" : "Anlegen"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
