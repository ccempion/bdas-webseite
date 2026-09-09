import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { type Breite, breiteClass, normalizeContent, puckConfig } from "../../_content/puck-config";
import { SeiteBearbeitenLink } from "../../_content/SeiteBearbeitenLink";
import { loadCurrentMember } from "../../_dashboard/session";
import { requirePublicShellFlag } from "../../_public/flag";

export const dynamic = "force-dynamic";

const SLUG = "ueber-uns/bundessprecherinnenrat";
const BREITE: Breite = "breit";

export const metadata: Metadata = {
  title: "Bundessprecher*innenrat",
  description:
    "Der Bundessprecher*innenrat des BDAS — die Mitglieder des Bundesvorstands mit Rolle, Universität und Studiengang.",
};

export default async function BsrPage() {
  requirePublicShellFlag();
  if (!isFlagOn("content")) notFound();

  const page = await getPage(getDb(), SLUG);
  const me = await loadCurrentMember();
  const canEdit = me !== null && isFederalBoard(me.grants);
  const width = breiteClass(BREITE);

  return (
    <main className="py-12">
      {canEdit ? (
        <SeiteBearbeitenLink
          href="/ueber-uns/bundessprecherinnenrat/bearbeiten"
          breiteKlasse={width}
        />
      ) : null}
      {page ? (
        <Render config={puckConfig} data={normalizeContent(page.data as Data, BREITE)} />
      ) : (
        <p className={`mx-auto w-full px-4 text-bdas-ink-body ${width}`}>
          Inhalte folgen in Kürze.
        </p>
      )}
    </main>
  );
}
