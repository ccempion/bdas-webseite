"use client";

import React, { useState, useTransition } from "react";

import { Alert, Button } from "@bdas/design-system";

import { sendDataExportAction } from "./data-export-actions";

export function SendDataExportButton() {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await sendDataExportAction();
            if (!res.ok) {
              setSent(false);
              setError(res.error ?? "Fehler");
              return;
            }
            setError(null);
            setSent(true);
          })
        }
      >
        {pending ? "Wird gesendet…" : "Per E-Mail zusenden"}
      </Button>
      {error ? (
        <div className="mt-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}
      {sent ? (
        <p className="mt-4 text-sm text-bdas-ink-body">
          Die Auskunft ist unterwegs — schau in dein Postfach.
        </p>
      ) : null}
    </>
  );
}
