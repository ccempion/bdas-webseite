/**
 * Art. 15 — this module's slice of a user's data export: their member row,
 * every role grant they ever held (revoked ones too — the row is still their
 * data), and their group-change requests. Keyed by the auth `userId`; the
 * member id is resolved here, inside the module that owns `members`.
 *
 * `granted_by`/`revoked_by`/`decided_by` are deliberately omitted: they are
 * other people's member ids and not data *about* the exporting user.
 */
import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { memberGroupChangeRequests, memberRoleGrants, members } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type MemberExport = {
  readonly member: {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly primaryGroupId: string | null;
    readonly status: string;
    readonly joinedAt: Date | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  } | null;
  readonly roleGrants: ReadonlyArray<{
    readonly role: string;
    readonly groupId: string | null;
    readonly grantedAt: Date;
    readonly revokedAt: Date | null;
  }>;
  readonly groupChangeRequests: ReadonlyArray<{
    readonly id: string;
    readonly fromGroupId: string | null;
    readonly toGroupId: string | null;
    readonly status: string;
    readonly requestedAt: Date;
    readonly decidedAt: Date | null;
    readonly reasonCategory: string | null;
    readonly reasonMessage: string | null;
  }>;
};

export async function exportForUser(db: Db, userId: string): Promise<MemberExport> {
  const [row] = await db.select().from(members).where(eq(members.userId, userId)).limit(1);
  if (!row) return { member: null, roleGrants: [], groupChangeRequests: [] };

  const roleGrants = await db
    .select({
      role: memberRoleGrants.role,
      groupId: memberRoleGrants.groupId,
      grantedAt: memberRoleGrants.grantedAt,
      revokedAt: memberRoleGrants.revokedAt,
    })
    .from(memberRoleGrants)
    .where(eq(memberRoleGrants.memberId, row.id))
    .orderBy(asc(memberRoleGrants.grantedAt));

  const groupChangeRequests = await db
    .select({
      id: memberGroupChangeRequests.id,
      fromGroupId: memberGroupChangeRequests.fromGroupId,
      toGroupId: memberGroupChangeRequests.toGroupId,
      status: memberGroupChangeRequests.status,
      requestedAt: memberGroupChangeRequests.requestedAt,
      decidedAt: memberGroupChangeRequests.decidedAt,
      reasonCategory: memberGroupChangeRequests.reasonCategory,
      reasonMessage: memberGroupChangeRequests.reasonMessage,
    })
    .from(memberGroupChangeRequests)
    .where(eq(memberGroupChangeRequests.memberId, row.id))
    .orderBy(asc(memberGroupChangeRequests.requestedAt));

  return {
    member: {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      primaryGroupId: row.primaryGroupId,
      status: row.status,
      joinedAt: row.joinedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    roleGrants,
    groupChangeRequests,
  };
}
