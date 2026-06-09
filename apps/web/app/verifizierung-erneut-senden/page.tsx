import { requireAuthFlag } from "../_auth/flag";

import { ResendForm } from "./ResendForm";

export const metadata = { title: "Bestätigungsmail erneut senden" };

export default function ResendVerificationPage() {
  requireAuthFlag();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Bestätigungsmail erneut senden</h1>
      <p className="text-sm text-bdas-ink-body">
        Gib deine E-Mail-Adresse ein. Falls ein unbestätigtes Konto existiert, schicken wir dir
        einen neuen Link.
      </p>
      <ResendForm />
    </main>
  );
}
