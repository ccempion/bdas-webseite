/**
 * Self-service account deletion (DSGVO Art. 17): locks the account, revokes
 * all sessions, and schedules a hard purge 30 days out. The purge itself is
 * a later PR's account-deletion-sweep.ts — this file only covers triggering
 * and cancelling the 30-day window.
 *
 * `displayName` is supplied by the caller rather than looked up here: auth
 * doesn't own it (members/profile do, per CLAUDE.md §1 rule 1), and the
 * post-purge confirmation email needs a name snapshot that survives the
 * eventual hard delete of auth_users.
 */
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ConflictError, NotFoundError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { AccountDeletionCancelled, AccountDeletionRequested } from "../events";
import { accountDeletionRequests, authUsers, type AccountDeletionRequest } from "../schema";
import { revokeAllSessionsForUser } from "../sessions";
import { randomToken } from "../tokens";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const ACCOUNT_DELETION_GRACE_DAYS = 30;
const GRACE_MS = ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;

export type RequestAccountDeletionInput = {
  readonly userId: string;
  readonly displayName: string;
};

export type RequestAccountDeletionResult = {
  readonly requestId: string;
  readonly scheduledPurgeAt: Date;
  readonly reactivationToken: string;
};

export async function requestAccountDeletion(
  db: Db,
  input: RequestAccountDeletionInput,
): Promise<RequestAccountDeletionResult> {
  const [user] = await db
    .select({ id: authUsers.id, email: authUsers.emailNormalized })
    .from(authUsers)
    .where(eq(authUsers.id, input.userId))
    .limit(1);
  if (!user) throw new NotFoundError("Konto nicht gefunden.");

  const [existing] = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, input.userId),
        eq(accountDeletionRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) {
    throw new ConflictError("Für dieses Konto ist bereits eine Löschung angefragt.");
  }

  const now = new Date();
  const scheduledPurgeAt = new Date(now.getTime() + GRACE_MS);
  const requestId = createId("adr");
  const reactivationToken = randomToken();

  await db.transaction(async (tx) => {
    await tx.insert(accountDeletionRequests).values({
      id: requestId,
      userId: input.userId,
      emailSnapshot: user.email,
      nameSnapshot: input.displayName,
      requestedAt: now,
      scheduledPurgeAt,
      status: "pending",
      reactivationToken,
      reactivationExpiresAt: scheduledPurgeAt,
    });
    await tx
      .update(authUsers)
      .set({ status: "pending_deletion", updatedAt: now })
      .where(eq(authUsers.id, input.userId));
  });

  await revokeAllSessionsForUser(db, input.userId);

  const event: AccountDeletionRequested = {
    type: "auth.account_deletion.requested",
    userId: input.userId,
    requestId,
    scheduledPurgeAt,
    at: now,
  };
  await getEventBus().publish(event);

  return { requestId, scheduledPurgeAt, reactivationToken };
}

export async function cancelAccountDeletion(
  db: Db,
  token: string,
): Promise<{ readonly userId: string }> {
  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.reactivationToken, token),
        eq(accountDeletionRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (!row || !row.userId) {
    throw new NotFoundError("Reaktivierungslink ungültig oder bereits verwendet.");
  }
  if (!row.reactivationExpiresAt || row.reactivationExpiresAt < new Date()) {
    throw new NotFoundError("Reaktivierungslink ist abgelaufen.");
  }

  const now = new Date();
  const userId = row.userId;
  await db.transaction(async (tx) => {
    await tx
      .update(accountDeletionRequests)
      .set({ status: "cancelled", cancelledAt: now, reactivationToken: null })
      .where(eq(accountDeletionRequests.id, row.id));
    await tx
      .update(authUsers)
      .set({ status: "active", updatedAt: now })
      .where(eq(authUsers.id, userId));
  });

  const event: AccountDeletionCancelled = {
    type: "auth.account_deletion.cancelled",
    userId,
    requestId: row.id,
    at: now,
  };
  await getEventBus().publish(event);

  return { userId };
}

export async function getDeletionRequestForUser(
  db: Db,
  userId: string,
): Promise<AccountDeletionRequest | null> {
  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, userId),
        eq(accountDeletionRequests.status, "pending"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export function buildReactivationUrl(publicSiteUrl: string, token: string): string {
  return `${publicSiteUrl.replace(/\/$/, "")}/konto-reaktivieren/${encodeURIComponent(token)}`;
}
