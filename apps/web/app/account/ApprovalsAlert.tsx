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
 */
export async function ApprovalsAlert({ groupSlug }: { groupSlug: string | null }) {
  const me = await loadCurrentMember();
  if (!me) return null;

  const counts = await loadApprovalCounts();
  if (counts.total === 0) return null;

  const federal = isFederalBoard(me.grants);

  // The right to decide comes from the grant, not from the viewer's own
  // membership: since ADR 0031 a person stays groupless until a board accepts
  // them, so a local board member whose own application is still open has no
  // primaryGroupId to derive a queue from. Fall back to the group they actually
  // hold the grant for, or the alert becomes a to-do line with nowhere to go.
  // Federal is resolved first and never falls through here — boardScopes hands
  // federal every active group, so picking one would misroute them away from
  // the pool.
  const localSlug =
    federal || groupSlug
      ? groupSlug
      : (boardScopes(me.grants, await listGroups(getDb())).find((s) => s.kind === "group")?.slug ??
        null);

  // Applications live in the destination group's queue. Federal has no queue of
  // its own — the pool page lists every open application across the federation
  // and links into each group's queue from there (ADR 0031).
  const applicationsHref = federal
    ? "/federal/pool"
    : localSlug
      ? `/gruppe/${localSlug}/bewerbungen`
      : null;
  const membersHref = federal
    ? "/federal/members"
    : localSlug
      ? `/gruppe/${localSlug}/members`
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
