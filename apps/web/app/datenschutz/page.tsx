import type { Metadata } from "next";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { pageMetadata } from "../_content/canvas-chrome";
import { breiteClass, normalizeContent, puckConfig } from "../_content/puck-config";
import { SeiteBearbeitenLink } from "../_content/SeiteBearbeitenLink";
import { loadCurrentMember } from "../_dashboard/session";

export const dynamic = "force-dynamic";

const SLUG = "datenschutz";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
};

/**
 * Datenschutzerklärung — hosted in-app (ADR 0009), board-editable via Puck
 * (ADR 0024). Legally required and therefore always reachable: it is never
 * gated behind a feature flag. Content is authored entirely in the Puck editor;
 * when the content flag is off or no document exists yet, a short placeholder
 * renders in its place — the page title itself is authored in the document
 * (ADR 0038). The reviewed Datenschutzerklärung must be authored before launch.
 */
export default async function DatenschutzPage() {
  const contentOn = isFlagOn("content");
  const page = contentOn ? await getPage(getDb(), SLUG) : null;
  const me = contentOn ? await loadCurrentMember() : null;
  const canEdit = me !== null && isFederalBoard(me.grants);

  return (
    <main className="py-12">
      {canEdit ? (
        <SeiteBearbeitenLink href="/datenschutz/bearbeiten" breiteKlasse={breiteClass("schmal")} />
      ) : null}
      {page ? (
        <Render
          config={puckConfig}
          data={normalizeContent(page.data as Data, "schmal")}
          metadata={await pageMetadata("/datenschutz")}
        />
      ) : (
        // This route is never flag-gated and the page title now lives in the
        // document (ADR 0038), so without this an unauthored legal page would
        // be a blank <main>.
        <p className={`mx-auto w-full px-4 text-bdas-ink-body ${breiteClass("schmal")}`}>
          Diese Seite wird derzeit erstellt.
        </p>
      )}
    </main>
  );
}
