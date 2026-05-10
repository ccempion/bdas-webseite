import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { Role } from "@bdas/auth";

import { members, type MemberRow } from "../schema";
import type { Member, MemberStatus } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

function row2member(r: MemberRow): Member {
  return {
    id: r.id,
    userId: r.userId,
    firstName: r.firstName,
    lastName: r.lastName,
    primaryGroupId: r.primaryGroupId,
    status: r.status as MemberStatus,
    roles: r.roles as ReadonlyArray<Role>,
    joinedAt: r.joinedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function getMember(db: Db, id: string): Promise<Member | null> {
  const rows = await db.select().from(members).where(eq(members.id, id)).limit(1);
  return rows[0] ? row2member(rows[0]) : null;
}

export async function getMemberByUserId(db: Db, userId: string): Promise<Member | null> {
  const rows = await db.select().from(members).where(eq(members.userId, userId)).limit(1);
  return rows[0] ? row2member(rows[0]) : null;
}

export { row2member };
