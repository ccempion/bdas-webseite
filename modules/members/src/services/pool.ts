/**
 * The groupless pool (ADR 0031): everyone in good standing who currently
 * belongs to no group — applicants who were never accepted anywhere, and
 * members between groups. Alumni are excluded; they are not looking for a
 * group. Since ADR 0043 that exclusion runs over the `alumnus` grant, not the
 * member status — an alumnus is an ordinary `active` member with a marking.
 *
 * Federal-board only. A local board gets an empty list rather than an error:
 * the pool is federation-wide oversight, and a group's own queue is the surface
 * a local board acts on.
 */
import { and, asc, inArray, isNull, notInArray } from "drizzle-orm";

import { isFederalBoard } from "../roles";
import { members } from "../schema";
import type { Member } from "../types";

import { row2member } from "./get";
import { listAlumnusIds } from "./list-members";
import type { Actor, Db } from "./status";

export type GrouplessMember = {
  readonly member: Member;
  /**
   * The member row's creation time — i.e. when the person registered.
   * This is NOT the time since they became groupless: for a member who left
   * a group, it predates that departure by however long they were a member.
   */
  readonly registeredAt: Date;
};

export async function listGrouplessMembers(db: Db, actor: Actor): Promise<GrouplessMember[]> {
  if (!isFederalBoard(actor.grants)) return [];

  const alumni = await listAlumnusIds(db);

  const rows = await db
    .select()
    .from(members)
    .where(
      and(
        isNull(members.primaryGroupId),
        inArray(members.status, ["pending", "active"]),
        ...(alumni.length > 0 ? [notInArray(members.id, alumni)] : []),
      ),
    )
    .orderBy(asc(members.createdAt));

  return rows.map((r) => ({
    member: row2member(r),
    registeredAt: r.createdAt,
  }));
}
