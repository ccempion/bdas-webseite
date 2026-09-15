/**
 * Account-security notices: password changed, password reset, login email
 * changed. All three hang off auth events, which carry a userId rather than a
 * memberId, so the handler resolves the member first (see subscribers.ts).
 * Integration tests against a real Postgres schema; skips when
 * DATABASE_URL is unreachable, as the sibling suites do.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EmailChanged, PasswordChanged, PasswordReset } from "@bdas/auth";
import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

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

describeIfDb("notifications: account-security mails", () => {
  let t: TestDb;
  let sent: OutboundEmail[];

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0002_role_grants.sql"],
      ["..", "..", "members", "migrations", "0003_local_board_lead.sql"],
      ["..", "..", "members", "migrations", "0004_revoked_by.sql"],
      ["..", "..", "members", "migrations", "0005_event_organizer.sql"],
      ["..", "..", "members", "migrations", "0006_group_change_requests.sql"],
      ["..", "..", "members", "migrations", "0007_page_editor.sql"],
      ["..", "..", "members", "migrations", "0008_application_reasons.sql"],
      ["..", "..", "members", "migrations", "0009_reason_required.sql"],
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

    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES ('usr_anna', 'anna@example.org', 'anna@example.org', 'active')`;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_anna', 'usr_anna', 'Anna', 'Mitglied', NULL, 'active')`;

    registerNotificationSubscribers(t.db);
  });

  afterEach(async () => {
    unregisterNotificationSubscribers();
    resetEventBus();
    await t.cleanup();
  });

  async function publish(
    event: PasswordChanged | PasswordReset | EmailChanged,
  ): Promise<void> {
    await getEventBus().publish(event);
    await new Promise((r) => setTimeout(r, 0));
  }

  it("alerts the member when their password is changed", async () => {
    await publish({ type: "auth.password.changed", userId: "usr_anna", at: new Date() });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("anna@example.org");
    expect(sent[0]?.subject).toContain("Passwort");
  });

  it("alerts the member with distinct wording when their password is reset", async () => {
    await publish({ type: "auth.password.reset", userId: "usr_anna", at: new Date() });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("zurückgesetzt");
  });

  it("says nothing when the user has no member profile yet", async () => {
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES ('usr_orphan', 'orphan@example.org', 'orphan@example.org', 'active')`;

    await publish({ type: "auth.password.changed", userId: "usr_orphan", at: new Date() });

    expect(sent).toHaveLength(0);
  });

  it("emails the OLD address, not the new one, when the login email changes", async () => {
    await publish({
      type: "auth.email.changed",
      userId: "usr_anna",
      oldEmail: "alt@example.org",
      newEmail: "neu@example.org",
      at: new Date(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("alt@example.org");
    expect(sent[0]?.text).toContain("neu@example.org");
  });
});
