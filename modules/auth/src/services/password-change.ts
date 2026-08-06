/**
 * Changing the password while signed in.
 *
 * Unlike the reset flow, the proof is the current password rather than an
 * emailed token — and the session that made the change survives it, while
 * every other session for that user does not. A stolen cookie does not
 * outlive the change; the device you changed from does.
 */
import { and, eq, isNull, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { PasswordChanged as PasswordChangedEvent } from "../events";
import { hashPassword, passwordSchema, verifyPassword, PASSWORD_ALGORITHM } from "../password";
import { rateLimit } from "../rate-limit";
import { authCredentials, authSessions } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1, "Bitte gib dein aktuelles Passwort ein.").max(256),
  newPassword: passwordSchema,
});

export type ChangePasswordContext = {
  readonly userId: string;
  /** The session the change was made from — the one session that survives it. */
  readonly sessionId: string;
  readonly ip: string;
};

export type ChangePasswordResult = { readonly userId: string };

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

  // No join to auth_users: the caller resolved the user through
  // getCurrentUser before calling, so it already holds the email address
  // the notification goes to. Reading it again here would be a second
  // query to hand back something the caller never let go of.
  const rows = await db
    .select({ hashedPassword: authCredentials.hashedPassword })
    .from(authCredentials)
    .where(eq(authCredentials.userId, ctx.userId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new NotFoundError("Konto nicht gefunden.");

  if (!(await verifyPassword(currentPassword, row.hashedPassword))) {
    throw new ValidationError("Aktuelles Passwort ist falsch.");
  }

  // A no-op submit would otherwise sign the user out of every other device
  // and mail them about a change that never happened.
  if (currentPassword === newPassword) {
    throw new ValidationError("Das neue Passwort muss sich vom aktuellen unterscheiden.");
  }

  const newHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
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
      .where(
        and(
          eq(authSessions.userId, ctx.userId),
          isNull(authSessions.revokedAt),
          ne(authSessions.id, ctx.sessionId),
        ),
      );
  });

  const event: PasswordChangedEvent = {
    type: "auth.password.changed",
    userId: ctx.userId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return { userId: ctx.userId };
}
