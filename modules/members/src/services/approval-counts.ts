/**
 * Counts for the header badge. Deliberately separate from `listPendingMembers`
 * and `listOpenGroupChanges`: the badge renders on every page, and loading full
 * rows plus a join for a single integer is the wrong trade there.
 *
 * Unlike `listPendingMembers`, an actor without a board role gets zeros instead
 * of a ForbiddenError — a thrown permission in a site-wide header is a page
 * error, not a zero.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { canDecideJoinRequest, isFederalBoard } from "../roles";
import { memberGroupChangeRequests, members } from "../schema";

import { groupHasActiveLocalBoard, scopedGroupIds, type Actor, type Db } from "./status";

export type ApprovalCounts = {
  readonly pendingMembers: number;
  readonly incomingGroupChanges: number;
};

const ZERO: ApprovalCounts = { pendingMembers: 0, incomingGroupChanges: 0 };

export async function countPendingApprovals(db: Db, actor: Actor): Promise<ApprovalCounts> {
  const federal = isFederalBoard(actor.grants);
  const scoped = scopedGroupIds(actor);
  if (!federal && scoped.length === 0) return ZERO;

  const memberWhere = federal
    ? eq(members.status, "pending")
    : and(eq(members.status, "pending"), inArray(members.primaryGroupId, scoped));

  const [memberRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(members)
    .where(memberWhere);

  const changeRows = await db
    .select({ toGroupId: memberGroupChangeRequests.toGroupId, n: sql<number>`count(*)::int` })
    .from(memberGroupChangeRequests)
    .where(eq(memberGroupChangeRequests.status, "pending"))
    .groupBy(memberGroupChangeRequests.toGroupId);

  // canDecide needs to know whether each destination group has a board of its
  // own (the federal fallback in ADR 0021). One probe per distinct destination,
  // same shape as listOpenGroupChanges.
  let incoming = 0;
  for (const row of changeRows) {
    if (row.toGroupId === null) continue;
    if (!federal && !scoped.includes(row.toGroupId)) continue;
    const hasBoard = await groupHasActiveLocalBoard(db, row.toGroupId);
    if (canDecideJoinRequest(actor.grants, row.toGroupId, hasBoard)) incoming += row.n;
  }

  return { pendingMembers: memberRow?.n ?? 0, incomingGroupChanges: incoming };
}
