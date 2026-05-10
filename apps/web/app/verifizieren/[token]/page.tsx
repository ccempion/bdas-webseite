import Link from "next/link";

import { verifyEmail } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { Alert } from "@bdas/design-system";
import { isAppError } from "@bdas/errors";

import { requireAuthFlag } from "../../_auth/flag";

export const metadata = { title: "E-Mail bestätigen" };

export default async function VerifizierenTokenPage({ params }: { params: { token: string } }) {
  requireAuthFlag();

  let result: { alreadyVerified: boolean } | null = null;
  let error: string | null = null;
  try {
    result = await verifyEmail(getDb(), params.token);
  } catch (err) {
    error = isAppError(err) ? err.message : "Unbekannter Fehler.";
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">E-Mail bestätigen</h1>

      {error ? (
        <Alert variant="error" title="Verifizierung fehlgeschlagen">
          {error}
        </Alert>
      ) : null}

      {result && !result.alreadyVerified ? (
        <Alert variant="success" title="Konto aktiviert">
          Deine E-Mail-Adresse ist bestätigt. Du kannst dich jetzt anmelden.
        </Alert>
      ) : null}

      {result?.alreadyVerified ? (
        <Alert variant="info" title="Bereits bestätigt">
          Dieses Konto ist bereits aktiviert. Du kannst dich anmelden.
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
