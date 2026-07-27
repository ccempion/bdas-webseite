"use client";

import { useState, useTransition } from "react";

import { Button, Card } from "@bdas/design-system";
import type { RejectionCategory } from "@bdas/members";

import { rejectApplicationAction } from "./application-actions";

export function RejectDialog({
  requestId,
  slug,
  name,
  categories,
  onClose,
}: {
  requestId: string;
  slug: string;
  name: string;
  categories: ReadonlyArray<{ key: RejectionCategory; label: string }>;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<RejectionCategory>("no_contact");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const messageRequired = category === "other";
  const canSubmit = !messageRequired || message.trim().length > 0;

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await rejectApplicationAction(requestId, slug, {
        category,
        message: message.trim() || null,
      });
      if (res.ok) onClose();
      else setError(res.error ?? "Fehler");
    });
  };

  return (
    <Card flat className="mt-4 p-4">
      <h3 className="mb-3 text-lg font-semibold text-bdas-ink">Bewerbung von {name} ablehnen</h3>

      <label
        className="mb-1 block text-sm font-medium text-bdas-ink-body"
        htmlFor={`reject-category-${requestId}`}
      >
        Grund
      </label>
      <select
        id={`reject-category-${requestId}`}
        className="mb-4 w-full rounded-bdas-sm border border-bdas-soft p-2"
        value={category}
        onChange={(e) => setCategory(e.target.value as RejectionCategory)}
      >
        {categories.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>

      <label
        className="mb-1 block text-sm font-medium text-bdas-ink-body"
        htmlFor={`reject-message-${requestId}`}
      >
        Nachricht an die Bewerberin / den Bewerber{messageRequired ? "" : " (optional)"}
      </label>
      <textarea
        id={`reject-message-${requestId}`}
        className="mb-2 w-full rounded-bdas-sm border border-bdas-soft p-2"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <p className="mb-4 text-sm text-bdas-ink-muted">
        Grund und Nachricht sind für die Bewerberin sichtbar.
      </p>

      {error ? <p className="mb-3 text-sm text-bdas-red">{error}</p> : null}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || !canSubmit}>
          {pending ? "Wird gesendet …" : "Ablehnen"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Abbrechen
        </Button>
      </div>
    </Card>
  );
}
