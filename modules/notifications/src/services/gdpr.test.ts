/**
 * Integration tests for this module's GDPR functions (exportForUser,
 * deleteLogForMember) against a real Postgres schema. Skips when
 * DATABASE_URL is unreachable, matching index.test.ts.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";

import { setNotifier } from "../notifier";
import { setMemberIdResolver } from "../resolver";
import { notificationLog } from "../schema";
import { deleteLogEntry, deleteLogForMember, exportForUser } from "./gdpr";
import { sendTransactionalToGuest } from "./send";

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

describeIfDb("notifications GDPR functions", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "..", "groups", "migrations", "0004_location.sql"],
      ["..", "..", "..", "groups", "migrations", "0005_image_key.sql"],
      ["..", "..", "..", "groups", "migrations", "0006_link_scheme_guard.sql"],
      ["..", "..", "..", "groups", "migrations", "0007_group_kind.sql"],
      ["..", "..", "..", "members", "migrations", "0001_init.sql"],
      ["..", "..", "migrations", "0001_init.sql"],
      ["..", "..", "migrations", "0002_guest_recipient.sql"],
      ["..", "..", "migrations", "0003_broadcast_log.sql"],
    ]) {
      const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
      await t.client.unsafe(sql);
    }
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** Insert the minimal auth_user + member rows the FK chain needs, and wire
   *  the resolver these GDPR functions depend on. */
  async function seedMember(): Promise<{ userId: string; memberId: string }> {
    const userId = "usr_test_1";
    const memberId = "mbr_test_1";
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES (${userId}, 'mara@example.org', 'Mara@example.org', 'active')`;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, status)
      VALUES (${memberId}, ${userId}, 'Mara', 'Beispiel', 'active')`;
    setMemberIdResolver({
      async resolveMemberId(_db, uid): Promise<string | null> {
        return uid === userId ? memberId : null;
      },
    });
    return { userId, memberId };
  }

  describe("exportForUser", () => {
    it("returns every log row for the resolved member", async () => {
      const { userId, memberId } = await seedMember();
      await t.db.insert(notificationLog).values({
        id: "ntfy_1",
        memberId,
        channel: "email",
        template: "event_registration_confirmed",
        toEmail: "mara@example.org",
        subject: "BDAS: Anmeldung bestätigt",
        status: "sent",
      });

      const rows = await exportForUser(t.db, userId);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.template).toBe("event_registration_confirmed");
      expect(rows[0]?.toEmail).toBe("mara@example.org");
      expect(rows[0]?.status).toBe("sent");
    });

    it("returns an empty array when the user has no resolvable member", async () => {
      setMemberIdResolver({
        async resolveMemberId(): Promise<string | null> {
          return null;
        },
      });

      const rows = await exportForUser(t.db, "usr_unknown");

      expect(rows).toEqual([]);
    });
  });

  describe("deleteLogForMember", () => {
    it("deletes every log row for the resolved member", async () => {
      const { userId, memberId } = await seedMember();
      await t.db.insert(notificationLog).values({
        id: "ntfy_2",
        memberId,
        channel: "email",
        template: "event_waitlisted",
        toEmail: "mara@example.org",
        subject: "BDAS: Auf der Warteliste",
        status: "sent",
      });

      await deleteLogForMember(t.db, userId);

      const rows = await t.db.select().from(notificationLog);
      expect(rows).toHaveLength(0);
    });

    it("is a no-op when the user has no resolvable member", async () => {
      setMemberIdResolver({
        async resolveMemberId(): Promise<string | null> {
          return null;
        },
      });

      await expect(deleteLogForMember(t.db, "usr_unknown")).resolves.toBeUndefined();
    });
  });

  describe("deleteLogEntry", () => {
    beforeEach(() => {
      setNotifier({ async send(): Promise<void> {} });
    });

    async function sendTwoGuestRows(): Promise<{ first: string; second: string }> {
      const a = await sendTransactionalToGuest(
        t.db,
        "event_registration_confirmed",
        { email: "erased@example.org", name: "Erased" },
        { eventTitle: "Fest" },
      );
      const b = await sendTransactionalToGuest(
        t.db,
        "event_registration_confirmed",
        { email: "other@example.org", name: "Other" },
        { eventTitle: "Fest" },
      );
      return { first: a.logId, second: b.logId };
    }

    it("deletes exactly the row with the given id and leaves the others", async () => {
      const { first, second } = await sendTwoGuestRows();

      await deleteLogEntry(t.db, first);

      const rows = await t.db.select().from(notificationLog);
      expect(rows.map((r) => r.id)).toEqual([second]);
      expect(rows.some((r) => r.toEmail === "erased@example.org")).toBe(false);
    });

    it("is idempotent for the same id", async () => {
      const { first, second } = await sendTwoGuestRows();

      await deleteLogEntry(t.db, first);
      await expect(deleteLogEntry(t.db, first)).resolves.toBeUndefined();

      const rows = await t.db.select().from(notificationLog);
      expect(rows.map((r) => r.id)).toEqual([second]);
    });

    it("resolves and deletes nothing for an unknown id", async () => {
      await sendTwoGuestRows();

      await expect(deleteLogEntry(t.db, "ntfy_does_not_exist")).resolves.toBeUndefined();

      const rows = await t.db.select().from(notificationLog);
      expect(rows).toHaveLength(2);
    });
  });
});
