import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { feedbackCounts, listEntries, listSubmissions, listTopics } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";
import { getMemberByUserId } from "@bdas/members";

import { requireFederalScope } from "../../../_dashboard/session";
import { FaqAdminBoard } from "./FaqAdminBoard";
import { toSubmissionCards } from "./submission-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "FAQ" };

export default async function FederalFaqPage() {
  if (!isFlagOn("faq_suite")) notFound();
  await requireFederalScope();

  const db = getDb();
  const [entries, topics, submissions] = await Promise.all([
    listEntries(db),
    listTopics(db),
    listSubmissions(db, { status: "open" }),
  ]);
  const counts = await feedbackCounts(
    db,
    entries.map((e) => e.id),
  );
  const feedbackByEntry = Object.fromEntries(counts);

  // One lookup per open submission. `@bdas/members` exposes no id-set query
  // (MemberQuery is groupId/status/search only) and the open queue is the
  // board's triage backlog — a bounded handful — so this stays cheaper than
  // pulling the whole member table to resolve a few names. Revisit if the
  // queue is ever allowed to grow unbounded.
  const submitterIds = [...new Set(submissions.map((s) => s.submittedBy))];
  const members = await Promise.all(submitterIds.map((id) => getMemberByUserId(db, id)));
  const namesByUserId = new Map(
    members.flatMap((m, i) =>
      m ? [[submitterIds[i]!, `${m.firstName} ${m.lastName}`] as const] : [],
    ),
  );

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">FAQ</h1>
      <FaqAdminBoard
        entries={entries}
        topics={topics}
        feedbackByEntry={feedbackByEntry}
        submissions={toSubmissionCards({ submissions, namesByUserId })}
      />
    </section>
  );
}
