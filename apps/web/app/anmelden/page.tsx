import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@bdas/design-system";

import { requireAuthFlag } from "../_auth/flag";
import { loadViewer } from "../_dashboard/session";
import { AnmeldenForm } from "./AnmeldenForm";

export const metadata = { title: "Anmelden" };

export default async function AnmeldenPage() {
  requireAuthFlag();
  if (await loadViewer()) redirect("/account");

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
