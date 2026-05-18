/**
 * Password reset:
 *   - request(email) → if the user exists, mint a single-use token (1 h) and
 *     return its URL. If the user doesn't exist, returns null but the caller
 *     SHOULD NOT reveal that to the requester (avoids account enumeration).
 *   - complete(token, newPassword) → rotate the password hash, burn the
 *     token, and revoke all sessions for that user.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { PasswordReset as PasswordResetEvent } from "../events";
import { hashPassword, passwordSchema, PASSWORD_ALGORITHM } from "../password";
import { rateLimit } from "../rate-limit";
import { authCredentials, authPasswordResets, authSessions, authUsers } from "../schema";
import { randomToken } from "../tokens";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const RESET_TTL_MS = 60 * 60 * 1000;

export const ResetRequestInput = z.object({ email: z.string().email().max(254) });
export const ResetCompleteInput = z.object({
  token: z.string().min(10).max(256),
  password: passwordSchema,
});

export type ResetRequestResult = { readonly resetToken: string } | null;

export async function requestPasswordReset(
  db: Db,
  input: unknown,
  ctx: { readonly ip: string },
): Promise<ResetRequestResult> {
  const parsed = ResetRequestInput.safeParse(input);
  if (!parsed.success) throw new ValidationError("Eingabe ungültig");
  const emailNormalized = parsed.data.email.trim().toLowerCase();

  await rateLimit(db, {
    key: `reset-request:ip:${ctx.ip}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

  const rows = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.emailNormalized, emailNormalized))
    .limit(1);

  if (!rows[0]) return null;

  const token = randomToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.insert(authPasswordResets).values({
    token,
    userId: rows[0].id,
    expiresAt,
  });

  return { resetToken: token };
}

export function buildResetUrl(publicSiteUrl: string, token: string): string {
  return `${publicSiteUrl.replace(/\/$/, "")}/passwort-zuruecksetzen/${encodeURIComponent(token)}`;
}

export type ResetCompleteResult = { readonly userId: string };

export async function completePasswordReset(db: Db, input: unknown): Promise<ResetCompleteResult> {
  const parsed = ResetCompleteInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Passwort entspricht nicht den Anforderungen.");
  }
  const { token, password } = parsed.data;

  const rows = await db
    .select({ reset: authPasswordResets })
    .from(authPasswordResets)
    .where(
      and(
        eq(authPasswordResets.token, token),
        gt(authPasswordResets.expiresAt, new Date()),
        isNull(authPasswordResets.usedAt),
      ),
    )
    .limit(1);

  const reset = rows[0]?.reset;
  if (!reset) {
    throw new NotFoundError("Zurücksetzungslink ungültig oder abgelaufen.");
  }

  const newHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx
      .update(authCredentials)
      .set({
        hashedPassword: newHash,
        algorithm: PASSWORD_ALGORITHM,
        updatedAt: new Date(),
      })
      .where(eq(authCredentials.userId, reset.userId));
    await tx
      .update(authPasswordResets)
      .set({ usedAt: new Date() })
      .where(eq(authPasswordResets.token, token));
    await tx
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.userId, reset.userId), isNull(authSessions.revokedAt)));
  });

  const event: PasswordResetEvent = {
    type: "auth.password.reset",
    userId: reset.userId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return { userId: reset.userId };
}
