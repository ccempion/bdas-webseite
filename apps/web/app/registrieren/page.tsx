import Link from "next/link";
import { redirect } from "next/navigation";

import { PASSWORD_RULE_HINT } from "@bdas/auth";
import { Card } from "@bdas/design-system";

import { requireAuthFlag } from "../_auth/flag";
import { loadViewer } from "../_dashboard/session";
import { legalUrls } from "../../lib/legal";
import { RegistrierenForm } from "./RegistrierenForm";

export const metadata = { title: "Registrieren" };

export default async function RegistrierenPage() {
  requireAuthFlag();
  if (await loadViewer()) redirect("/");
  const { privacy } = legalUrls();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-bdas-ink">Konto erstellen</h1>
        <p className="text-bdas-ink-body">
          Ein Bestätigungslink wird an deine E-Mail-Adresse geschickt.
        </p>
      </header>

      <Card flat className="p-6">
        <RegistrierenForm privacyUrl={privacy} passwordHint={PASSWORD_RULE_HINT} />
      </Card>

      <p className="text-center text-sm text-bdas-ink-body">
        Schon ein Konto?{" "}
        <Link href="/anmelden" className="text-bdas-red hover:underline">
          Anmelden
        </Link>
      </p>
    </main>
  );
}
