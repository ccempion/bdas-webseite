import Link from "next/link";

import { getDb } from "@bdas/db";
import { Alert } from "@bdas/design-system";
import { peekUnsubscribeToken } from "@bdas/newsletter";

import { bootNewsletter } from "../../../lib/newsletter-bootstrap";
import { requireNewsletterFlag } from "../../_newsletter/flag";
import { UnsubscribeConfirm } from "./UnsubscribeConfirm";

export const metadata = { title: "Newsletter abbestellen" };

export const dynamic = "force-dynamic";

export default async function NewsletterAbmeldenPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  requireNewsletterFlag();
  bootNewsletter();

  const raw = searchParams?.["token"];
  const token = typeof raw === "string" ? raw : "";
  const peek = token ? await peekUnsubscribeToken(getDb(), token) : null;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Newsletter abbestellen</h1>

      {peek && !peek.alreadyUnsubscribed ? (
        <UnsubscribeConfirm token={token} email={peek.email} />
      ) : null}

      {peek?.alreadyUnsubscribed ? (
        <Alert variant="info" title="Schon abgemeldet">
          Diese Adresse steht nicht mehr auf unserer Liste. Du musst nichts weiter tun.
        </Alert>
      ) : null}

      {!peek ? (
        <>
          <Alert variant="info" title="Dieser Link führt ins Leere">
            Der Abmeldelink ist unvollständig oder gehört nicht mehr zu einer Anmeldung.
          </Alert>
          {/* No "enter your address to unsubscribe" form on purpose: that would
              be an open endpoint for unsubscribing anyone. The two legitimate
              ways out are the link in the mail and the switch in the account. */}
          <p className="text-sm text-bdas-ink-body">
            Nutze den Abmeldelink aus einer unserer E-Mails. Hast du ein Konto bei uns, kannst du
            den Newsletter auch unter{" "}
            <Link href="/account/einstellungen" className="text-bdas-red hover:underline">
              Mein Konto
            </Link>{" "}
            abschalten.
          </p>
        </>
      ) : null}
    </main>
  );
}
