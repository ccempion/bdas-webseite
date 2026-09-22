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
import { hashToken } from "../tokens";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type VerifyContext = {
  readonly ip: string;
  readonly userAgent?: string | undefined;
  /**
   * Der Token, den der einlösende Browser bei der Registrierung bekommen hat.
   * Nur wenn er zum Link passt, bringt die Bestätigung eine Sitzung mit: sonst
   * könnte jemand seinen eigenen Link verschicken und fremde Leute in seinem
   * Konto arbeiten lassen (ADR 0051).
   */
  readonly browserToken?: string | undefined;
};

export type VerifyResult = {
  readonly userId: string;
  readonly email: string;
  readonly alreadyVerified: boolean;
  /** Nur bei der ersten Bestätigung und nur im Browser, der die Registrierung
   *  begonnen hat: dort ist der Link einmalig, befristet und nachweisbar
   *  derselbe, darf also die Sitzung gleich mitbringen (ADR 0051). */
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
        eq(authEmailVerifications.tokenHash, hashToken(token)),
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
      .where(
        and(
          eq(authEmailVerifications.tokenHash, hashToken(token)),
          isNull(authEmailVerifications.usedAt),
        ),
      );
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

  const sessionToken =
    ctx !== undefined && ctx.browserToken === token ? await mintSession(db, row.user, ctx) : null;

  return {
    userId: row.user.id,
    email: row.user.emailNormalized,
    alreadyVerified: false,
    sessionToken,
  };
}

/** Sitzung für den bestätigten Nutzer, mit denselben Rollen wie beim Anmelden. */
async function mintSession(
  db: Db,
  user: { id: string; emailNormalized: string },
  ctx: VerifyContext,
): Promise<string> {
  const session = await createSession(db, {
    userId: user.id,
    ip: ctx.ip,
    ...(ctx.userAgent !== undefined ? { userAgent: ctx.userAgent } : {}),
  });
  const roles: Role[] = isFederalBoardEmail(user.emailNormalized) ? ["federal_board"] : [];
  return issueToken({
    userId: user.id,
    email: user.emailNormalized,
    roles,
    sessionId: session.id,
  });
}
