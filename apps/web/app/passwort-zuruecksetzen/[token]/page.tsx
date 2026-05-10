import { Card } from "@bdas/design-system";

import { requireAuthFlag } from "../../_auth/flag";
import { CompleteResetForm } from "./CompleteForm";

export const metadata = { title: "Neues Passwort vergeben" };

export default function PasswortZuruecksetzenTokenPage({ params }: { params: { token: string } }) {
  requireAuthFlag();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-bdas-ink">Neues Passwort vergeben</h1>
        <p className="text-bdas-ink-body">
          Vergib ein neues Passwort. Du wirst danach automatisch abgemeldet und musst dich mit dem
          neuen Passwort erneut anmelden.
        </p>
      </header>

      <Card flat className="p-6">
        <CompleteResetForm token={params.token} />
      </Card>
    </main>
  );
}
