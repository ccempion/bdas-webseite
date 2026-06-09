import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { authEmailVerifications, authUsers } from "../schema";
import { randomToken } from "../tokens";
import { VERIFICATION_TTL_MS } from "./register";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type ResendResult = {
  readonly verifyToken: string;
};

export async function resendVerification(
  db: Db,
  email: string,
): Promise<ResendResult | null> {
  const emailNormalized = email.trim().toLowerCase();

  const rows = await db
    .select({ id: authUsers.id, status: authUsers.status })
    .from(authUsers)
    .where(eq(authUsers.emailNormalized, emailNormalized))
    .limit(1);

  const user = rows[0];
  if (!user || user.status !== "unverified") return null;

  // Remove old unused tokens before issuing a fresh one.
  await db
    .delete(authEmailVerifications)
    .where(
      and(
        eq(authEmailVerifications.userId, user.id),
        isNull(authEmailVerifications.usedAt),
      ),
    );

  const verifyToken = randomToken();
  await db.insert(authEmailVerifications).values({
    token: verifyToken,
    userId: user.id,
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });

  return { verifyToken };
}
