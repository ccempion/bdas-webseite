import Link from "next/link";

import { Alert } from "@bdas/design-system";

import { requireAccountDeletionFlag } from "../_account-deletion/flag";

export const metadata = { title: "Löschung angefragt" };

export default function KontoLoeschungAngefragtPage() {
  requireAccountDeletionFlag();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Löschung angefragt</h1>
      <Alert variant="info" title="Konto gesperrt">
        Deine Löschung wurde angefragt, du wurdest abgemeldet. Eine Bestätigung mit einem Link zum
        Abbrechen haben wir dir per E-Mail geschickt.
      </Alert>
      <p className="text-sm text-bdas-ink-body">
        <Link href="/anmelden" className="text-bdas-red hover:underline">
          Zur Anmeldung
        </Link>
      </p>
    </main>
  );
}
