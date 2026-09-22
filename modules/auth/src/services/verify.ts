/**
 * Email verification: marks the user as `active` and burns the token.
 * Idempotent — replaying a used token returns the same user without a re-emit.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { NotFoundError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { isFederalBoardEmail } from "@bdas/feature-flags";

import type { UserVerified } from "../events";
import { authEmailVerifications, authUsers } from "../schema";
import { createSession } from "../sessions";
import { issueToken, type Role } from "../sso";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type VerifyContext = { readonly ip: string; readonly userAgent?: string | undefined };

export type VerifyResult = {
  readonly userId: string;
  readonly email: string;
  readonly alreadyVerified: boolean;
  /** Nur bei der ersten Bestätigung: der Link ist einmalig und befristet, also
   *  darf er die Sitzung gleich mitbringen (ADR 0051). */
  readonly sessionToken: string | null;
};

export async function verifyEmail(
  db: Db,
  token: string,
  ctx?: VerifyContext,
): Promise<VerifyResult> {
  const rows = await db
    .select({
      verification: authEmailVerifications,
      user: authUsers,
    })
    .from(authEmailVerifications)
    .innerJoin(authUsers, eq(authUsers.id, authEmailVerifications.userId))
    .where(
      and(
        eq(authEmailVerifications.token, token),
        gt(authEmailVerifications.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new NotFoundError("Verifizierungslink ungültig oder abgelaufen.");
  }

  if (row.verification.usedAt) {
    return {
      userId: row.user.id,
      email: row.user.emailNormalized,
      alreadyVerified: true,
      sessionToken: null,
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(authEmailVerifications)
      .set({ usedAt: new Date() })
      .where(and(eq(authEmailVerifications.token, token), isNull(authEmailVerifications.usedAt)));
    await tx
      .update(authUsers)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(authUsers.id, row.user.id));
  });

  const event: UserVerified = {
    type: "auth.user.verified",
    userId: row.user.id,
    email: row.user.emailNormalized,
    at: new Date(),
  };
  await getEventBus().publish(event);

  const session = await createSession(db, {
    userId: row.user.id,
    ip: ctx?.ip,
    ...(ctx?.userAgent !== undefined ? { userAgent: ctx.userAgent } : {}),
  });
  const roles: Role[] = isFederalBoardEmail(row.user.emailNormalized) ? ["federal_board"] : [];
  const sessionToken = await issueToken({
    userId: row.user.id,
    email: row.user.emailNormalized,
    roles,
    sessionId: session.id,
  });

  return {
    userId: row.user.id,
    email: row.user.emailNormalized,
    alreadyVerified: false,
    sessionToken,
  };
}
