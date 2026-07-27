/**
 * The groupless pool (ADR 0031): everyone in good standing who currently
 * belongs to no group — applicants who were never accepted anywhere, and
 * members between groups. `inactive` and `alumnus` are excluded; they are not
 * looking for a group.
 *
 * Federal-board only. A local board gets an empty list rather than an error:
 * the pool is federation-wide oversight, and a group's own queue is the surface
 * a local board acts on.
 */
import { and, asc, inArray, isNull } from "drizzle-orm";

import { isFederalBoard } from "../roles";
import { members } from "../schema";
import type { Member } from "../types";

import { row2member } from "./get";
import type { Actor, Db } from "./status";

export type GrouplessMember = {
  readonly member: Member;
  /** When they entered the pool. Signup for an applicant; today's proxy is the row's last change. */
  readonly waitingSince: Date;
};

export async function listGrouplessMembers(db: Db, actor: Actor): Promise<GrouplessMember[]> {
  if (!isFederalBoard(actor.grants)) return [];

  const rows = await db
    .select()
    .from(members)
    .where(
      and(isNull(members.primaryGroupId), inArray(members.status, ["pending", "active"])),
    )
    .orderBy(asc(members.createdAt));

  return rows.map((r) => ({
    member: row2member(r),
    waitingSince: r.createdAt,
  }));
}
