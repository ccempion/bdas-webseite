import Link from "next/link";

import { boardScopes } from "@bdas/dashboard-shell";
import { getDb } from "@bdas/db";
import { Alert } from "@bdas/design-system";
import { listGroups } from "@bdas/groups";
import { isFederalBoard } from "@bdas/members";

import { loadApprovalCounts } from "../_dashboard/approvals";
import { loadCurrentMember } from "../_dashboard/session";

/**
 * The board's to-do line on /account. Renders only when something actually
 * waits — a permanent "you have board rights" banner reads as a task and is
 * one most of the time it is shown.
 *
 * Open applications are deliberately absent here: they stay in the header badge
 * and in each group's queue rather than on the viewer's personal account page.
 */
export async function ApprovalsAlert({ groupSlug }: { groupSlug: string | null }) {
  const me = await loadCurrentMember();
  if (!me) return null;

  const counts = await loadApprovalCounts();
  // Gate on what this alert still lists — `total` includes applications, so an
  // open application on its own would render the banner with an empty body.
  if (counts.groupTransfers + counts.openReports === 0) return null;

  const federal = isFederalBoard(me.grants);

  // The right to decide comes from the grant, not from the viewer's own
  // membership: since ADR 0031 a person stays groupless until a board accepts
  // them, so a local board member whose own application is still open has no
  // primaryGroupId to derive a queue from. Fall back to the group they actually
  // hold the grant for, or the alert becomes a to-do line with nowhere to go.
  // Federal short-circuits: it links to its own federation-wide queue, so
  // resolving a group here would cost a query nothing reads.
  const localSlug =
    federal || groupSlug
      ? groupSlug
      : (boardScopes(me.grants, await listGroups(getDb())).find((s) => s.kind === "group")?.slug ??
        null);

  const membersHref = federal
    ? "/federal/members"
    : localSlug
      ? `/gruppe/${localSlug}/members`
      : null;

  return (
    <Alert variant="info" title="Es wartet etwas auf dich">
      <span className="flex flex-col gap-1">
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
