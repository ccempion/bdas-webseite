"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, Button, Card, Dialog } from "@bdas/design-system";

import { requestAccountDeletionAction } from "./delete-account-actions";

export function DeleteAccountCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card flat className="p-6">
      <h2 className="mb-2 text-lg font-semibold text-bdas-ink">Konto löschen</h2>
      <p className="mb-4 text-sm text-bdas-ink-body">
        Dein Konto wird gesperrt und nach 30 Tagen unwiderruflich gelöscht, einschließlich deiner
        Blogbeiträge und Kommentare. Innerhalb dieser Frist kannst du die Löschung über einen Link
        in der Bestätigungs-E-Mail abbrechen.
      </p>
      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Konto löschen
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Konto wirklich löschen?">
        <p className="mb-4 text-sm text-bdas-ink-body">
          Dein Konto wird sofort gesperrt und in 30 Tagen unwiderruflich gelöscht — einschließlich
          deiner Blogbeiträge und Kommentare. Du bekommst eine E-Mail mit einem Link, über den du
          die Löschung innerhalb dieser Frist noch abbrechen kannst.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await requestAccountDeletionAction();
                if (!res.ok) {
                  setError(res.error ?? "Fehler");
                  setOpen(false);
                  return;
                }
                router.push("/konto-loeschung-angefragt");
              })
            }
          >
            {pending ? "Wird gelöscht…" : "Ja, endgültig löschen"}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
