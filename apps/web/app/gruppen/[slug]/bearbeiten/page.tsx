import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroupBySlug } from "@bdas/groups";
import { canEditGroupPage } from "@bdas/members";

import { canvasChrome } from "../../../_content/canvas-chrome";
import { PuckEditor } from "../../../_content/PuckEditor";
import { loadCurrentMember } from "../../../_dashboard/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gruppenseite bearbeiten",
  robots: { index: false },
};

/** Editor is lead/page_editor/federal-only; everyone else gets a 404
 *  (no existence leak, spec §6). */
export default async function GruppeBearbeitenPage({ params }: { params: { slug: string } }) {
  if (!isFlagOn("groups") || !isFlagOn("content")) notFound();

  const group = await getGroupBySlug(getDb(), params.slug);
  if (!group || group.status === "archived") notFound();

  const me = await loadCurrentMember();
  if (!me || !canEditGroupPage(me.grants, group.id)) notFound();

  const slug = `gruppen/${group.slug}`;
  const page = await getPage(getDb(), slug);
  const initialData = (page?.data ?? { root: { props: {} }, content: [] }) as Data;

  return <PuckEditor slug={slug} initialData={initialData} chrome={canvasChrome()} />;
}
