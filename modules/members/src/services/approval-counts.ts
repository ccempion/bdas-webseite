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

type GroupTally = { applications: number; groupTransfers: number };

/**
 * Per-destination-group tally of pending requests this actor may decide.
 * Shared by `countPendingApprovals` (summed across every group) and
 * `countPendingApplicationsByGroup` (kept apart, for the board nav badges) —
 * same query, same `canDecideJoinRequest` gate, so both stay consistent with
 * each other without a second source of truth for "can this actor decide it".
 */
async function tallyDecidableByGroup(db: Db, actor: Actor): Promise<Map<string, GroupTally>> {
  const federal = isFederalBoard(actor.grants);
  const scoped = scopedGroupIds(actor);
  if (!federal && scoped.length === 0) return new Map();

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
  const byGroup = new Map<string, GroupTally>();
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
  const decidable = new Map<string, GroupTally>();
  for (const [groupId, tally] of byGroup) {
    const hasBoard = await groupHasActiveLocalBoard(db, groupId);
    if (!canDecideJoinRequest(actor.grants, groupId, hasBoard)) continue;
    decidable.set(groupId, tally);
  }
  return decidable;
}

export async function countPendingApprovals(db: Db, actor: Actor): Promise<ApprovalCounts> {
  const byGroup = await tallyDecidableByGroup(db, actor);
  if (byGroup.size === 0) return ZERO;

  let applications = 0;
  let groupTransfers = 0;
  for (const tally of byGroup.values()) {
    applications += tally.applications;
    groupTransfers += tally.groupTransfers;
  }
  return { applications, groupTransfers };
}

/**
 * Open applications into each of the given groups that the actor may decide,
 * keyed by group id — 0 for a group with nothing open or absent from
 * `groupIds`. Powers the board nav badges: the sidebar renders one nav item
 * per scope, so it needs a count per group rather than
 * `countPendingApprovals`'s single federation-wide sum. A federal board
 * viewing a group that already has its own active local board correctly
 * gets 0 here — same "nothing for you to do" gate as the header badge.
 */
export async function countPendingApplicationsByGroup(
  db: Db,
  actor: Actor,
  groupIds: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, number>> {
  const byGroup = await tallyDecidableByGroup(db, actor);
  const out = new Map<string, number>();
  for (const groupId of groupIds) {
    out.set(groupId, byGroup.get(groupId)?.applications ?? 0);
  }
  return out;
}
