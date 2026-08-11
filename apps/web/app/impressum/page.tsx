import type { Metadata } from "next";
import Link from "next/link";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { breiteClass, normalizeContent, puckConfig } from "../_content/puck-config";
import { loadCurrentMember } from "../_dashboard/session";

export const dynamic = "force-dynamic";

const SLUG = "impressum";

export const metadata: Metadata = {
  title: "Impressum",
};

/**
 * Impressum — hosted in-app (ADR 0009), board-editable via Puck (ADR 0024).
 * Legally required and therefore always reachable: it is never gated behind a
 * feature flag. Content is authored entirely in the Puck editor; when the
 * content flag is off or no document exists yet, only the header renders. The
 * reviewed Impressum (§ 5 DDG / § 18 MStV) must be authored before launch.
 */
export default async function ImpressumPage() {
  const contentOn = isFlagOn("content");
  const page = contentOn ? await getPage(getDb(), SLUG) : null;
  const me = contentOn ? await loadCurrentMember() : null;
  const canEdit = me !== null && isFederalBoard(me.grants);

  return (
    <main className="py-12">
      <div
        className={`mx-auto flex w-full flex-col items-start gap-4 px-4 sm:flex-row sm:justify-between ${breiteClass("schmal")}`}
      >
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
        <div className="mt-6">
          <Render config={puckConfig} data={normalizeContent(page.data as Data, "schmal")} />
        </div>
      ) : null}
    </main>
  );
}
