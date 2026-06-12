import { and, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { Role } from "@bdas/auth";

import { members, memberRoleGrants } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

const BOARD_ROLES = ["federal_board", "local_board_lead", "local_board"] as const;

/** An active board grant joined with the holder's name, for the roster views. */
export type RoleHolder = {
  readonly memberId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: Role;
  readonly groupId: string | null;
  readonly grantedAt: Date;
};

export async function listRoleHolders(db: Db): Promise<RoleHolder[]> {
  const rows = await db
    .select({
      memberId: memberRoleGrants.memberId,
      firstName: members.firstName,
      lastName: members.lastName,
      role: memberRoleGrants.role,
      groupId: memberRoleGrants.groupId,
      grantedAt: memberRoleGrants.grantedAt,
    })
    .from(memberRoleGrants)
    .innerJoin(members, eq(members.id, memberRoleGrants.memberId))
    .where(
      and(isNull(memberRoleGrants.revokedAt), inArray(memberRoleGrants.role, [...BOARD_ROLES])),
    )
    .orderBy(memberRoleGrants.role, members.lastName);
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

/** One grant or revoke in the audit trail (revokedAt null = still active). */
export type GrantAuditEntry = RoleHolder & {
  readonly grantedBy: string;
  readonly revokedAt: Date | null;
};

export async function listGrantAudit(
  db: Db,
  q: { readonly groupId?: string; readonly limit?: number } = {},
): Promise<GrantAuditEntry[]> {
  const conds: SQL[] = [inArray(memberRoleGrants.role, [...BOARD_ROLES])];
  if (q.groupId) conds.push(eq(memberRoleGrants.groupId, q.groupId));
  const rows = await db
    .select({
      memberId: memberRoleGrants.memberId,
      firstName: members.firstName,
      lastName: members.lastName,
      role: memberRoleGrants.role,
      groupId: memberRoleGrants.groupId,
      grantedAt: memberRoleGrants.grantedAt,
      grantedBy: memberRoleGrants.grantedBy,
      revokedAt: memberRoleGrants.revokedAt,
    })
    .from(memberRoleGrants)
    .innerJoin(members, eq(members.id, memberRoleGrants.memberId))
    .where(and(...conds))
    .orderBy(desc(memberRoleGrants.grantedAt))
    .limit(q.limit ?? 100);
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}
