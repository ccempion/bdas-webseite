/**
 * runAccountDeletionSweep integration test — real Postgres per CLAUDE.md §4.
 * Module steps and the completion mail are in-process fakes: they are the
 * injection seam the composition root fills with the real modules.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { NotFoundError } from "@bdas/errors";
import { getEventBus, resetEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { UserDeleted } from "../events";
import { accountDeletionRequests, accountDeletionSteps, authUsers } from "../schema";
import { cancelAccountDeletion, requestAccountDeletion } from "./account-deletion-request";
import {
  runAccountDeletionSweep,
  type CompletionMail,
  type DeletionStep,
} from "./account-deletion-sweep";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

async function dbReachable(): Promise<boolean> {
  const url = process.env["DATABASE_URL"] ?? DEFAULT_URL;
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 2 });
  try {
    await sql`select 1`;
    await sql.end();
    return true;
  } catch {
    try {
      await sql.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-01T12:00:00Z");
const MODULE_STEPS = ["files", "blog", "events", "notifications"] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Calls = { name: string; userId: string }[];

function fakeSteps(
  calls: Calls,
  opts: { throwIn?: Record<string, () => Error>; delayMs?: number } = {},
): DeletionStep[] {
  return MODULE_STEPS.map((name) => ({
    name,
    run: async (_db, userId) => {
      if (opts.delayMs) await sleep(opts.delayMs);
      const make = opts.throwIn?.[name];
      if (make) throw make();
      calls.push({ name, userId });
    },
  }));
}

function fakeMail(results: ("sent" | "failed")[] = []) {
  const sent: { email: string; name: string }[] = [];
  const mail: CompletionMail = {
    async send(to) {
      sent.push(to);
      return results.shift() ?? "sent";
    },
  };
  return { mail, sent };
}

describeIfDb("runAccountDeletionSweep", () => {
  let t: TestDb;
  let deletedEvents: UserDeleted[];

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      "0001_init.sql",
      "0002_consent.sql",
      "0003_email_change.sql",
      "0004_account_deletion.sql",
      "0005_verification_token_hash.sql",
      "0006_deletion_orchestrator.sql",
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
    deletedEvents = [];
    getEventBus().subscribe<UserDeleted>("auth.user.deleted", async (e) => {
      deletedEvents.push(e);
    });
  });

  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  async function seedUser(status = "pending_deletion"): Promise<{ id: string; email: string }> {
    const id = createId("usr");
    const email = `${id.toLowerCase()}@example.de`;
    await t.db
      .insert(authUsers)
      .values({ id, emailNormalized: email, emailDisplay: email, status });
    return { id, email };
  }

  async function seedRequest(opts: {
    userId: string | null;
    dueAt: Date;
    status?: string;
    claimedUntil?: Date | null;
    email?: string | null;
    name?: string | null;
  }): Promise<string> {
    const id = createId("adr");
    await t.db.insert(accountDeletionRequests).values({
      id,
      userId: opts.userId,
      emailSnapshot: opts.email === undefined ? "snap@example.de" : opts.email,
      nameSnapshot: opts.name === undefined ? "Snap Shot" : opts.name,
      requestedAt: new Date(opts.dueAt.getTime() - 30 * DAY_MS),
      scheduledPurgeAt: opts.dueAt,
      status: opts.status ?? "pending",
      claimedUntil: opts.claimedUntil ?? null,
    });
    return id;
  }

  async function seedPendingRequest(opts: {
    dueAt: Date;
    email?: string | null;
    name?: string | null;
  }) {
    const user = await seedUser();
    const requestId = await seedRequest({
      userId: user.id,
      dueAt: opts.dueAt,
      email: opts.email === undefined ? user.email : opts.email,
      name: opts.name === undefined ? "Snap Shot" : opts.name,
    });
    return { userId: user.id, email: user.email, requestId };
  }

  async function markSteps(requestId: string, names: readonly string[]) {
    for (const moduleName of names) {
      await t.db
        .insert(accountDeletionSteps)
        .values({ id: createId("ads"), requestId, moduleName });
    }
  }

  async function request(id: string) {
    const [row] = await t.db
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, id));
    return row!;
  }

  async function stepNames(requestId: string): Promise<string[]> {
    const rows = await t.db
      .select({ name: accountDeletionSteps.moduleName })
      .from(accountDeletionSteps)
      .where(eq(accountDeletionSteps.requestId, requestId));
    return rows.map((r) => r.name).sort();
  }

  async function userExists(id: string): Promise<boolean> {
    const rows = await t.db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.id, id));
    return rows.length === 1;
  }

  async function userStatus(id: string): Promise<string | undefined> {
    const [row] = await t.db
      .select({ status: authUsers.status })
      .from(authUsers)
      .where(eq(authUsers.id, id));
    return row?.status;
  }

  it("runs steps in the given order, then auth, then mail, and completes", async () => {
    const { userId, email, requestId } = await seedPendingRequest({
      dueAt: new Date(NOW.getTime() - DAY_MS),
      name: "Anna Muster",
    });
    const order: string[] = [];
    const calls: Calls = [];
    const steps = fakeSteps(calls).map((s) => ({
      ...s,
      run: async (db: Parameters<DeletionStep["run"]>[0], id: string) => {
        order.push(s.name);
        await s.run(db, id);
      },
    }));
    getEventBus().subscribe<UserDeleted>("auth.user.deleted", async () => {
      order.push("auth");
    });
    const mail: CompletionMail = {
      async send(to) {
        order.push("email_c");
        expect(to).toEqual({ email, name: "Anna Muster" });
        return "sent";
      },
    };

    const result = await runAccountDeletionSweep(t.db, {
      steps,
      completionMail: mail,
      now: () => NOW,
    });

    expect(result).toEqual({ processed: 1, completed: 1, failed: [] });
    expect(order).toEqual([...MODULE_STEPS, "auth", "email_c"]);
    expect(calls.every((c) => c.userId === userId)).toBe(true);
    expect(await userExists(userId)).toBe(false);
    const row = await request(requestId);
    expect(row.status).toBe("completed");
    expect(row.completedAt).toEqual(NOW);
    expect(row.userId).toBeNull();
    expect(row.emailSnapshot).toBeNull();
    expect(row.nameSnapshot).toBeNull();
    expect(row.claimedUntil).toBeNull();
    expect(row.lastError).toBeNull();
    expect(await stepNames(requestId)).toEqual([...MODULE_STEPS, "auth", "email_c"].sort());
  });

  it("ignores requests not yet due, cancelled and completed", async () => {
    const notDue = await seedPendingRequest({ dueAt: new Date(NOW.getTime() + 60_000) });
    const cancelledUser = await seedUser("active");
    const cancelled = await seedRequest({
      userId: cancelledUser.id,
      dueAt: new Date(NOW.getTime() - DAY_MS),
      status: "cancelled",
    });
    const completed = await seedRequest({
      userId: null,
      dueAt: new Date(NOW.getTime() - DAY_MS),
      status: "completed",
    });
    const calls: Calls = [];
    const { mail, sent } = fakeMail();

    const result = await runAccountDeletionSweep(t.db, {
      steps: fakeSteps(calls),
      completionMail: mail,
      now: () => NOW,
    });

    expect(result).toEqual({ processed: 0, completed: 0, failed: [] });
    expect(calls).toEqual([]);
    expect(sent).toEqual([]);
    expect(deletedEvents).toEqual([]);
    expect(await userExists(notDue.userId)).toBe(true);
    expect(await userExists(cancelledUser.id)).toBe(true);
    expect((await request(notDue.requestId)).status).toBe("pending");
    expect((await request(cancelled)).status).toBe("cancelled");
    expect((await request(completed)).status).toBe("completed");
    expect(await stepNames(notDue.requestId)).toEqual([]);
  });

  it("resumes at the failed step without re-running finished steps", async () => {
    const name = "Berta Geheim";
    const { userId, email, requestId } = await seedPendingRequest({
      dueAt: new Date(NOW.getTime() - DAY_MS),
      name,
    });
    const calls: Calls = [];
    const counts = () =>
      Object.fromEntries(MODULE_STEPS.map((n) => [n, calls.filter((c) => c.name === n).length]));

    const first = await runAccountDeletionSweep(t.db, {
      steps: fakeSteps(calls, {
        throwIn: {
          events: () =>
            new Error(`cannot purge ${email.toUpperCase()} (${name}) ${"x".repeat(2000)}`),
        },
      }),
      completionMail: fakeMail().mail,
      now: () => NOW,
    });

    expect(first).toEqual({ processed: 1, completed: 0, failed: [{ requestId, step: "events" }] });
    expect(Object.keys(first.failed[0]!).sort()).toEqual(["requestId", "step"]);
    expect(counts()).toEqual({ files: 1, blog: 1, events: 0, notifications: 0 });
    expect(await userExists(userId)).toBe(true);
    const failedRow = await request(requestId);
    expect(failedRow.status).toBe("in_progress");
    expect(failedRow.claimedUntil).toBeNull();
    expect(failedRow.lastError!.startsWith("events:")).toBe(true);
    expect(failedRow.lastError!.toLowerCase()).not.toContain(email);
    expect(failedRow.lastError).not.toContain(name);
    expect(failedRow.lastError!.length).toBeLessThanOrEqual(500);
    expect(await stepNames(requestId)).toEqual(["blog", "files"]);

    const second = await runAccountDeletionSweep(t.db, {
      steps: fakeSteps(calls),
      completionMail: fakeMail().mail,
      now: () => new Date(NOW.getTime() + DAY_MS),
    });

    expect(second).toEqual({ processed: 1, completed: 1, failed: [] });
    expect(counts()).toEqual({ files: 1, blog: 1, events: 1, notifications: 1 });
    expect(await userExists(userId)).toBe(false);
    const done = await request(requestId);
    expect(done.status).toBe("completed");
    expect(done.lastError).toBeNull();
  });

  it("never deletes a user who is not pending_deletion", async () => {
    const activeInProgress = await seedUser("active");
    const inProgressId = await seedRequest({
      userId: activeInProgress.id,
      dueAt: new Date(NOW.getTime() - DAY_MS),
      status: "in_progress",
    });
    const activePending = await seedUser("active");
    const pendingId = await seedRequest({
      userId: activePending.id,
      dueAt: new Date(NOW.getTime() - DAY_MS),
    });
    const calls: Calls = [];
    const { mail, sent } = fakeMail();

    const result = await runAccountDeletionSweep(t.db, {
      steps: fakeSteps(calls),
      completionMail: mail,
      now: () => NOW,
    });

    expect(result.processed).toBe(2);
    expect(result.completed).toBe(0);
    expect([...result.failed].sort((a, b) => a.requestId.localeCompare(b.requestId))).toEqual(
      [
        { requestId: inProgressId, step: "guard" },
        { requestId: pendingId, step: "guard" },
      ].sort((a, b) => a.requestId.localeCompare(b.requestId)),
    );
    expect(calls).toEqual([]);
    expect(sent).toEqual([]);
    expect(deletedEvents).toEqual([]);
    expect(await userStatus(activeInProgress.id)).toBe("active");
    expect(await userStatus(activePending.id)).toBe("active");
    expect(await stepNames(inProgressId)).toEqual([]);
    expect(await stepNames(pendingId)).toEqual([]);
    for (const id of [inProgressId, pendingId]) {
      const row = await request(id);
      expect(row.status).not.toBe("completed");
      expect(row.lastError!.startsWith("guard:")).toBe(true);
      expect(row.emailSnapshot).toBe("snap@example.de");
    }
  });

  it("only one of two concurrent sweeps executes a request", async () => {
    const { userId, requestId } = await seedPendingRequest({
      dueAt: new Date(NOW.getTime() - DAY_MS),
    });
    const calls: Calls = [];
    const { mail, sent } = fakeMail();
    const deps = { steps: fakeSteps(calls, { delayMs: 50 }), completionMail: mail, now: () => NOW };

    const [a, b] = await Promise.all([
      runAccountDeletionSweep(t.db, deps),
      runAccountDeletionSweep(t.db, deps),
    ]);

    expect(a.processed + b.processed).toBe(1);
    expect(a.completed + b.completed).toBe(1);
    expect([...a.failed, ...b.failed]).toEqual([]);
    for (const name of MODULE_STEPS) {
      expect(calls.filter((c) => c.name === name)).toHaveLength(1);
    }
    expect(sent).toHaveLength(1);
    expect(deletedEvents).toHaveLength(1);
    expect(await userExists(userId)).toBe(false);
    expect((await request(requestId)).status).toBe("completed");
  });

  it("an expired lease is re-claimed; a live lease is not", async () => {
    const live = await seedUser();
    const liveId = await seedRequest({
      userId: live.id,
      dueAt: new Date(NOW.getTime() - DAY_MS),
      status: "in_progress",
      claimedUntil: new Date(NOW.getTime() + 60_000),
    });
    const expired = await seedUser();
    const expiredId = await seedRequest({
      userId: expired.id,
      dueAt: new Date(NOW.getTime() - DAY_MS),
      status: "in_progress",
      claimedUntil: new Date(NOW.getTime() - 60_000),
    });
    const calls: Calls = [];

    const result = await runAccountDeletionSweep(t.db, {
      steps: fakeSteps(calls),
      completionMail: fakeMail().mail,
      now: () => NOW,
    });

    expect(result).toEqual({ processed: 1, completed: 1, failed: [] });
    expect(calls.every((c) => c.userId === expired.id)).toBe(true);
    expect(await userExists(live.id)).toBe(true);
    expect(await userExists(expired.id)).toBe(false);
    const liveRow = await request(liveId);
    expect(liveRow.status).toBe("in_progress");
    expect(liveRow.claimedUntil).toEqual(new Date(NOW.getTime() + 60_000));
    expect(await stepNames(liveId)).toEqual([]);
    expect((await request(expiredId)).status).toBe("completed");
  });

  it("resumes after crash between deleteAccount and the auth step marker", async () => {
    const { userId, requestId } = await seedPendingRequest({
      dueAt: new Date(NOW.getTime() - DAY_MS),
    });
    await t.db
      .update(accountDeletionRequests)
      .set({ status: "in_progress", claimedUntil: new Date(NOW.getTime() - 60_000) })
      .where(eq(accountDeletionRequests.id, requestId));
    await markSteps(requestId, MODULE_STEPS);
    await t.db.delete(authUsers).where(eq(authUsers.id, userId));
    expect((await request(requestId)).userId).toBeNull();
    const calls: Calls = [];
    const { mail, sent } = fakeMail();

    const result = await runAccountDeletionSweep(t.db, {
      steps: fakeSteps(calls),
      completionMail: mail,
      now: () => NOW,
    });

    expect(result).toEqual({ processed: 1, completed: 1, failed: [] });
    expect(calls).toEqual([]);
    expect(deletedEvents).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(await stepNames(requestId)).toEqual([...MODULE_STEPS, "auth", "email_c"].sort());
    expect((await request(requestId)).status).toBe("completed");
  });

  it("refuses to finish a request whose user is gone but whose module steps are unrecorded", async () => {
    const requestId = await seedRequest({
      userId: null,
      dueAt: new Date(NOW.getTime() - DAY_MS),
      status: "in_progress",
    });
    await markSteps(requestId, ["files", "blog"]);
    const calls: Calls = [];
    const { mail, sent } = fakeMail();

    const result = await runAccountDeletionSweep(t.db, {
      steps: fakeSteps(calls),
      completionMail: mail,
      now: () => NOW,
    });

    expect(result).toEqual({ processed: 1, completed: 0, failed: [{ requestId, step: "guard" }] });
    expect(calls).toEqual([]);
    expect(sent).toEqual([]);
    expect(deletedEvents).toEqual([]);
    expect(await stepNames(requestId)).toEqual(["blog", "files"]);
    const row = await request(requestId);
    expect(row.status).toBe("in_progress");
    expect(row.emailSnapshot).toBe("snap@example.de");
  });

  it("clears the snapshot only after mail C was sent", async () => {
    const { userId, email, requestId } = await seedPendingRequest({
      dueAt: new Date(NOW.getTime() - DAY_MS),
    });
    const { mail, sent } = fakeMail(["failed", "sent"]);
    const deps = { steps: fakeSteps([]), completionMail: mail };

    const first = await runAccountDeletionSweep(t.db, { ...deps, now: () => NOW });

    expect(first).toEqual({ processed: 1, completed: 0, failed: [{ requestId, step: "email_c" }] });
    expect(await userExists(userId)).toBe(false);
    const pendingMail = await request(requestId);
    expect(pendingMail.status).toBe("in_progress");
    expect(pendingMail.emailSnapshot).toBe(email);
    expect(pendingMail.nameSnapshot).toBe("Snap Shot");
    expect(pendingMail.claimedUntil).toBeNull();
    expect(pendingMail.lastError!.startsWith("email_c:")).toBe(true);
    expect(await stepNames(requestId)).toEqual([...MODULE_STEPS, "auth"].sort());

    const second = await runAccountDeletionSweep(t.db, {
      ...deps,
      now: () => new Date(NOW.getTime() + DAY_MS),
    });

    expect(second).toEqual({ processed: 1, completed: 1, failed: [] });
    expect(sent).toEqual([
      { email, name: "Snap Shot" },
      { email, name: "Snap Shot" },
    ]);
    expect(deletedEvents).toHaveLength(1);
    const done = await request(requestId);
    expect(done.status).toBe("completed");
    expect(done.emailSnapshot).toBeNull();
    expect(done.nameSnapshot).toBeNull();
  });

  it("gives up on the mail after 7 days but still scrubs and completes", async () => {
    const dueAt = new Date(NOW.getTime() - DAY_MS);
    const { requestId } = await seedPendingRequest({ dueAt });
    const { mail, sent } = fakeMail(["failed", "failed"]);
    const deps = { steps: fakeSteps([]), completionMail: mail };

    await runAccountDeletionSweep(t.db, { ...deps, now: () => NOW });
    const withinWindow = await runAccountDeletionSweep(t.db, {
      ...deps,
      now: () => new Date(dueAt.getTime() + 7 * DAY_MS - 60_000),
    });
    expect(withinWindow.failed).toEqual([{ requestId, step: "email_c" }]);
    expect(sent).toHaveLength(2);

    const afterWindow = await runAccountDeletionSweep(t.db, {
      ...deps,
      now: () => new Date(dueAt.getTime() + 7 * DAY_MS + 60_000),
    });

    expect(afterWindow).toEqual({ processed: 1, completed: 1, failed: [] });
    expect(sent).toHaveLength(2);
    const row = await request(requestId);
    expect(row.status).toBe("completed");
    expect(row.emailSnapshot).toBeNull();
    expect(row.nameSnapshot).toBeNull();
    expect(await stepNames(requestId)).toContain("email_c");
  });

  it("skips the mail but still completes when there is no address snapshot", async () => {
    const both = await seedPendingRequest({
      dueAt: new Date(NOW.getTime() - DAY_MS),
      email: null,
      name: null,
    });
    const emailOnly = await seedPendingRequest({
      dueAt: new Date(NOW.getTime() - DAY_MS),
      email: null,
      name: "Nur Name",
    });
    const calls: Calls = [];
    const { mail, sent } = fakeMail(["failed"]);

    const result = await runAccountDeletionSweep(t.db, {
      steps: fakeSteps(calls),
      completionMail: mail,
      now: () => NOW,
    });

    expect(result).toEqual({ processed: 2, completed: 2, failed: [] });
    expect(sent).toEqual([]);
    for (const { userId, requestId } of [both, emailOnly]) {
      expect(await userExists(userId)).toBe(false);
      const row = await request(requestId);
      expect(row.status).toBe("completed");
      expect(row.emailSnapshot).toBeNull();
      expect(row.nameSnapshot).toBeNull();
      expect(await stepNames(requestId)).toContain("email_c");
    }
  });

  describe("cancel and claim are mutually exclusive", () => {
    async function requestViaService() {
      const user = await seedUser("active");
      const requested = await requestAccountDeletion(t.db, {
        userId: user.id,
        displayName: "Clara Cancel",
      });
      const due = () => new Date(requested.scheduledPurgeAt.getTime() + 60_000);
      return { userId: user.id, ...requested, due };
    }

    it("cancel first: the sweep does nothing to the cancelled request", async () => {
      const r = await requestViaService();
      await cancelAccountDeletion(t.db, r.reactivationToken);
      const calls: Calls = [];
      const { mail, sent } = fakeMail();

      const result = await runAccountDeletionSweep(t.db, {
        steps: fakeSteps(calls),
        completionMail: mail,
        now: r.due,
      });

      expect(result).toEqual({ processed: 0, completed: 0, failed: [] });
      expect(calls).toEqual([]);
      expect(sent).toEqual([]);
      expect(deletedEvents).toEqual([]);
      expect(await userStatus(r.userId)).toBe("active");
      expect((await request(r.requestId)).status).toBe("cancelled");
    });

    it("claim first: cancel is rejected, the user stays locked and the purge proceeds", async () => {
      const r = await requestViaService();
      let cancelError: unknown;
      let statusDuringCancel: string | undefined;
      let requestStatusDuringCancel: string | undefined;
      const calls: Calls = [];
      const steps = fakeSteps(calls).map((s, i) =>
        i === 0
          ? {
              ...s,
              run: async (db: Parameters<DeletionStep["run"]>[0], userId: string) => {
                requestStatusDuringCancel = (await request(r.requestId)).status;
                cancelError = await cancelAccountDeletion(t.db, r.reactivationToken).then(
                  () => undefined,
                  (e: unknown) => e,
                );
                statusDuringCancel = await userStatus(userId);
                await s.run(db, userId);
              },
            }
          : s,
      );

      const result = await runAccountDeletionSweep(t.db, {
        steps,
        completionMail: fakeMail().mail,
        now: r.due,
      });

      expect(requestStatusDuringCancel).toBe("in_progress");
      expect(cancelError).toBeInstanceOf(NotFoundError);
      expect(statusDuringCancel).toBe("pending_deletion");
      expect(result).toEqual({ processed: 1, completed: 1, failed: [] });
      expect(await userExists(r.userId)).toBe(false);
      expect((await request(r.requestId)).status).toBe("completed");
    });

    it("racing cancel and sweep never both succeed", async () => {
      for (let i = 0; i < 5; i++) {
        const r = await requestViaService();
        const calls: Calls = [];

        const [cancel, sweep] = await Promise.allSettled([
          cancelAccountDeletion(t.db, r.reactivationToken),
          runAccountDeletionSweep(t.db, {
            steps: fakeSteps(calls),
            completionMail: fakeMail().mail,
            now: r.due,
          }),
        ]);

        expect(sweep.status).toBe("fulfilled");
        const row = await request(r.requestId);
        if (cancel.status === "fulfilled") {
          expect(row.status).toBe("cancelled");
          expect(await userStatus(r.userId)).toBe("active");
          expect(calls.filter((c) => c.userId === r.userId)).toEqual([]);
        } else {
          expect(cancel.reason).toBeInstanceOf(NotFoundError);
          expect(row.status).toBe("completed");
          expect(await userExists(r.userId)).toBe(false);
        }
      }
    });
  });

  it("rejects a step list that uses a reserved name", async () => {
    const { userId, requestId } = await seedPendingRequest({
      dueAt: new Date(NOW.getTime() - DAY_MS),
    });
    for (const reserved of ["auth", "email_c"]) {
      const ran: string[] = [];
      const steps: DeletionStep[] = [
        { name: "files", run: async () => void ran.push("files") },
        { name: reserved, run: async () => void ran.push(reserved) },
      ];

      await expect(
        runAccountDeletionSweep(t.db, { steps, completionMail: fakeMail().mail, now: () => NOW }),
      ).rejects.toThrow(/reserved/);
      expect(ran).toEqual([]);
    }
    expect(await userExists(userId)).toBe(true);
    const row = await request(requestId);
    expect(row.status).toBe("pending");
    expect(row.claimedUntil).toBeNull();
  });
});
