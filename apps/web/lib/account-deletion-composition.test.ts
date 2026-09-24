/**
 * The real module steps, the real completion mail and the real engine against
 * real Postgres (CLAUDE.md §4). Only the outside world is faked: the object
 * stores and the outgoing mail transport.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runAccountDeletionSweep } from "@bdas/auth";
import { createTestDb, type TestDb } from "@bdas/db/test";
import { setMemberIdResolver as setFilesMemberIdResolver } from "@bdas/files";
import { registerNewsletterSubscribers } from "@bdas/newsletter";
import {
  setMemberIdResolver as setNotificationsMemberIdResolver,
  setNotifier,
  type OutboundEmail,
} from "@bdas/notifications";
import { setStorage, type StorageClient } from "@bdas/storage";

const current: { t: TestDb | null } = { t: null };

vi.mock("@bdas/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDb: () => {
    if (!current.t) throw new Error("no test db");
    return current.t.db;
  },
}));

import { buildDeletionSteps, completionMail } from "./account-deletion-composition";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = path.join(__dirname, "../../../modules");
// Manifest order (infra/migrations/src/manifest.ts), restricted to what the steps touch.
const MODULES = [
  "auth",
  "groups",
  "members",
  "files",
  "notifications",
  "events",
  "blog",
  "newsletter",
];
const DAY_MS = 24 * 60 * 60 * 1000;

async function dbReachable(): Promise<boolean> {
  const url = process.env["DATABASE_URL"] ?? "postgres://bdas:bdas@localhost:5432/bdas";
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

const describeIfDb = (await dbReachable()) ? describe : describe.skip;

function memoryBucket(keys: string[]) {
  const objects = new Set(keys);
  return {
    objects,
    async deleteByPrefix(prefix: string): Promise<{ deleted: number }> {
      let deleted = 0;
      for (const k of [...objects]) {
        if (k.startsWith(prefix)) {
          objects.delete(k);
          deleted++;
        }
      }
      return { deleted };
    },
    async deleteObject(key: string): Promise<void> {
      objects.delete(key);
    },
  };
}

describeIfDb("account deletion composition (real modules)", () => {
  let t: TestDb;
  let sent: OutboundEmail[];
  let mailDown: boolean;
  let filesBucket: ReturnType<typeof memoryBucket>;
  let blogBucket: ReturnType<typeof memoryBucket>;

  const A = { user: "usr_a", member: "mem_a", email: "a@example.de", name: "Anna Aaltje" };
  const B = { user: "usr_b", member: "mem_b", email: "b@example.de" };

  const rows = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
    (await t.client.unsafe(sql, params as never[])) as unknown as T[];
  const q = (sql: string, params: unknown[] = []) => rows<never>(sql, params);
  const count = async (table: string, where = "true", params: unknown[] = []) =>
    (
      await rows<{ n: number }>(`select count(*)::int as n from ${table} where ${where}`, params)
    )[0]!.n;

  beforeEach(async () => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
    t = await createTestDb();
    current.t = t;
    for (const mod of MODULES) {
      const dir = path.join(MODULES_DIR, mod, "migrations");
      for (const file of (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
        await t.client.unsafe(await fs.readFile(path.join(dir, file), "utf8"));
      }
    }

    registerNewsletterSubscribers(t.db);

    filesBucket = memoryBucket(["files/a/report.pdf", "files/b/notes.pdf"]);
    setStorage(filesBucket as unknown as StorageClient);
    blogBucket = memoryBucket([`${A.user}/pic1.png`, `${A.user}/pic2.png`, `${B.user}/pic.png`]);

    const resolver = {
      async resolveMemberId(_db: unknown, userId: string): Promise<string | null> {
        const found = await rows<{ id: string }>(`select id from members where user_id = $1`, [
          userId,
        ]);
        return found[0]?.id ?? null;
      },
    };
    setFilesMemberIdResolver(resolver as never);
    setNotificationsMemberIdResolver(resolver as never);

    sent = [];
    mailDown = false;
    setNotifier({
      async send(email) {
        if (mailDown) throw new Error("smtp down");
        sent.push(email);
      },
    });

    for (const u of [A, B]) {
      await q(
        `insert into auth_users (id, email_normalized, email_display, status) values ($1, $2, $2, $3)`,
        [u.user, u.email, u === A ? "pending_deletion" : "active"],
      );
      await q(
        `insert into members (id, user_id, first_name, last_name) values ($1, $2, 'X', 'Y')`,
        [u.member, u.user],
      );
    }
    await q(
      `insert into folders (id, slug, name, scope) values ('fld_root', 'alle', 'Alle', 'members_all')`,
    );
    await q(
      `insert into files (id, folder_id, filename, storage_key, mime_type, size_bytes, status, uploaded_by)
       values ('fil_a', 'fld_root', 'report.pdf', 'files/a/report.pdf', 'application/pdf', 1, 'ready', $1),
              ('fil_b', 'fld_root', 'notes.pdf', 'files/b/notes.pdf', 'application/pdf', 1, 'ready', $2)`,
      [A.member, B.member],
    );
    await q(
      `insert into posts (id, slug, title, content, created_by)
       values ('pst_a', 'a', 'A', '{}', $1), ('pst_b', 'b', 'B', '{}', $2)`,
      [A.user, B.user],
    );
    await q(
      `insert into post_comments (id, post_id, author_id, body)
       values ('cmt_a', 'pst_b', $1, 'hallo'), ('cmt_b', 'pst_b', $2, 'hi')`,
      [A.user, B.user],
    );
    await q(
      `insert into events (id, title, starts_at, created_by)
       values ('evt_a', 'Von A', now(), $1), ('evt_b', 'Von B', now(), $2)`,
      [A.user, B.user],
    );
    await q(
      `insert into notification_log (id, member_id, template, to_email, subject, status)
       values ('ntf_a', $1, 't', $2, 's', 'sent'), ('ntf_b', $3, 't', $4, 's', 'sent')`,
      [A.member, A.email, B.member, B.email],
    );
    await q(
      `insert into newsletter_subscribers (id, email, user_id, status, unsubscribe_token_hash, source)
       values ('nls_a', $1, $2, 'subscribed', 'h_a', 'konto'), ('nls_b', $3, $4, 'subscribed', 'h_b', 'konto')`,
      [A.email, A.user, B.email, B.user],
    );
  });

  afterEach(async () => {
    current.t = null;
    await t.cleanup();
  });

  async function seedRequest(purgeDueDaysAgo: number): Promise<void> {
    await q(
      `insert into account_deletion_requests
         (id, user_id, email_snapshot, name_snapshot, requested_at, scheduled_purge_at, status)
       values ('adr_a', $1, $2, $3, $4, $5, 'pending')`,
      [
        A.user,
        A.email,
        A.name,
        new Date(Date.now() - (30 + purgeDueDaysAgo) * DAY_MS).toISOString(),
        new Date(Date.now() - purgeDueDaysAgo * DAY_MS).toISOString(),
      ],
    );
  }

  const run = (order: string[] = []) =>
    runAccountDeletionSweep(t.db, {
      steps: buildDeletionSteps(() => blogBucket as never).map((s) => ({
        name: s.name,
        run: async (db, userId) => {
          order.push(s.name);
          await s.run(db, userId);
        },
      })),
      completionMail,
    });

  it("declares the steps in the fixed order", () => {
    expect(buildDeletionSteps().map((s) => s.name)).toEqual([
      "files",
      "blog",
      "events",
      "notifications",
    ]);
  });

  it("erases the account across every module and leaves other people's data alone", async () => {
    await seedRequest(1);
    const order: string[] = [];

    const result = await run(order);

    expect(result).toEqual({ processed: 1, completed: 1, failed: [] });
    expect(order).toEqual(["files", "blog", "events", "notifications"]);

    // files: object + row of A gone, B untouched
    expect([...filesBucket.objects]).toEqual(["files/b/notes.pdf"]);
    expect(await count("files", "uploaded_by = $1", [A.member])).toBe(0);
    expect(await count("files", "uploaded_by = $1", [B.member])).toBe(1);
    // blog: posts, comments and inline media of A gone; the other author's prefix untouched
    expect(await count("posts", "created_by = $1", [A.user])).toBe(0);
    expect(await count("post_comments", "author_id = $1", [A.user])).toBe(0);
    expect(await count("posts", "created_by = $1", [B.user])).toBe(1);
    expect(await count("post_comments", "author_id = $1", [B.user])).toBe(1);
    expect([...blogBucket.objects]).toEqual([`${B.user}/pic.png`]);
    // events: the event stays, its organizer is cleared
    expect(await count("events")).toBe(2);
    expect(await count("events", "created_by is null")).toBe(1);
    expect(await count("events", "created_by = $1", [B.user])).toBe(1);
    // notifications: A's log gone, B's kept
    expect(await count("notification_log", "member_id = $1", [A.member])).toBe(0);
    expect(await count("notification_log", "member_id = $1", [B.member])).toBe(1);
    // auth
    expect(await count("auth_users", "id = $1", [A.user])).toBe(0);
    expect(await count("auth_users", "id = $1", [B.user])).toBe(1);
  });

  it("erases the newsletter subscription of the account and of nobody else", async () => {
    await seedRequest(1);

    await run();

    expect(
      await count("newsletter_subscribers", "user_id = $1 or email = $2", [A.user, A.email]),
    ).toBe(0);
    expect(await count("newsletter_subscribers", "user_id = $1", [B.user])).toBe(1);
  });

  it("sends e-mail C once to the snapshot address and keeps no trace of the address", async () => {
    await seedRequest(1);

    await run();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(A.email);
    expect(await count("notification_log", "to_email = $1", [A.email])).toBe(0);
    const [req] = await rows<{
      status: string;
      email_snapshot: string | null;
      name_snapshot: string | null;
    }>(
      `select status, email_snapshot, name_snapshot, completed_at from account_deletion_requests where id = 'adr_a'`,
    );
    expect(req).toMatchObject({ status: "completed", email_snapshot: null, name_snapshot: null });
  });

  it("does not leave the address in the log when the mail fails, and retries within 7 days", async () => {
    await seedRequest(1);
    mailDown = true;

    const first = await run();

    expect(first).toEqual({
      processed: 1,
      completed: 0,
      failed: [{ requestId: "adr_a", step: "email_c" }],
    });
    expect(await count("notification_log", "to_email = $1", [A.email])).toBe(0);
    const [held] = await rows<{ status: string; email_snapshot: string | null }>(
      `select status, email_snapshot from account_deletion_requests where id = 'adr_a'`,
    );
    expect(held).toEqual({ status: "in_progress", email_snapshot: A.email });
    // the account itself is already gone; only the confirmation is outstanding
    expect(await count("auth_users", "id = $1", [A.user])).toBe(0);

    mailDown = false;
    await q(`update account_deletion_requests set claimed_until = null`);
    const second = await run();

    expect(second).toEqual({ processed: 1, completed: 1, failed: [] });
    expect(sent).toHaveLength(1);
    expect(await count("notification_log", "to_email = $1", [A.email])).toBe(0);
  });

  it("gives up on e-mail C after 7 days, sends nothing, and still scrubs the snapshot", async () => {
    await seedRequest(8);
    mailDown = true;

    const result = await run();

    expect(result).toEqual({ processed: 1, completed: 1, failed: [] });
    expect(sent).toHaveLength(0);
    expect(await count("notification_log", "to_email = $1", [A.email])).toBe(0);
    const [req] = await rows<{
      status: string;
      email_snapshot: string | null;
      name_snapshot: string | null;
    }>(
      `select status, email_snapshot, name_snapshot from account_deletion_requests where id = 'adr_a'`,
    );
    expect(req).toEqual({ status: "completed", email_snapshot: null, name_snapshot: null });
  });
});
