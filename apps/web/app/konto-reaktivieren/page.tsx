import Link from "next/link";

import { Alert } from "@bdas/design-system";

import { requireAccountDeletionFlag } from "../_account-deletion/flag";

export const metadata = { title: "Löschung abbrechen" };

export default function KontoReaktivierenPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  requireAccountDeletionFlag();
  const status = searchParams?.["status"];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Löschung abbrechen</h1>

      {status === "aktiv" ? (
        <Alert variant="success" title="Löschung abgebrochen">
          Dein Konto ist wieder aktiv. Melde dich an, um fortzufahren.
        </Alert>
      ) : (
        <Alert variant="error" title="Link ungültig">
          Dieser Reaktivierungslink ist ungültig oder abgelaufen.
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
