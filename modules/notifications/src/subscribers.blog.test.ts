/**
 * `blog.post.reported` → federal board notification, integration test against
 * a real Postgres schema. Mirrors subscribers.profile.test.ts's setup.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";
import type { PostReported } from "@bdas/blog";

import { setNotifier, type OutboundEmail } from "./notifier";
import { setRecipientResolver } from "./resolver";
import { registerNotificationSubscribers, unregisterNotificationSubscribers } from "./subscribers";
import type { RecipientContact } from "./types";

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

describeIfDb("notifications: blog.post.reported → federal board notification", () => {
  let t: TestDb;
  let sent: OutboundEmail[];

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0002_role_grants.sql"],
      ["..", "..", "blog", "migrations", "0001_init.sql"],
      ["..", "..", "blog", "migrations", "0002_categories_reports_softdelete.sql"],
    ]) {
      const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
      await t.client.unsafe(sql);
    }

    sent = [];
    setNotifier({
      async send(email): Promise<void> {
        sent.push(email);
      },
    });
    setRecipientResolver({
      async resolve(): Promise<RecipientContact | null> {
        return { email: "board@example.org", firstName: "Vorstand" };
      },
    });
  });

  afterEach(async () => {
    unregisterNotificationSubscribers();
    resetEventBus();
    await t.cleanup();
  });

  async function seedFederalBoard(): Promise<void> {
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES ('usr_board', 'board@example.org', 'board@example.org', 'active')`;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_board', 'usr_board', 'Bo', 'Board', NULL, 'active')`;
    await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
      VALUES ('mrg_board', 'mem_board', 'federal_board', NULL, 'usr_seed')`;
  }

  async function seedPost(): Promise<void> {
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES ('usr_author', 'author@example.org', 'author@example.org', 'active')`;
    await t.client`
      INSERT INTO posts (id, slug, title, content, created_by)
      VALUES ('post_1', 'testbeitrag', 'Testbeitrag', '{"type":"doc"}', 'usr_author')`;
  }

  it("emails the federal board when a post is reported", async () => {
    await seedFederalBoard();
    await seedPost();

    registerNotificationSubscribers(t.db, { siteUrl: "https://dashboard.bdas.de" });
    await getEventBus().publish<PostReported>({
      type: "blog.post.reported",
      postId: "post_1",
      reporterId: "usr_reporter",
      reason: "Wirkt wie Spam",
      at: new Date(),
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe("BDAS — Beitrag gemeldet");
    expect(sent[0]?.text).toContain("Testbeitrag");
    expect(sent[0]?.text).toContain("Wirkt wie Spam");
    expect(sent[0]?.text).toContain("https://dashboard.bdas.de/blog/testbeitrag");
  });
});
