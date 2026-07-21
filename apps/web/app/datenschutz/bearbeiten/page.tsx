import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { PuckEditor } from "../../_content/PuckEditor";
import { loadCurrentMember } from "../../_dashboard/session";

export const dynamic = "force-dynamic";

const SLUG = "datenschutz";

export const metadata: Metadata = {
  title: "Seite bearbeiten — Datenschutzerklärung",
  robots: { index: false },
};

/**
 * Editor is board-only; everyone else gets a 404 (no existence leak, spec §6).
 * The public Datenschutzerklärung is always reachable, but authoring it
 * requires the content module, so the editor route is gated on the `content`
 * flag.
 */
export default async function DatenschutzBearbeitenPage() {
  if (!isFlagOn("content")) notFound();

  const me = await loadCurrentMember();
  if (!me || !isFederalBoard(me.grants)) notFound();

  const page = await getPage(getDb(), SLUG);
  const initialData = (page?.data ?? { root: { props: {} }, content: [] }) as Data;

  return <PuckEditor slug={SLUG} initialData={initialData} />;
}
