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
  const membersHref = federal
    ? "/admin/pending-members"
    : groupSlug
      ? `/gruppe/${groupSlug}/members`
      : null;

  return (
    <Alert variant="info" title="Es wartet etwas auf dich">
      <span className="flex flex-col gap-1">
        {counts.pendingMembers > 0 && membersHref ? (
          <Link href={membersHref} className="text-bdas-red hover:underline">
            {counts.pendingMembers} Mitglied(er) freigeben →
          </Link>
        ) : null}
        {counts.incomingGroupChanges > 0 && membersHref ? (
          <Link href={membersHref} className="text-bdas-red hover:underline">
            {counts.incomingGroupChanges} Gruppenwechsel entscheiden →
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
