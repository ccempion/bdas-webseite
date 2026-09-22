import Link from "next/link";

import { Alert } from "@bdas/design-system";

import { requireAuthFlag } from "../_auth/flag";

export const metadata = { title: "E-Mail bestätigen" };

/**
 * Was der Bestätigungslink übrig lässt: der zweite Klick, der abgelaufene Link
 * und die Bestätigung in einem anderen Browser. Die Einlösung im Browser der
 * Registrierung kommt hier nie an, sie meldet an und leitet weiter (ADR 0051,
 * `[token]/route.ts`).
 */
export default function VerifizierenPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  requireAuthFlag();
  const status = searchParams?.["status"];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">E-Mail bestätigen</h1>

      {status === "aktiv" ? (
        <Alert variant="success" title="Konto aktiviert">
          Deine E-Mail-Adresse ist bestätigt. Melde dich an, dann geht es weiter.
        </Alert>
      ) : status === "bereits" ? (
        <Alert variant="info" title="Bereits bestätigt">
          Dieses Konto ist bereits aktiviert. Du kannst dich anmelden.
        </Alert>
      ) : (
        <Alert variant="error" title="Verifizierung fehlgeschlagen">
          Verifizierungslink ungültig oder abgelaufen.
        </Alert>
      )}

      <p className="text-sm text-bdas-ink-body">
        <Link href="/anmelden" className="text-bdas-red hover:underline">
          Zur Anmeldung
        </Link>
      </p>
    </main>
  );
}
