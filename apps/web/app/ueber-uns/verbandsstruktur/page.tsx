import type { Metadata } from "next";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { pageMetadata } from "../../_content/canvas-chrome";
import { breiteClass, normalizeContent, puckConfig } from "../../_content/puck-config";
import { SeiteBearbeitenLink } from "../../_content/SeiteBearbeitenLink";
import { loadCurrentMember } from "../../_dashboard/session";
import { requirePublicShellFlag } from "../../_public/flag";

export const dynamic = "force-dynamic";

const SLUG = "ueber-uns/verbandsstruktur";

export const metadata: Metadata = {
  title: "Verbandsstruktur",
  description: "Wie der BDAS organisiert ist: Hochschulgruppen, Bundesvorstand, Bundeskonferenz.",
};

/**
 * Verbandsstruktur — board-editable via Puck (ADR 0024), built around the
 * Organigramm block (ADR 0028). `breit` gives the chart horizontal room.
 */
export default async function VerbandsstrukturPage() {
  requirePublicShellFlag();

  const contentOn = isFlagOn("content");
  const page = contentOn ? await getPage(getDb(), SLUG) : null;
  const me = contentOn ? await loadCurrentMember() : null;
  const canEdit = me !== null && isFederalBoard(me.grants);

  return (
    <main className="py-12">
      {canEdit ? (
        <SeiteBearbeitenLink
          href="/ueber-uns/verbandsstruktur/bearbeiten"
          breiteKlasse={breiteClass("breit")}
        />
      ) : null}
      {page ? (
        <Render
          config={puckConfig}
          data={normalizeContent(page.data as Data, "breit")}
          metadata={await pageMetadata("/ueber-uns/verbandsstruktur")}
        />
      ) : null}
    </main>
  );
}
