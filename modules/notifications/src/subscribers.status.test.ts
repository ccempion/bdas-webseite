/**
 * `members.status.changed` → the applicant learns the board's decision.
 * Integration tests against a real Postgres schema; skips when DATABASE_URL is
 * unreachable, as the sibling suites do.
 *
 * The decision is carried entirely by the event, so no member row is read here;
 * the upstream schemas are loaded only because notification_log references them.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";
import type { StatusChanged } from "@bdas/members";

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

describeIfDb("notifications: members.status.changed → the applicant", () => {
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
        return { email: "anna@example.org", firstName: "Anna" };
      },
    });
  });

  afterEach(async () => {
    unregisterNotificationSubscribers();
    resetEventBus();
    await t.cleanup();
  });

  async function publish(from: StatusChanged["from"], to: StatusChanged["to"]): Promise<void> {
    registerNotificationSubscribers(t.db);
    await getEventBus().publish<StatusChanged>({
      type: "members.status.changed",
      memberId: "mem_applicant",
      from,
      to,
      actorUserId: "usr_board",
      at: new Date(),
    });
    await new Promise((r) => setTimeout(r, 0));
  }

  it("emails the applicant when the board approves them", async () => {
    await publish("pending", "active");

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("anna@example.org");
    expect(sent[0]?.subject).toContain("aufgenommen");
    expect(sent[0]?.text).toContain("Anna");
  });

  it("emails the applicant when the board declines them", async () => {
    await publish("pending", "inactive");

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("Bewerbung");
  });

  it("stays quiet for status changes that are not a decision on a application", async () => {
    await publish("active", "inactive");
    expect(sent).toHaveLength(0);

    await publish("inactive", "active");
    expect(sent).toHaveLength(0);

    await publish("active", "alumnus");
    expect(sent).toHaveLength(0);
  });
});
