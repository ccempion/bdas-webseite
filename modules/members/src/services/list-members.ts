import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { members } from "../schema";
import type { Member, MemberStatus } from "../types";

import { row2member } from "./get";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Read-side member query for the dashboard. Owned by `members` (NOT importing
 * dashboard-shell's Scope — that would create a cycle). Federation-wide when
 * `groupId` is omitted; group-scoped when set. `search` matches first/last name
 * case-insensitively. Authorization is the caller's responsibility (the board
 * route-group layouts already gate by scope before this runs).
 */
export type MemberQuery = {
  readonly groupId?: string;
  readonly status?: MemberStatus;
  readonly search?: string;
};

export async function listMembers(db: Db, q: MemberQuery = {}): Promise<Member[]> {
  const conds: SQL[] = [];
  if (q.groupId) conds.push(eq(members.primaryGroupId, q.groupId));
  if (q.status) conds.push(eq(members.status, q.status));
  if (q.search && q.search.trim() !== "") {
    const pat = `%${q.search.trim()}%`;
    conds.push(or(ilike(members.firstName, pat), ilike(members.lastName, pat)) as SQL);
  }
  const rows = await db
    .select()
    .from(members)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(members.lastName), asc(members.firstName));
  return rows.map(row2member);
}
