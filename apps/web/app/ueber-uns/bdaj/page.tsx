import type { Metadata } from "next";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { breiteClass, normalizeContent, puckConfig } from "../../_content/puck-config";
import { SeiteBearbeitenLink } from "../../_content/SeiteBearbeitenLink";
import { loadCurrentMember } from "../../_dashboard/session";
import { requirePublicShellFlag } from "../../_public/flag";

export const dynamic = "force-dynamic";

const SLUG = "ueber-uns/bdaj";

export const metadata: Metadata = {
  title: "Bund der Alevitischen Jugendlichen (BDAJ)",
  description: "Unser Jugendverband: der Bund der Alevitischen Jugendlichen in Deutschland e.V.",
};

/**
 * BDAJ — board-editable via Puck (ADR 0024). Content is authored entirely in
 * the Puck editor; when the content flag is off or no document exists yet, only
 * the header renders (no static fallback body).
 */
export default async function BdajPage() {
  requirePublicShellFlag();

  const contentOn = isFlagOn("content");
  const page = contentOn ? await getPage(getDb(), SLUG) : null;
  const me = contentOn ? await loadCurrentMember() : null;
  const canEdit = me !== null && isFederalBoard(me.grants);

  return (
    <main className="py-12">
      {canEdit ? (
        <SeiteBearbeitenLink
          href="/ueber-uns/bdaj/bearbeiten"
          breiteKlasse={breiteClass("schmal")}
        />
      ) : null}
      {page ? (
        <Render config={puckConfig} data={normalizeContent(page.data as Data, "schmal")} />
      ) : null}
    </main>
  );
}
