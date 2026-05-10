import Link from "next/link";

import { Card } from "@bdas/design-system";

import { requireAuthFlag } from "../_auth/flag.js";
import { AnmeldenForm } from "./AnmeldenForm.js";

export const metadata = { title: "Anmelden" };

export default function AnmeldenPage() {
  requireAuthFlag();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-bdas-ink">Anmelden</h1>
        <p className="text-bdas-ink-body">Mit deiner E-Mail-Adresse einloggen.</p>
      </header>

      <Card flat className="p-6">
        <AnmeldenForm />
      </Card>

      <p className="text-center text-sm text-bdas-ink-body">
        Noch kein Konto?{" "}
        <Link href="/registrieren" className="text-bdas-red hover:underline">
          Registrieren
        </Link>
      </p>
    </main>
  );
}
