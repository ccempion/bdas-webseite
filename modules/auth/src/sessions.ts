/**
 * Server-side session rows. The session id (`ses_<nanoid>`) is also the
 * JWT `jti` claim — the cookie is the JWT, the row is the revocation handle.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { createId } from "@bdas/id";

import { authSessions, authUsers } from "./schema";
import type { AuthSession, AuthUser } from "./schema";
import { COOKIE_MAX_AGE_SECONDS } from "./sso";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type CreateSessionArgs = {
  readonly userId: string;
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
};

export async function createSession(db: Db, args: CreateSessionArgs): Promise<AuthSession> {
  const id = createId("ses");
  const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE_SECONDS * 1000);
  const [row] = await db
    .insert(authSessions)
    .values({
      id,
      userId: args.userId,
      expiresAt,
      ip: args.ip ?? null,
      userAgent: args.userAgent ?? null,
    })
    .returning();
  if (!row) throw new Error("createSession: insert returned no row");
  return row;
}

/**
 * Look up an active session by id. Returns the user + session if the row
 * exists, is not revoked, and has not expired; otherwise null. Callers
 * should treat null as "anonymous".
 */
export async function getSession(
  db: Db,
  sessionId: string,
): Promise<{ user: AuthUser; session: AuthSession } | null> {
  const rows = await db
    .select({ user: authUsers, session: authSessions })
    .from(authSessions)
    .innerJoin(authUsers, eq(authUsers.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.id, sessionId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
}
