/**
 * The hard purge behind self-service deletion (DSGVO Art. 17): picks up due
 * requests and erases the account module by module, then sends e-mail C.
 *
 * Runs on overlapping cron ticks, so every request is claimed with a lease
 * and every finished step is recorded in `account_deletion_steps`; a retried
 * run resumes after the last recorded step instead of repeating it.
 *
 * The module steps and the mail are injected: files, blog, events and
 * notifications depend on auth, so importing them here would be a cycle
 * (CLAUDE.md §1 rules 2/3). The composition root supplies them in order.
 */
import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { createId } from "@bdas/id";

import {
  accountDeletionRequests,
  accountDeletionSteps,
  authUsers,
  type AccountDeletionRequest,
} from "../schema";
import { deleteAccount } from "./delete-account";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type DeletionStep = {
  readonly name: string;
  readonly run: (db: Db, userId: string) => Promise<void>;
};

export type CompletionMail = {
  send(to: { email: string; name: string }): Promise<"sent" | "failed">;
};

export type SweepDeps = {
  readonly steps: readonly DeletionStep[];
  readonly completionMail: CompletionMail;
  readonly now?: () => Date;
  readonly batchSize?: number;
};

export type SweepResult = {
  readonly processed: number;
  readonly completed: number;
  readonly failed: readonly { requestId: string; step: string }[];
};

// Longer than any single run can live (the cron route's maxDuration is 300s),
// so a live lease always belongs to a run that is still executing.
const LEASE_MS = 15 * 60 * 1000;
const MAIL_GIVE_UP_MS = 7 * 24 * 60 * 60 * 1000;
const RESERVED = new Set(["auth", "email_c"]);
const LAST_ERROR_MAX = 500;

export async function runAccountDeletionSweep(db: Db, deps: SweepDeps): Promise<SweepResult> {
  for (const s of deps.steps) {
    if (RESERVED.has(s.name)) throw new Error(`reserved step name: ${s.name}`);
  }
  const now = (deps.now ?? (() => new Date()))();

  const due = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(claimable(now))
    // Requests that already failed go last, so a few permanently stuck rows
    // cannot fill every batch and starve fresh ones.
    .orderBy(
      sql`${accountDeletionRequests.lastError} is not null`,
      asc(accountDeletionRequests.scheduledPurgeAt),
    )
    .limit(deps.batchSize ?? 5);

  const result = {
    processed: 0,
    completed: 0,
    failed: [] as { requestId: string; step: string }[],
  };
  for (const { id } of due) {
    const lease = new Date(now.getTime() + LEASE_MS);
    const req = await claim(db, id, now, lease);
    if (!req) continue;
    result.processed++;
    const progress = { step: "guard" };
    try {
      await processRequest(db, req, deps, now, progress);
      result.completed++;
    } catch (err) {
      await release(db, id, lease, redact(`${progress.step}: ${messageOf(err)}`, req));
      result.failed.push({ requestId: id, step: progress.step });
    }
  }
  return result;
}

function claimable(now: Date) {
  return and(
    or(
      and(
        eq(accountDeletionRequests.status, "pending"),
        lte(accountDeletionRequests.scheduledPurgeAt, now),
      ),
      eq(accountDeletionRequests.status, "in_progress"),
    ),
    or(isNull(accountDeletionRequests.claimedUntil), lt(accountDeletionRequests.claimedUntil, now)),
  );
}

/**
 * One UPDATE, so the row lock serialises it against a concurrent sweep and
 * against `cancelAccountDeletion` (which only moves `pending` rows): whoever
 * commits second re-evaluates the WHERE on the new row version and matches
 * nothing.
 */
async function claim(
  db: Db,
  id: string,
  now: Date,
  lease: Date,
): Promise<AccountDeletionRequest | null> {
  const [row] = await db
    .update(accountDeletionRequests)
    .set({ status: "in_progress", claimedUntil: lease })
    .where(and(eq(accountDeletionRequests.id, id), claimable(now)))
    .returning();
  return row ?? null;
}

async function release(db: Db, id: string, lease: Date, lastError: string): Promise<void> {
  // Scoped to our own lease: if it expired and another run re-claimed the
  // request, clearing claimed_until would let a third run in alongside it.
  await db
    .update(accountDeletionRequests)
    .set({ claimedUntil: null, lastError })
    .where(
      and(
        eq(accountDeletionRequests.id, id),
        eq(accountDeletionRequests.status, "in_progress"),
        eq(accountDeletionRequests.claimedUntil, lease),
      ),
    );
}

async function processRequest(
  db: Db,
  req: AccountDeletionRequest,
  deps: SweepDeps,
  now: Date,
  progress: { step: string },
): Promise<void> {
  const doneRows = await db
    .select({ name: accountDeletionSteps.moduleName })
    .from(accountDeletionSteps)
    .where(eq(accountDeletionSteps.requestId, req.id));
  const done = new Set(doneRows.map((r) => r.name));

  let userId: string | null = null;
  if (req.userId) {
    const [user] = await db
      .select({ status: authUsers.status })
      .from(authUsers)
      .where(eq(authUsers.id, req.userId));
    if (user) {
      if (user.status !== "pending_deletion") {
        throw new Error("account is not pending deletion");
      }
      userId = req.userId;
    }
  }
  // Without a user the module steps cannot run any more (they need its id),
  // so the account may only be finished if all of them already did.
  if (!userId && deps.steps.some((s) => !done.has(s.name))) {
    throw new Error("account is gone but module steps are unrecorded");
  }

  for (const step of deps.steps) {
    if (done.has(step.name)) continue;
    progress.step = step.name;
    await step.run(db, userId!);
    await markStep(db, req.id, step.name);
  }

  if (!done.has("auth")) {
    progress.step = "auth";
    // A missing user here means a previous run crashed between deleting it
    // and recording the marker; deleting again would find nothing anyway.
    if (userId) await deleteAccount(db, userId);
    await markStep(db, req.id, "auth");
  }

  progress.step = "email_c";
  const gaveUp = now.getTime() - req.scheduledPurgeAt.getTime() > MAIL_GIVE_UP_MS;
  if (req.emailSnapshot && !gaveUp) {
    const outcome = await deps.completionMail.send({
      email: req.emailSnapshot,
      name: req.nameSnapshot ?? "",
    });
    if (outcome === "failed") throw new Error("completion mail was not sent");
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(accountDeletionSteps)
      .values({ id: createId("ads"), requestId: req.id, moduleName: "email_c" })
      .onConflictDoNothing();
    await tx
      .update(accountDeletionRequests)
      .set({
        status: "completed",
        completedAt: now,
        emailSnapshot: null,
        nameSnapshot: null,
        claimedUntil: null,
        lastError: null,
      })
      .where(
        and(
          eq(accountDeletionRequests.id, req.id),
          eq(accountDeletionRequests.status, "in_progress"),
        ),
      );
  });
}

async function markStep(db: Db, requestId: string, moduleName: string): Promise<void> {
  await db
    .insert(accountDeletionSteps)
    .values({ id: createId("ads"), requestId, moduleName })
    .onConflictDoNothing();
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function redact(message: string, req: AccountDeletionRequest): string {
  let out = message;
  for (const pii of [req.emailSnapshot, req.nameSnapshot]) {
    if (!pii) continue;
    out = out.replace(new RegExp(pii.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[redacted]");
  }
  return out.slice(0, LAST_ERROR_MAX);
}
