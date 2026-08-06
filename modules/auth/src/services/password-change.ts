/**
 * Changing the password while signed in.
 *
 * Unlike the reset flow, the proof is the current password rather than an
 * emailed token. Every session for the user is revoked — including the one
 * that made the change — and a fresh session is minted for the caller. The
 * cookie *is* the session, so a copy of it carries the same `jti` as the
 * browser it was stolen from; sparing "the calling session" would have spared
 * the copy too. Revoking all of them and handing the caller a new cookie is
 * what keeps the change meaningful while leaving the user signed in.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { isFederalBoardEmail } from "@bdas/feature-flags";

import type { PasswordChanged as PasswordChangedEvent } from "../events";
import { hashPassword, passwordSchema, verifyPassword, PASSWORD_ALGORITHM } from "../password";
import { rateLimit } from "../rate-limit";
import { authCredentials, authSessions, authUsers } from "../schema";
import { createSession } from "../sessions";
import { COOKIE_MAX_AGE_SECONDS, issueToken, type Role } from "../sso";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1, "Bitte gib dein aktuelles Passwort ein.").max(256),
  newPassword: passwordSchema,
});

export type ChangePasswordContext = {
  readonly userId: string;
};

/**
 * Mirrors `LoginResult`: the caller (a Server Action) sets the cookie from
 * `token`, because the session it arrived with has just been revoked.
 */
export type ChangePasswordResult = {
  readonly userId: string;
  readonly sessionId: string;
  readonly token: string;
  readonly maxAgeSeconds: number;
};

export async function changePassword(
  db: Db,
  input: unknown,
  ctx: ChangePasswordContext,
): Promise<ChangePasswordResult> {
  const parsed = ChangePasswordInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
  }
  const { currentPassword, newPassword } = parsed.data;

  // Without this the form is a password oracle for anyone holding a stolen
  // session: unlimited guesses at `currentPassword`, leaving no trace.
  await rateLimit(db, {
    key: `password-change:user:${ctx.userId}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

  // auth_users is joined for the email, which the replacement session's JWT
  // claims need — not to hand it back to the caller, which resolved it
  // through getCurrentUser before calling and never let go of it.
  const rows = await db
    .select({
      hashedPassword: authCredentials.hashedPassword,
      emailNormalized: authUsers.emailNormalized,
    })
    .from(authCredentials)
    .innerJoin(authUsers, eq(authUsers.id, authCredentials.userId))
    .where(eq(authCredentials.userId, ctx.userId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new NotFoundError("Konto nicht gefunden.");

  if (!(await verifyPassword(currentPassword, row.hashedPassword))) {
    throw new ValidationError("Aktuelles Passwort ist falsch.");
  }

  // A no-op submit would otherwise sign the user out of every device and mail
  // them about a change that never happened.
  if (currentPassword === newPassword) {
    throw new ValidationError("Das neue Passwort muss sich vom aktuellen unterscheiden.");
  }

  const newHash = await hashPassword(newPassword);
  // The replacement session is inserted in the same transaction as the mass
  // revoke, so there is no instant in which the user holds no valid session.
  const session = await db.transaction(async (tx) => {
    await tx
      .update(authCredentials)
      .set({
        hashedPassword: newHash,
        algorithm: PASSWORD_ALGORITHM,
        updatedAt: new Date(),
      })
      .where(eq(authCredentials.userId, ctx.userId));
    await tx
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.userId, ctx.userId), isNull(authSessions.revokedAt)));
    return createSession(tx, { userId: ctx.userId });
  });

  const roles: Role[] = isFederalBoardEmail(row.emailNormalized) ? ["federal_board"] : [];
  const token = await issueToken({
    userId: ctx.userId,
    email: row.emailNormalized,
    roles,
    sessionId: session.id,
  });

  const event: PasswordChangedEvent = {
    type: "auth.password.changed",
    userId: ctx.userId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return {
    userId: ctx.userId,
    sessionId: session.id,
    token,
    maxAgeSeconds: COOKIE_MAX_AGE_SECONDS,
  };
}
