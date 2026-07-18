import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { puckConfig } from "../../_content/puck-config";
import { loadCurrentMember } from "../../_dashboard/session";
import { requirePublicShellFlag } from "../../_public/flag";

export const dynamic = "force-dynamic";

const SLUG = "ueber-uns/bundessprecherinnenrat";

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

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold text-bdas-ink">Bundessprecher*innenrat</h1>
        {canEdit ? (
          <Link
            href="/ueber-uns/bundessprecherinnenrat/bearbeiten"
            className="inline-flex shrink-0 items-center rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
          >
            Seite bearbeiten
          </Link>
        ) : null}
      </div>
      {page ? (
        <Render config={puckConfig} data={page.data as Data} />
      ) : (
        <p className="text-bdas-ink-body">Inhalte folgen in Kürze.</p>
      )}
    </main>
  );
}
