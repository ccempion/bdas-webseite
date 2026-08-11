import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { canvasChrome } from "../../_content/canvas-chrome";
import { PuckEditor } from "../../_content/PuckEditor";
import { loadCurrentMember } from "../../_dashboard/session";

export const dynamic = "force-dynamic";

const SLUG = "ueber-uns";

export const metadata: Metadata = {
  title: "Seite bearbeiten — Über uns",
  robots: { index: false },
};

/** Editor is board-only; everyone else gets a 404 (no existence leak, spec §6). */
export default async function UeberUnsBearbeitenPage() {
  if (!isFlagOn("public_shell") || !isFlagOn("content")) notFound();

  const me = await loadCurrentMember();
  if (!me || !isFederalBoard(me.grants)) notFound();

  const page = await getPage(getDb(), SLUG);
  const initialData = (page?.data ?? { root: { props: {} }, content: [] }) as Data;

  return <PuckEditor slug={SLUG} initialData={initialData} chrome={canvasChrome()} />;
}
