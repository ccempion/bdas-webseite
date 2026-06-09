/**
 * Notifications integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 *
 * Applies auth + groups + members + notifications migrations (notification_log
 * FKs into members, which FKs into groups + auth_users). Uses a fake Notifier +
 * RecipientResolver so no real email is sent and no other module's tables are
 * read in production code — the seed rows are raw test setup only.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";

import { setNotifier, type OutboundEmail } from "./notifier";
import { setRecipientResolver } from "./resolver";
import { notificationLog } from "./schema";
import { sendTransactional } from "./services/send";
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

describeIfDb("notifications integration", () => {
  let t: TestDb;
  let sent: OutboundEmail[];

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0001_init.sql"],
      ["..", "migrations", "0001_init.sql"],
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
        return { email: "mara@example.org", firstName: "Mara" };
      },
    });
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** Insert the minimal auth_user + member rows the FK chain needs. */
  async function seedMember(): Promise<string> {
    const userId = "usr_test_1";
    const memberId = "mbr_test_1";
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES (${userId}, 'mara@example.org', 'Mara@example.org', 'active')`;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, status)
      VALUES (${memberId}, ${userId}, 'Mara', 'Beispiel', 'active')`;
    return memberId;
  }

  it("sends a confirmation email and writes a 'sent' log row", async () => {
    const memberId = await seedMember();

    const result = await sendTransactional(t.db, "event_registration_confirmed", memberId, {
      eventTitle: "Sommerfest",
      eventId: "evt_1",
    });

    expect(result?.status).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("mara@example.org");
    expect(sent[0]?.subject).toContain("Anmeldung");

    const rows = await t.db.select().from(notificationLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(result?.logId);
    expect(rows[0]?.status).toBe("sent");
    expect(rows[0]?.toEmail).toBe("mara@example.org");
    expect(rows[0]?.template).toBe("event_registration_confirmed");
    expect(rows[0]?.eventId).toBe("evt_1");
    expect(rows[0]?.error).toBeNull();
  });

  it("records a 'failed' row when the Notifier throws, without rethrowing", async () => {
    const memberId = await seedMember();
    setNotifier({
      async send(): Promise<void> {
        throw new Error("resend down");
      },
    });

    const result = await sendTransactional(t.db, "event_waitlisted", memberId, {
      eventTitle: "Sommerfest",
    });

    expect(result?.status).toBe("failed");
    const rows = await t.db.select().from(notificationLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.error).toContain("resend down");
    expect(rows[0]?.eventId).toBeNull();
  });

  it("returns null and writes nothing when the recipient cannot be resolved", async () => {
    await seedMember();
    setRecipientResolver({
      async resolve(): Promise<RecipientContact | null> {
        return null;
      },
    });

    const result = await sendTransactional(t.db, "event_registration_confirmed", "mbr_test_1", {
      eventTitle: "Sommerfest",
    });

    expect(result).toBeNull();
    expect(sent).toHaveLength(0);
    const rows = await t.db.select().from(notificationLog);
    expect(rows).toHaveLength(0);
  });
});
