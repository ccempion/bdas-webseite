/**
 * Counts for the header badge. Deliberately separate from the list services:
 * the badge renders on every page, and loading full rows plus a join for a
 * single integer is the wrong trade there.
 *
 * Both numbers come from `member_group_change_requests`, because since ADR 0031
 * that is where *every* pending decision lives — an application is a request
 * `NULL → group`, a transfer is `group → group`. Counting `members.status =
 * 'pending'` as a second source would double-count the same applicant, who is
 * now simultaneously a pending member and an open request.
 *
 * An actor without a board role gets zeros instead of a ForbiddenError — a
 * thrown permission in a site-wide header is a page error, not a zero.
 */
import { eq, sql } from "drizzle-orm";

import { canDecideJoinRequest, isFederalBoard } from "../roles";
import { memberGroupChangeRequests } from "../schema";

import { groupHasActiveLocalBoard, scopedGroupIds, type Actor, type Db } from "./status";

export type ApprovalCounts = {
  /** First-time applications into a group the actor may decide. */
  readonly applications: number;
  /** Moves between two groups, decided by the destination. */
  readonly groupTransfers: number;
};

const ZERO: ApprovalCounts = { applications: 0, groupTransfers: 0 };

export async function countPendingApprovals(db: Db, actor: Actor): Promise<ApprovalCounts> {
  const federal = isFederalBoard(actor.grants);
  const scoped = scopedGroupIds(actor);
  if (!federal && scoped.length === 0) return ZERO;

  const rows = await db
    .select({
      toGroupId: memberGroupChangeRequests.toGroupId,
      isApplication: sql<boolean>`${memberGroupChangeRequests.fromGroupId} is null`,
      n: sql<number>`count(*)::int`,
    })
    .from(memberGroupChangeRequests)
    .where(eq(memberGroupChangeRequests.status, "pending"))
    .groupBy(
      memberGroupChangeRequests.toGroupId,
      sql`${memberGroupChangeRequests.fromGroupId} is null`,
    );

  // Tally per destination first, so the board probe below runs once per group
  // rather than once per (group, kind) pair.
  const byGroup = new Map<string, { applications: number; groupTransfers: number }>();
  for (const row of rows) {
    if (row.toGroupId === null) continue; // an exit needs no decision
    if (!federal && !scoped.includes(row.toGroupId)) continue;
    const tally = byGroup.get(row.toGroupId) ?? { applications: 0, groupTransfers: 0 };
    if (row.isApplication) tally.applications += row.n;
    else tally.groupTransfers += row.n;
    byGroup.set(row.toGroupId, tally);
  }

  // canDecide needs to know whether each destination group has a board of its
  // own (the federal fallback in ADR 0021), same shape as listOpenGroupChanges.
  let applications = 0;
  let groupTransfers = 0;
  for (const [groupId, tally] of byGroup) {
    const hasBoard = await groupHasActiveLocalBoard(db, groupId);
    if (!canDecideJoinRequest(actor.grants, groupId, hasBoard)) continue;
    applications += tally.applications;
    groupTransfers += tally.groupTransfers;
  }

  return { applications, groupTransfers };
}
