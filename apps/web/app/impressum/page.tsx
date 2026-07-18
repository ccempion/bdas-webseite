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

const SLUG = "impressum";

export const metadata: Metadata = {
  title: "Impressum",
};

/**
 * Impressum — hosted in-app (ADR 0009), board-editable via Puck (ADR 0024).
 * Legally required and therefore always reachable: it is never gated behind a
 * feature flag. When the content flag is off or the board has not authored a
 * document, it falls back to the static placeholder below, which must still be
 * replaced with the reviewed Impressum (§ 5 DDG / § 18 MStV) before launch.
 */
export default async function ImpressumPage() {
  const contentOn = isFlagOn("content");
  const page = contentOn ? await getPage(getDb(), SLUG) : null;
  const me = contentOn ? await loadCurrentMember() : null;
  const canEdit = me !== null && isFederalBoard(me.grants);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <h1 className="break-words text-3xl font-semibold text-bdas-ink">Impressum</h1>
        {canEdit ? (
          <Link
            href="/impressum/bearbeiten"
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
            Platzhalter — die Angaben nach § 5 DDG / § 18 MStV werden vom Bundesvorstand
            (e.&nbsp;V.) bereitgestellt und müssen vor dem Produktivstart hier eingesetzt werden.
          </div>

          <div className="flex flex-col gap-4 text-bdas-ink-body">
            <p>
              Hier sind Name und Anschrift des Vereins, die Vertretungsberechtigten, das
              Vereinsregister und die Registernummer, Kontaktdaten (E-Mail, ggf. Telefon) sowie ggf.
              die Umsatzsteuer-Identifikationsnummer einzufügen.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
