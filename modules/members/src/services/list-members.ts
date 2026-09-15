import { and, asc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { members, memberRoleGrants } from "../schema";
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

/**
 * `groupId` filtert über `members.primary_group_id` — gefragt ist „wer in
 * dieser Gruppe ist Alumnus", nicht „wessen Grant trägt diese Gruppe im
 * Scope": der Scope ist laut ADR 0043 eine Herkunftsangabe und bleibt beim
 * Gruppenwechsel stehen.
 */
function activeAlumnusGrants(q: { readonly groupId?: string }): SQL {
  const conds: SQL[] = [
    eq(memberRoleGrants.role, "alumnus"),
    isNull(memberRoleGrants.revokedAt) as SQL,
  ];
  if (q.groupId) conds.push(eq(members.primaryGroupId, q.groupId));
  return and(...conds) as SQL;
}

/** IDs aller Mitglieder mit aktivem `alumnus`-Grant (ADR 0043). */
export async function listAlumnusIds(
  db: Db,
  q: { readonly groupId?: string } = {},
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ memberId: memberRoleGrants.memberId })
    .from(memberRoleGrants)
    .innerJoin(members, eq(members.id, memberRoleGrants.memberId))
    .where(activeAlumnusGrants(q));
  return rows.map((r) => r.memberId);
}

/**
 * Die Scopes der aktiven `alumnus`-Grants je Mitglied. Eine Markierung lässt
 * sich nur in dem Scope entziehen, in dem sie vergeben wurde — nach einem
 * Gruppenwechsel ist das nicht mehr die heutige Gruppe.
 */
export async function listAlumnusScopes(
  db: Db,
  q: { readonly groupId?: string } = {},
): Promise<Record<string, Array<string | null>>> {
  const rows = await db
    .select({ memberId: memberRoleGrants.memberId, groupId: memberRoleGrants.groupId })
    .from(memberRoleGrants)
    .innerJoin(members, eq(members.id, memberRoleGrants.memberId))
    .where(activeAlumnusGrants(q));
  const scopes: Record<string, Array<string | null>> = {};
  for (const r of rows) (scopes[r.memberId] ??= []).push(r.groupId);
  return scopes;
}
