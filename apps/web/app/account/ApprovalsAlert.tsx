import Link from "next/link";

import { Alert } from "@bdas/design-system";
import { isFederalBoard } from "@bdas/members";

import { loadApprovalCounts } from "../_dashboard/approvals";
import { loadCurrentMember } from "../_dashboard/session";

/**
 * The board's to-do line on /account. Renders only when something actually
 * waits — a permanent "you have board rights" banner reads as a task and is
 * one most of the time it is shown.
 */
export async function ApprovalsAlert({ groupSlug }: { groupSlug: string | null }) {
  const me = await loadCurrentMember();
  if (!me) return null;

  const counts = await loadApprovalCounts();
  if (counts.total === 0) return null;

  const federal = isFederalBoard(me.grants);
  // Applications live in the destination group's queue. Federal has no queue of
  // its own — the pool page lists every open application across the federation
  // and links into each group's queue from there (ADR 0031).
  const applicationsHref = groupSlug
    ? `/gruppe/${groupSlug}/bewerbungen`
    : federal
      ? "/federal/pool"
      : null;
  const membersHref = federal
    ? "/federal/members"
    : groupSlug
      ? `/gruppe/${groupSlug}/members`
      : null;

  return (
    <Alert variant="info" title="Es wartet etwas auf dich">
      <span className="flex flex-col gap-1">
        {counts.applications > 0 && applicationsHref ? (
          <Link href={applicationsHref} className="text-bdas-red hover:underline">
            {counts.applications} Bewerbung(en) entscheiden →
          </Link>
        ) : null}
        {counts.groupTransfers > 0 && membersHref ? (
          <Link href={membersHref} className="text-bdas-red hover:underline">
            {counts.groupTransfers} Gruppenwechsel entscheiden →
          </Link>
        ) : null}
        {counts.openReports > 0 ? (
          <Link href="/blog/meldungen" className="text-bdas-red hover:underline">
            {counts.openReports} gemeldete(r) Beitrag/Beiträge prüfen →
          </Link>
        ) : null}
      </span>
    </Alert>
  );
}
