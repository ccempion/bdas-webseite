/**
 * Email verification: marks the user as `active` and burns the token.
 * Idempotent — replaying a used token returns the same user without a re-emit.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { NotFoundError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { UserVerified } from "../events.js";
import { authEmailVerifications, authUsers } from "../schema.js";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type VerifyResult = {
  readonly userId: string;
  readonly email: string;
  readonly alreadyVerified: boolean;
};

export async function verifyEmail(db: Db, token: string): Promise<VerifyResult> {
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

  return {
    userId: row.user.id,
    email: row.user.emailNormalized,
    alreadyVerified: false,
  };
}
