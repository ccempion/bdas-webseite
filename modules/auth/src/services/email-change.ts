/**
 * Self-service change of the login email.
 *
 * Two-step flow, same shape as password reset: `requestEmailChange` proves
 * the caller is signed in as themselves (current password) and mints a
 * single-use token; `confirmEmailChange` — reached only by clicking the link
 * mailed to the *new* address — is what actually flips `auth_users`. Holding
 * the old inbox is never sufficient on its own, and holding the new inbox
 * without the current password is never sufficient either.
 *
 * Confirming revokes every session, like changePassword: `federal_board` is
 * derived from the email domain (see sso.ts), so a stale JWT would carry a
 * role decision made under the old address.
 */
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { ConflictError, NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { EmailChanged as EmailChangedEvent } from "../events";
import { verifyPassword } from "../password";
import { rateLimit } from "../rate-limit";
import { authCredentials, authEmailChanges, authSessions, authUsers } from "../schema";
import { randomToken } from "../tokens";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

export const RequestEmailChangeInput = z.object({
  currentPassword: z.string().min(1, "Bitte gib dein aktuelles Passwort ein.").max(256),
  newEmail: z.string().email().max(254),
});

export type RequestEmailChangeContext = {
  readonly userId: string;
};

export type RequestEmailChangeResult = {
  readonly changeToken: string;
  readonly newEmailDisplay: string;
};

export async function requestEmailChange(
  db: Db,
  input: unknown,
  ctx: RequestEmailChangeContext,
): Promise<RequestEmailChangeResult> {
  const parsed = RequestEmailChangeInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
  }
  const { currentPassword, newEmail } = parsed.data;
  const newEmailNormalized = newEmail.trim().toLowerCase();

  // Same reasoning as changePassword: without this, the form is a password
  // oracle for anyone holding a stolen session.
  await rateLimit(db, {
    key: `email-change:user:${ctx.userId}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

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

  if (newEmailNormalized === row.emailNormalized) {
    throw new ValidationError("Das ist bereits deine aktuelle E-Mail-Adresse.");
  }

  const takenByUser = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.emailNormalized, newEmailNormalized))
    .limit(1);
  if (takenByUser.length > 0) {
    throw new ConflictError("Diese E-Mail-Adresse wird bereits verwendet.");
  }

  // Someone else's still-open pending change to the same address — reject
  // rather than let two accounts race for it.
  const pendingElsewhere = await db
    .select({ token: authEmailChanges.token })
    .from(authEmailChanges)
    .where(
      and(
        eq(authEmailChanges.newEmailNormalized, newEmailNormalized),
        isNull(authEmailChanges.usedAt),
        gt(authEmailChanges.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (pendingElsewhere.length > 0) {
    throw new ConflictError("Diese E-Mail-Adresse wird bereits verwendet.");
  }

  // Only one pending change per user at a time.
  await db
    .delete(authEmailChanges)
    .where(and(eq(authEmailChanges.userId, ctx.userId), isNull(authEmailChanges.usedAt)));

  const changeToken = randomToken();
  await db.insert(authEmailChanges).values({
    token: changeToken,
    userId: ctx.userId,
    newEmailNormalized,
    newEmailDisplay: newEmail.trim(),
    expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
  });

  return { changeToken, newEmailDisplay: newEmail.trim() };
}

export function buildEmailChangeUrl(publicSiteUrl: string, token: string): string {
  return `${publicSiteUrl.replace(/\/$/, "")}/e-mail-bestaetigen/${encodeURIComponent(token)}`;
}

export type ConfirmEmailChangeResult = {
  readonly userId: string;
  readonly oldEmail: string;
  readonly newEmail: string;
  readonly alreadyConfirmed: boolean;
};

/** Idempotent — replaying a used token returns the same result without re-emitting. */
export async function confirmEmailChange(db: Db, token: string): Promise<ConfirmEmailChangeResult> {
  const rows = await db
    .select({ change: authEmailChanges, user: authUsers })
    .from(authEmailChanges)
    .innerJoin(authUsers, eq(authUsers.id, authEmailChanges.userId))
    .where(and(eq(authEmailChanges.token, token), gt(authEmailChanges.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new NotFoundError("Bestätigungslink ungültig oder abgelaufen.");
  }

  if (row.change.usedAt) {
    return {
      userId: row.user.id,
      oldEmail: row.user.emailNormalized,
      newEmail: row.change.newEmailNormalized,
      alreadyConfirmed: true,
    };
  }

  // The address may have been claimed by another account between request
  // and confirm — re-check right before committing.
  const taken = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(
      and(
        eq(authUsers.emailNormalized, row.change.newEmailNormalized),
        ne(authUsers.id, row.user.id),
      ),
    )
    .limit(1);
  if (taken.length > 0) {
    throw new ConflictError("Diese E-Mail-Adresse wird inzwischen bereits verwendet.");
  }

  const oldEmail = row.user.emailNormalized;
  const newEmail = row.change.newEmailNormalized;

  await db.transaction(async (tx) => {
    await tx
      .update(authUsers)
      .set({
        emailNormalized: newEmail,
        emailDisplay: row.change.newEmailDisplay,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, row.user.id));
    await tx
      .update(authEmailChanges)
      .set({ usedAt: new Date() })
      .where(and(eq(authEmailChanges.token, token), isNull(authEmailChanges.usedAt)));
    await tx
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.userId, row.user.id), isNull(authSessions.revokedAt)));
  });

  const event: EmailChangedEvent = {
    type: "auth.email.changed",
    userId: row.user.id,
    oldEmail,
    newEmail,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return { userId: row.user.id, oldEmail, newEmail, alreadyConfirmed: false };
}
