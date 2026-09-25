import Link from "next/link";
import { redirect } from "next/navigation";

import { PASSWORD_RULE_HINT } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { Button, Card } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { Begriff } from "../../_glossar/Begriff";
import { accountDeletionEnabled } from "../../_account-deletion/flag";
import { buildAnmeldenUrl } from "../../_auth/return-to";
import { requireAuthFlag } from "../../_auth/flag";
import { requireMembersFlag } from "../../_members/flag";
import { newsletterEnabled } from "../../_newsletter/flag";
import { NewsletterToggle } from "../../_newsletter/NewsletterToggle";
import { readSessionCookie } from "../../../lib/auth-cookie";
import { ChangePasswordCard } from "../ChangePasswordCard";
import { DeleteAccountCard } from "../DeleteAccountCard";
import { EmailChangeCard } from "../EmailChangeCard";
import { SendDataExportButton } from "../SendDataExportButton";

export const metadata = { title: "Kontoeinstellungen" };

export default async function AccountSettingsPage() {
  requireAuthFlag();
  requireMembersFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect(buildAnmeldenUrl("/account/einstellungen"));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/account" className="text-sm text-bdas-ink-muted hover:underline">
          ← Mein Konto
        </Link>
        <h1 className="text-2xl font-semibold text-bdas-ink">Kontoeinstellungen</h1>
        <p className="text-bdas-ink-body">
          Zugangsdaten und deine Daten. Dein Profil bearbeitest du auf der Übersicht.
        </p>
      </div>

      <EmailChangeCard currentEmail={me.user.email} />

      <ChangePasswordCard passwordHint={PASSWORD_RULE_HINT} />

      {newsletterEnabled() ? (
        <Card flat className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-bdas-ink">E-Mail-Benachrichtigungen</h2>
          <NewsletterToggle account={{ userId: me.user.id, email: me.user.email }} />
        </Card>
      ) : (
        /* Reserved. Position and name are fixed now so that shipping the
           preferences is an insert, not a rearrangement. Not a control: it is
           inert and announces itself as unavailable. */
        <Card flat className="border-dashed p-6" aria-disabled="true">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-bdas-ink-muted">E-Mail-Benachrichtigungen</h2>
            <span className="rounded-bdas-pill border border-bdas-strong px-2.5 py-0.5 text-xs uppercase tracking-wide text-bdas-ink-muted">
              Kommt bald
            </span>
          </div>
          <p className="mt-2 text-sm text-bdas-ink-muted">
            Hier wählst du künftig, welche Benachrichtigungen du per E-Mail bekommst.
          </p>
        </Card>
      )}

      <Card flat className="p-6">
        <h2 className="mb-2 text-lg font-semibold text-bdas-ink">Deine Daten</h2>
        <p className="mb-4 text-sm text-bdas-ink-body">
          <Begriff k="datenexport">Export</Begriff> aller zu dir gespeicherten Daten (Art. 15/20
          DSGVO).
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/account/datenexport">
            <Button variant="secondary">Meine Daten exportieren</Button>
          </a>
          {accountDeletionEnabled() ? (
            <>
              <a href="/account/datenexport?format=zip">
                <Button variant="secondary">Als CSV-ZIP</Button>
              </a>
              {isFlagOn("notifications") ? <SendDataExportButton /> : null}
            </>
          ) : null}
        </div>
      </Card>

      {accountDeletionEnabled() ? <DeleteAccountCard /> : null}
    </main>
  );
}
