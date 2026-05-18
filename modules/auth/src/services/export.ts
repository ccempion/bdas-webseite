/**
 * GDPR self-service export — the authenticated user's own `auth_users` row
 * (ADR 0008). Scoped to a single user id; callers pass the id of the
 * authenticated principal only. The `auth` module owns `auth_users`, so the
 * read lives here and is exposed as a typed service (CLAUDE.md §1 r1).
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { authUsers } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type UserExport = {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly consentAt: Date | null;
  readonly consentVersion: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export async function getUserExport(db: Db, userId: string): Promise<UserExport | null> {
  const rows = await db
    .select({
      id: authUsers.id,
      email: authUsers.emailDisplay,
      status: authUsers.status,
      consentAt: authUsers.consentAt,
      consentVersion: authUsers.consentVersion,
      createdAt: authUsers.createdAt,
      updatedAt: authUsers.updatedAt,
    })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  return rows[0] ?? null;
}
