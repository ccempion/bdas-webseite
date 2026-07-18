import type { Metadata } from "next";
import Link from "next/link";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { puckConfig } from "../../_content/puck-config";
import { loadCurrentMember } from "../../_dashboard/session";
import { requirePublicShellFlag } from "../../_public/flag";

export const dynamic = "force-dynamic";

const SLUG = "ueber-uns/bdaj";

export const metadata: Metadata = {
  title: "Bund der Alevitischen Jugendlichen (BDAJ)",
  description: "Unser Jugendverband: der Bund der Alevitischen Jugendlichen in Deutschland e.V.",
};

/**
 * BDAJ — board-editable via Puck (ADR 0024). When the content flag is off or
 * the board has not authored a document, the page falls back to the static
 * placeholder copy below (finale Texte liefert der Bundesvorstand, Spec §8).
 */
export default async function BdajPage() {
  requirePublicShellFlag();

  const contentOn = isFlagOn("content");
  const page = contentOn ? await getPage(getDb(), SLUG) : null;
  const me = contentOn ? await loadCurrentMember() : null;
  const canEdit = me !== null && isFederalBoard(me.grants);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <h1 className="break-words text-3xl font-semibold text-bdas-ink">
          Bund der Alevitischen Jugendlichen (BDAJ)
        </h1>
        {canEdit ? (
          <Link
            href="/ueber-uns/bdaj/bearbeiten"
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
          <p className="text-bdas-ink-body">
            Der BDAJ ist die Jugendorganisation der Alevitischen Gemeinde Deutschland und vertritt
            über 78.000 Kinder, Jugendliche und junge Erwachsene. Der BDAS ist eng mit dem BDAJ
            verbunden — viele unserer Mitglieder sind dort groß geworden.
          </p>
          <p>
            <a
              href="https://bdaj.de"
              rel="noopener noreferrer"
              target="_blank"
              className="text-bdas-red hover:underline"
            >
              Zur Website des BDAJ →
            </a>
          </p>
        </>
      )}
    </main>
  );
}
