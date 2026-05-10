import Link from "next/link";

import { Alert } from "@bdas/design-system";

import { requireAuthFlag } from "../../_auth/flag.js";

export const metadata = { title: "Bitte E-Mail bestätigen" };

export default function RegistrierenErfolgPage() {
  requireAuthFlag();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Fast geschafft</h1>
      <Alert variant="success" title="Bestätigungslink versendet">
        Wir haben dir einen Link an deine E-Mail-Adresse geschickt. Bitte klicke darauf, um dein
        Konto zu aktivieren. Der Link ist 24 Stunden gültig.
      </Alert>
      <p className="text-sm text-bdas-ink-body">
        Keine E-Mail erhalten? Prüfe deinen Spam-Ordner oder{" "}
        <Link href="/registrieren" className="text-bdas-red hover:underline">
          versuche es erneut
        </Link>
        .
      </p>
    </main>
  );
}
