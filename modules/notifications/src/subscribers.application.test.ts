/**
 * The application mails, which all hang off the request row's lifecycle
 * (ADR 0031): `members.group_change.requested` tells the destination board,
 * `.decided` tells the applicant, `.withdrawn` tells them their group was
 * dissolved. Integration tests against a real Postgres schema; skips when
 * DATABASE_URL is unreachable, as the sibling suites do.
 *
 * Fixtures are plain SQL: @bdas/members exposes only its public surface, so a
 * test may not reach into its private harness.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";
import type {
  GroupChangeDecided,
  GroupChangeRequested,
  GroupChangeWithdrawn,
} from "@bdas/members";

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

describeIfDb("notifications: the application mails", () => {
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
      ["..", "..", "members", "migrations", "0004_revoked_by.sql"],
      ["..", "..", "members", "migrations", "0005_event_organizer.sql"],
      ["..", "..", "members", "migrations", "0006_group_change_requests.sql"],
      ["..", "..", "members", "migrations", "0007_page_editor.sql"],
      ["..", "..", "members", "migrations", "0008_application_reasons.sql"],
      ["..", "..", "members", "migrations", "pending", "0009_reason_required.sql"],
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
      INSERT INTO groups (id, slug, name, city, status)
      VALUES ('grp_a', 'aachen', 'BDAS Aachen', 'Teststadt', 'active'),
             ('grp_b', 'berlin', 'BDAS Berlin', 'Teststadt', 'active')`;
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES ('usr_applicant', 'anna@example.org', 'anna@example.org', 'active')`;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_applicant', 'usr_applicant', 'Anna', 'Bewerberin', NULL, 'pending')`;
  });

  afterEach(async () => {
    unregisterNotificationSubscribers();
    resetEventBus();
    await t.cleanup();
  });

  /** A group-scoped local board that should receive the incoming application. */
  async function seedLocalBoard(): Promise<void> {
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES ('usr_board', 'board@example.org', 'board@example.org', 'active')`;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_board', 'usr_board', 'Bo', 'Board', 'grp_a', 'active')`;
    await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
      VALUES ('mrg_board', 'mem_board', 'local_board', 'grp_a', 'usr_seed')`;
  }

  async function seedRequest(
    id: string,
    status: "pending" | "rejected",
    reason?: { category: string; message: string | null },
  ): Promise<void> {
    if (status === "pending") {
      await t.client`
        INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id, status)
        VALUES (${id}, 'mem_applicant', NULL, 'grp_a', 'pending')`;
      return;
    }
    await t.client`
      INSERT INTO member_group_change_requests
        (id, member_id, from_group_id, to_group_id, status, decided_at, decided_by,
         reason_category, reason_message)
      VALUES (${id}, 'mem_applicant', NULL, 'grp_a', 'rejected', now(), 'usr_board',
              ${reason?.category ?? "other"}, ${reason?.message ?? null})`;
  }

  async function publish(
    event: GroupChangeRequested | GroupChangeDecided | GroupChangeWithdrawn,
  ): Promise<void> {
    registerNotificationSubscribers(t.db);
    await getEventBus().publish(event);
    await new Promise((r) => setTimeout(r, 0));
  }

  it("tells the destination board that an application arrived", async () => {
    await seedLocalBoard();

    await publish({
      type: "members.group_change.requested",
      requestId: "mgc_1",
      memberId: "mem_applicant",
      fromGroupId: null,
      toGroupId: "grp_a",
      at: new Date(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("Bewerbung");
    expect(sent[0]?.text).toContain("Anna Bewerberin");
  });

  it("emails the applicant when the board accepts them", async () => {
    await publish({
      type: "members.group_change.decided",
      requestId: "mgc_1",
      memberId: "mem_applicant",
      fromGroupId: null,
      toGroupId: "grp_a",
      decision: "approved",
      actorUserId: "usr_board",
      at: new Date(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("anna@example.org");
    expect(sent[0]?.subject).toContain("aufgenommen");
  });

  it("carries the board's reason into the decline mail", async () => {
    await seedRequest("mgc_1", "rejected", {
      category: "no_contact",
      message: "Wir haben dich dreimal nicht erreicht.",
    });

    await publish({
      type: "members.group_change.decided",
      requestId: "mgc_1",
      memberId: "mem_applicant",
      fromGroupId: null,
      toGroupId: "grp_a",
      decision: "rejected",
      actorUserId: "usr_board",
      at: new Date(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain("Kein Kontakt zustande gekommen");
    expect(sent[0]?.text).toContain("Wir haben dich dreimal nicht erreicht.");
  });

  it("stays quiet about a transfer between two groups", async () => {
    await publish({
      type: "members.group_change.decided",
      requestId: "mgc_1",
      memberId: "mem_applicant",
      fromGroupId: "grp_b",
      toGroupId: "grp_a",
      decision: "approved",
      actorUserId: "usr_board",
      at: new Date(),
    });

    expect(sent).toHaveLength(0);
  });

  it("tells the applicant their group was dissolved, not that they were rejected", async () => {
    await seedRequest("mgc_1", "pending");
    await t.client`
      UPDATE member_group_change_requests
         SET status = 'withdrawn', decided_at = now(), decided_by = 'system'
       WHERE id = 'mgc_1'`;

    await publish({
      type: "members.group_change.withdrawn",
      requestId: "mgc_1",
      memberId: "mem_applicant",
      actorUserId: "system",
      at: new Date(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain("BDAS Aachen");
    expect(sent[0]?.text).toContain("aufgelöst");
    expect(sent[0]?.text).not.toMatch(/abgelehnt|nicht angenommen/);
  });

  it("says nothing when the applicant withdraws their own application", async () => {
    await seedRequest("mgc_1", "pending");

    await publish({
      type: "members.group_change.withdrawn",
      requestId: "mgc_1",
      memberId: "mem_applicant",
      actorUserId: "usr_applicant",
      at: new Date(),
    });

    expect(sent).toHaveLength(0);
  });
});
