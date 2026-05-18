/**
 * Register flow:
 *   1. Validate input (zod).
 *   2. Rate-limit by IP.
 *   3. Insert user row + credentials in a transaction.
 *   4. Mint email-verification token (24 h).
 *   5. Emit AuthEvent: user.registered.
 *   6. Caller sends the verification email via the Notifier.
 *
 * Returns the verifyUrl so the caller (Server Action) can hand it to the
 * Notifier without the service needing a Notifier dependency itself.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { ConflictError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { UserRegistered } from "../events";
import { hashPassword, passwordSchema, PASSWORD_ALGORITHM } from "../password";
import { rateLimit } from "../rate-limit";
import { authCredentials, authEmailVerifications, authUsers } from "../schema";
import { randomToken } from "../tokens";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const RegisterInput = z.object({
  email: z.string().email().max(254),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export type RegisterResult = {
  readonly userId: string;
  readonly verifyToken: string;
};

export async function register(
  db: Db,
  input: unknown,
  ctx: { readonly ip: string; readonly publicSiteUrl: string },
): Promise<RegisterResult> {
  const parsed = RegisterInput.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Eingabe ungültig", {
      fields: flattenZodErrors(parsed.error),
    });
  }
  const { email, password } = parsed.data;
  const emailNormalized = email.trim().toLowerCase();

  await rateLimit(db, {
    key: `register:ip:${ctx.ip}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

  const existing = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.emailNormalized, emailNormalized))
    .limit(1);
  if (existing.length > 0) {
    throw new ConflictError("Diese E-Mail-Adresse ist bereits registriert.");
  }

  const userId = createId("usr");
  const hashed = await hashPassword(password);
  const verifyToken = randomToken();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

  await db.transaction(async (tx) => {
    await tx.insert(authUsers).values({
      id: userId,
      emailNormalized,
      emailDisplay: email.trim(),
      status: "unverified",
    });
    await tx.insert(authCredentials).values({
      userId,
      hashedPassword: hashed,
      algorithm: PASSWORD_ALGORITHM,
    });
    await tx.insert(authEmailVerifications).values({
      token: verifyToken,
      userId,
      expiresAt,
    });
  });

  const event: UserRegistered = {
    type: "auth.user.registered",
    userId,
    email: emailNormalized,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return { userId, verifyToken };
}

export function buildVerifyUrl(publicSiteUrl: string, token: string): string {
  return `${publicSiteUrl.replace(/\/$/, "")}/verifizieren/${encodeURIComponent(token)}`;
}

function flattenZodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
