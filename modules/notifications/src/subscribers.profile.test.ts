/**
 * `profile.completed` → board notification, integration tests against a real
 * Postgres schema. Skips when DATABASE_URL is unreachable; CI brings up a
 * Postgres service.
 *
 * Mirrors index.test.ts's setup: fake Notifier + RecipientResolver, raw SQL
 * seed rows (no cross-module deep imports — @bdas/members/@bdas/profile only
 * expose their public surface, so test fixtures are plain SQL here, same as
 * the rest of this file's sibling suite).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";
import type { ProfileCompleted } from "@bdas/profile";

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

describeIfDb("notifications: profile.completed → board notification", () => {
  let t: TestDb;
  let sent: OutboundEmail[];

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0004_location.sql"],
      ["..", "..", "members", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0002_role_grants.sql"],
      ["..", "..", "members", "migrations", "0003_local_board_lead.sql"],
      ["..", "migrations", "0001_init.sql"],
      ["..", "migrations", "0002_guest_recipient.sql"],
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

  async function seedGroup(id: string, slug: string): Promise<void> {
    await t.client`
      INSERT INTO groups (id, slug, name, city, status)
      VALUES (${id}, ${slug}, ${slug}, 'Teststadt', 'active')`;
  }

  async function seedUser(id: string, email: string): Promise<void> {
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES (${id}, ${email}, ${email}, 'active')`;
  }

  /** The applicant whose profile just completed. */
  async function seedApplicant(status: "pending" | "active"): Promise<string> {
    const userId = "usr_applicant";
    const memberId = "mem_applicant";
    await seedUser(userId, "applicant@example.org");
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES (${memberId}, ${userId}, 'Anna', 'Bewerberin', 'grp_a', ${status})`;
    return userId;
  }

  /** A group-scoped local board with one lead and one plain member. */
  async function seedLocalBoard(): Promise<void> {
    await seedUser("usr_lead", "lead@example.org");
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_lead', 'usr_lead', 'Lea', 'Lead', 'grp_a', 'active')`;
    await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
      VALUES ('mrg_lead', 'mem_lead', 'local_board_lead', 'grp_a', 'usr_seed')`;

    await seedUser("usr_board", "board@example.org");
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_board', 'usr_board', 'Bo', 'Board', 'grp_a', 'active')`;
    await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
      VALUES ('mrg_board', 'mem_board', 'local_board', 'grp_a', 'usr_seed')`;
  }

  it("emails each board recipient when a pending applicant completes their profile", async () => {
    await seedGroup("grp_a", "aachen");
    await seedLocalBoard();
    const userId = await seedApplicant("pending");

    registerNotificationSubscribers(t.db);
    await getEventBus().publish<ProfileCompleted>({
      type: "profile.completed",
      userId,
      groupId: "grp_a",
      at: new Date(),
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(sent).toHaveLength(2);
    expect(sent.every((m) => m.subject.includes("Bewerbung"))).toBe(true);
  });

  it("sends nothing when the completing member is already active", async () => {
    await seedGroup("grp_a", "aachen");
    await seedLocalBoard();
    const userId = await seedApplicant("active");

    registerNotificationSubscribers(t.db);
    await getEventBus().publish<ProfileCompleted>({
      type: "profile.completed",
      userId,
      groupId: "grp_a",
      at: new Date(),
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(sent).toHaveLength(0);
  });
});
