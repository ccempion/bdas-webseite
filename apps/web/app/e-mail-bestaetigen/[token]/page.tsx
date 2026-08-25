import Link from "next/link";

import { confirmEmailChange } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { Alert } from "@bdas/design-system";
import { isAppError } from "@bdas/errors";

import { requireAuthFlag } from "../../_auth/flag";

export const metadata = { title: "E-Mail-Adresse bestätigen" };

export default async function EmailBestaetigenTokenPage({ params }: { params: { token: string } }) {
  requireAuthFlag();

  let result: { newEmail: string; alreadyConfirmed: boolean } | null = null;
  let error: string | null = null;
  try {
    result = await confirmEmailChange(getDb(), params.token);
  } catch (err) {
    error = isAppError(err) ? err.message : "Unbekannter Fehler.";
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">E-Mail-Adresse bestätigen</h1>

      {error ? (
        <Alert variant="error" title="Bestätigung fehlgeschlagen">
          {error}
        </Alert>
      ) : null}

      {result && !result.alreadyConfirmed ? (
        <Alert variant="success" title="E-Mail-Adresse geändert">
          Deine Login-E-Mail-Adresse ist jetzt {result.newEmail}. Du wurdest auf allen Geräten
          abgemeldet — bitte melde dich mit der neuen Adresse erneut an.
        </Alert>
      ) : null}

      {result?.alreadyConfirmed ? (
        <Alert variant="info" title="Bereits bestätigt">
          Diese Änderung wurde bereits bestätigt. Du kannst dich mit der neuen Adresse anmelden.
        </Alert>
      ) : null}

      <p className="text-sm text-bdas-ink-body">
        <Link href="/anmelden" className="text-bdas-red hover:underline">
          Zur Anmeldung
        </Link>
      </p>
    </main>
  );
}
