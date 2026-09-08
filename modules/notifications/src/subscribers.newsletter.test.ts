/**
 * The two newsletter mails (spec §3.2). The newsletter module never sends mail
 * itself — it publishes, and this module renders and sends. Integration tests
 * against a real Postgres schema; skips when DATABASE_URL is unreachable, as
 * the sibling suites do.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import { setNotifier, type OutboundEmail } from "./notifier";
import { registerNotificationSubscribers, unregisterNotificationSubscribers } from "./subscribers";

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

describeIfDb("notifications: the newsletter mails", () => {
  let t: TestDb;
  let sent: OutboundEmail[];

  beforeEach(async () => {
    t = await createTestDb();
    // `notification_log.member_id` carries a foreign key to `members`, so the
    // table has to exist even though every newsletter row leaves it null —
    // which drags in the auth and groups schemas members itself depends on.
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0004_location.sql"],
      ["..", "..", "groups", "migrations", "0005_image_key.sql"],
      ["..", "..", "groups", "migrations", "0006_link_scheme_guard.sql"],
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

    resetEventBus();
    // `registerNotificationSubscribers` returns early while `subs` is non-empty,
    // and that array is module-global: a sibling test file running first in the
    // same worker would otherwise leave our registration silently skipped.
    unregisterNotificationSubscribers();
    sent = [];
    setNotifier({
      async send(email): Promise<void> {
        sent.push(email);
      },
    });
    registerNotificationSubscribers(t.db, { siteUrl: "https://bdas.de" });
  });

  afterEach(async () => {
    unregisterNotificationSubscribers();
    resetEventBus();
    await t.cleanup();
  });

  it("sends the confirmation mail with the url from the event", async () => {
    await getEventBus().publish({
      type: "newsletter.confirmation_requested",
      email: "neu@example.org",
      token: "plain-token",
      confirmUrl: "https://bdas.de/newsletter/bestaetigen?token=plain-token",
      at: new Date(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("neu@example.org");
    expect(sent[0]!.subject).toBe("BDAS — Bitte bestätige deine Anmeldung");
    expect(sent[0]!.text).toContain("https://bdas.de/newsletter/bestaetigen?token=plain-token");
  });

  it("sends the already-subscribed mail without any token in the link", async () => {
    await getEventBus().publish({
      type: "newsletter.already_subscribed",
      email: "schon@example.org",
      at: new Date(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("BDAS — Du bist schon dabei");
    expect(sent[0]!.text).toContain("/newsletter/abmelden");
    // The event carries no token, and inventing one here would hand an
    // unsubscribe key to whoever typed the address.
    expect(sent[0]!.text).not.toContain("token=");
  });

  it("logs the send against no member, since there is no account", async () => {
    await getEventBus().publish({
      type: "newsletter.confirmation_requested",
      email: "anon@example.org",
      token: "t",
      confirmUrl: "https://bdas.de/newsletter/bestaetigen?token=t",
      at: new Date(),
    });

    const rows = await t.client.unsafe(`SELECT member_id, to_email, status FROM notification_log`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!["member_id"]).toBeNull();
    expect(rows[0]!["to_email"]).toBe("anon@example.org");
    expect(rows[0]!["status"]).toBe("sent");
  });

  it("never lets a send failure escape into the publisher", async () => {
    setNotifier({
      async send() {
        throw new Error("resend is down");
      },
    });

    // The newsletter module publishes inside its own request path; a throw here
    // would surface as an error to a visitor who just typed their address.
    await expect(
      getEventBus().publish({
        type: "newsletter.confirmation_requested",
        email: "kaputt@example.org",
        token: "t",
        confirmUrl: "https://bdas.de/newsletter/bestaetigen?token=t",
        at: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});
