import Link from "next/link";

import { getDb } from "@bdas/db";
import { Alert } from "@bdas/design-system";
import { confirmSubscription } from "@bdas/newsletter";

import { bootNewsletter } from "../../../lib/newsletter-bootstrap";
import { requireNewsletterFlag } from "../../_newsletter/flag";

export const metadata = { title: "Newsletter bestätigen" };

// The page redeems a token, so it must never be prerendered or cached.
export const dynamic = "force-dynamic";

export default async function NewsletterBestaetigenPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  requireNewsletterFlag();
  bootNewsletter();

  const raw = searchParams?.["token"];
  const token = typeof raw === "string" ? raw : "";
  // No token at all is answered like an expired one: same page, same offer.
  const result = token ? await confirmSubscription(getDb(), token) : { status: "expired" as const };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Newsletter</h1>

      {result.status === "confirmed" ? (
        <Alert variant="success" title="Du bist dabei">
          Danke! Ab jetzt schreiben wir dir ein paar Mal im Jahr, was im Verband und in den
          Hochschulgruppen passiert.
        </Alert>
      ) : null}

      {result.status === "already_confirmed" ? (
        <Alert variant="info" title="Alles schon erledigt">
          Diese Adresse ist bereits bestätigt — du bist dabei. Solche Links werden gern zweimal
          geklickt, das macht nichts.
        </Alert>
      ) : null}

      {result.status === "expired" ? (
        <>
          <Alert variant="info" title="Dieser Link ist abgelaufen">
            Bestätigungslinks gelten sieben Tage. Trag dich einfach noch einmal ein.
          </Alert>
          <p className="text-sm text-bdas-ink-body">
            <Link href="/newsletter" className="text-bdas-red hover:underline">
              Zur Newsletter-Seite
            </Link>
          </p>
        </>
      ) : null}
    </main>
  );
}
