import type { Metadata } from "next";
import Link from "next/link";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { breiteClass, puckConfig, withBreite } from "../../_content/puck-config";
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
      <div
        className={`mx-auto flex w-full flex-col items-start gap-4 px-4 sm:flex-row sm:justify-between ${breiteClass("schmal")}`}
      >
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
        <div className="mt-6">
          <Render config={puckConfig} data={withBreite(page.data as Data, "schmal")} />
        </div>
      ) : null}
    </main>
  );
}
