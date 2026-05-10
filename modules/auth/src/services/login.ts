/**
 * Login flow:
 *   1. Validate input.
 *   2. Rate-limit per IP and per email.
 *   3. Look up user; require status='active' (verified).
 *   4. Verify password (constant-time via argon2).
 *   5. Create a session row; mint the JWT cookie.
 *   6. Emit AuthEvent: user.logged_in.
 *
 * Returns the JWT plus session metadata. The caller (Server Action) is
 * responsible for setting the cookie via `next/headers.cookies()`.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { UnauthorizedError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { isFederalBoardEmail } from "@bdas/feature-flags";

import type { UserLoggedIn } from "../events.js";
import { verifyPassword } from "../password.js";
import { rateLimit } from "../rate-limit.js";
import { authCredentials, authUsers } from "../schema.js";
import { createSession } from "../sessions.js";
import { COOKIE_MAX_AGE_SECONDS, issueToken, type Role } from "../sso.js";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const LoginInput = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof LoginInput>;

export type LoginResult = {
  readonly userId: string;
  readonly sessionId: string;
  readonly token: string;
  readonly maxAgeSeconds: number;
};

export type LoginContext = {
  readonly ip: string;
  readonly userAgent?: string | undefined;
};

export async function login(db: Db, input: unknown, ctx: LoginContext): Promise<LoginResult> {
  const parsed = LoginInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Eingabe ungültig");
  }
  const { email, password } = parsed.data;
  const emailNormalized = email.trim().toLowerCase();

  await rateLimit(db, {
    key: `login:ip:${ctx.ip}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  await rateLimit(db, {
    key: `login:email:${emailNormalized}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  const rows = await db
    .select({ user: authUsers, credentials: authCredentials })
    .from(authUsers)
    .innerJoin(authCredentials, eq(authCredentials.userId, authUsers.id))
    .where(eq(authUsers.emailNormalized, emailNormalized))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new UnauthorizedError("E-Mail oder Passwort ungültig.");
  }

  const ok = await verifyPassword(password, row.credentials.hashedPassword);
  if (!ok) {
    throw new UnauthorizedError("E-Mail oder Passwort ungültig.");
  }

  if (row.user.status !== "active") {
    throw new UnauthorizedError(
      "Bitte bestätige zuerst deine E-Mail-Adresse über den Link, den wir dir gesendet haben.",
    );
  }

  const session = await createSession(db, {
    userId: row.user.id,
    ip: ctx.ip,
    ...(ctx.userAgent !== undefined ? { userAgent: ctx.userAgent } : {}),
  });

  const roles: Role[] = isFederalBoardEmail(emailNormalized) ? ["federal_board"] : [];

  const token = await issueToken({
    userId: row.user.id,
    email: emailNormalized,
    roles,
    sessionId: session.id,
  });

  const event: UserLoggedIn = {
    type: "auth.user.logged_in",
    userId: row.user.id,
    sessionId: session.id,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return {
    userId: row.user.id,
    sessionId: session.id,
    token,
    maxAgeSeconds: COOKIE_MAX_AGE_SECONDS,
  };
}
