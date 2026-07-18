import type { Metadata } from "next";
import Link from "next/link";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { puckConfig } from "../_content/puck-config";
import { loadCurrentMember } from "../_dashboard/session";

export const dynamic = "force-dynamic";

const SLUG = "datenschutz";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
};

/**
 * Datenschutzerklärung — hosted in-app (ADR 0009), board-editable via Puck
 * (ADR 0024). Legally required and therefore always reachable: it is never
 * gated behind a feature flag. When the content flag is off or the board has
 * not authored a document, it falls back to the static text below, which must
 * still be replaced with the reviewed Datenschutzerklärung before launch.
 */
export default async function DatenschutzPage() {
  const contentOn = isFlagOn("content");
  const page = contentOn ? await getPage(getDb(), SLUG) : null;
  const me = contentOn ? await loadCurrentMember() : null;
  const canEdit = me !== null && isFederalBoard(me.grants);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <h1 className="break-words text-3xl font-semibold text-bdas-ink">Datenschutzerklärung</h1>
        {canEdit ? (
          <Link
            href="/datenschutz/bearbeiten"
            className="inline-flex shrink-0 items-center rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
          >
            Seite bearbeiten
          </Link>
        ) : null}
      </div>
      {page ? (
        <Render config={puckConfig} data={page.data as Data} />
      ) : (
        <>
          <div className="rounded-bdas border border-bdas-soft bg-bdas-overlay-hover px-4 py-3 text-sm text-bdas-ink-muted">
            Platzhalter — der rechtsverbindliche Text der Datenschutzerklärung wird vom
            Bundesvorstand (e.&nbsp;V.) bereitgestellt und muss vor dem Produktivstart hier
            eingesetzt werden.
          </div>

          <div className="flex flex-col gap-4 text-bdas-ink-body">
            <p>
              Diese Plattform setzt ausschließlich technisch notwendige Cookies ein, um angemeldete
              Mitglieder eingeloggt zu halten. Es findet kein Tracking und keine Weitergabe an
              Dritte zu Werbezwecken statt.
            </p>
            <p>
              Auf der Startseite und der Seite „Hochschulgruppen“ binden wir eine interaktive Karte
              auf Basis von OpenStreetMap ein. Beim Laden der Karte wird Ihre IP-Adresse an Server
              der OpenStreetMap Foundation (St John&apos;s Innovation Centre, Cambridge, Vereinigtes
              Königreich) übertragen, um die Kartenkacheln auszuliefern. Rechtsgrundlage ist unser
              berechtigtes Interesse an einer ansprechenden Darstellung unserer Hochschulgruppen
              (Art. 6 Abs. 1 lit. f DSGVO).
            </p>
            <p>
              Verantwortliche Stelle, Kontaktdaten, Zweck und Rechtsgrundlage der Verarbeitung,
              Hinweise zu Speicherdauer und Betroffenenrechten sind hier einzufügen.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
