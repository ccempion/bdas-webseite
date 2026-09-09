import type { Metadata } from "next";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { breiteClass, normalizeContent, puckConfig } from "../_content/puck-config";
import { SeiteBearbeitenLink } from "../_content/SeiteBearbeitenLink";
import { loadCurrentMember } from "../_dashboard/session";

export const dynamic = "force-dynamic";

const SLUG = "nutzungsbedingungen";

export const metadata: Metadata = {
  title: "Nutzungsbedingungen",
};

/**
 * Nutzungsbedingungen — hosted in-app, board-editable via Puck (ADR 0024).
 * Governs use of the platform and is linked from the footer alongside the two
 * other legal routes, so it shares their exception: never gated behind a
 * feature flag on the render side. Content is authored entirely in the Puck
 * editor; when the content flag is off or no document exists yet, only the
 * header renders. The reviewed terms must be authored before launch.
 */
export default async function NutzungsbedingungenPage() {
  const contentOn = isFlagOn("content");
  const page = contentOn ? await getPage(getDb(), SLUG) : null;
  const me = contentOn ? await loadCurrentMember() : null;
  const canEdit = me !== null && isFederalBoard(me.grants);

  return (
    <main className="py-12">
      {canEdit ? (
        <SeiteBearbeitenLink
          href="/nutzungsbedingungen/bearbeiten"
          breiteKlasse={breiteClass("schmal")}
        />
      ) : null}
      {page ? (
        <Render config={puckConfig} data={normalizeContent(page.data as Data, "schmal")} />
      ) : null}
    </main>
  );
}
