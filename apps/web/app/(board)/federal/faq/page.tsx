import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { feedbackCounts, listEntries, listTopics } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";

import { requireFederalScope } from "../../../_dashboard/session";
import { FaqAdminBoard } from "./FaqAdminBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "FAQ" };

export default async function FederalFaqPage() {
  if (!isFlagOn("faq_suite")) notFound();
  await requireFederalScope();

  const db = getDb();
  const [entries, topics] = await Promise.all([listEntries(db), listTopics(db)]);
  const counts = await feedbackCounts(
    db,
    entries.map((e) => e.id),
  );
  const feedbackByEntry = Object.fromEntries(counts);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">FAQ</h1>
      <FaqAdminBoard entries={entries} topics={topics} feedbackByEntry={feedbackByEntry} />
    </section>
  );
}
