import Link from "next/link";

import { Card } from "@bdas/design-system";

import { requireAuthFlag } from "../_auth/flag";
import { RequestResetForm } from "./RequestForm";

export const metadata = { title: "Passwort zurücksetzen" };

export default function PasswortZuruecksetzenPage() {
  requireAuthFlag();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-bdas-ink">Passwort zurücksetzen</h1>
        <p className="text-bdas-ink-body">
          Wir senden dir einen Link zum Zurücksetzen an deine E-Mail-Adresse.
        </p>
      </header>

      <Card flat className="p-6">
        <RequestResetForm />
      </Card>

      <p className="text-center text-sm text-bdas-ink-body">
        <Link href="/anmelden" className="text-bdas-red hover:underline">
          Zurück zur Anmeldung
        </Link>
      </p>
    </main>
  );
}
