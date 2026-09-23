/**
 * Integration tests for this module's GDPR functions (exportForUser,
 * clearOrganizerForUser) against a real Postgres schema. Skips when
 * DATABASE_URL is unreachable, matching every other test file in this
 * module.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";

import { clearOrganizerForUser, exportForUser } from "./services/gdpr";
import { createEvent } from "./services/manage";

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

function future(daysAhead = 7): Date {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
}

describeIfDb("events GDPR functions", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0002_role_grants.sql"],
      ["..", "migrations", "0001_init.sql"],
      ["..", "migrations", "0002_event_pages.sql"],
      ["..", "migrations", "0003_guest_registration.sql"],
      ["..", "migrations", "0004_organizer_erasure.sql"],
    ]) {
      const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
      await t.client.unsafe(sql);
    }
  });

  afterEach(async () => {
    await t.cleanup();
  });

  describe("exportForUser", () => {
    it("returns every event the user organized", async () => {
      const a = await createEvent(t.db, { title: "Erstes", startsAt: future() }, "usr_departing");
      const b = await createEvent(
        t.db,
        { title: "Zweites", startsAt: future(14) },
        "usr_departing",
      );
      await createEvent(t.db, { title: "Fremd", startsAt: future() }, "usr_other");

      const result = await exportForUser(t.db, "usr_departing");

      expect(result.map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
    });

    it("returns an empty array for a user who organized nothing", async () => {
      expect(await exportForUser(t.db, "usr_nobody")).toEqual([]);
    });
  });

  describe("clearOrganizerForUser", () => {
    it("clears created_by on every event the user organized, event rows survive", async () => {
      const ev = await createEvent(
        t.db,
        { title: "Bleibt bestehen", startsAt: future() },
        "usr_departing",
      );

      await clearOrganizerForUser(t.db, "usr_departing");

      const [row] = await t.client`SELECT created_by FROM events WHERE id = ${ev.id}`;
      expect(row).toBeDefined();
      expect(row?.["created_by"]).toBeNull();
    });

    it("never touches an event organized by someone else", async () => {
      const otherEvent = await createEvent(
        t.db,
        { title: "Fremdes Event", startsAt: future() },
        "usr_other",
      );

      await clearOrganizerForUser(t.db, "usr_departing"); // usr_departing organized nothing here

      const [row] = await t.client`SELECT created_by FROM events WHERE id = ${otherEvent.id}`;
      expect(row?.["created_by"]).toBe("usr_other");
    });

    it("is idempotent: a second call after clearing is a clean no-op", async () => {
      const ev = await createEvent(
        t.db,
        { title: "Einmal reicht", startsAt: future() },
        "usr_departing",
      );

      await clearOrganizerForUser(t.db, "usr_departing");
      await expect(clearOrganizerForUser(t.db, "usr_departing")).resolves.toBeUndefined();

      const [row] = await t.client`SELECT created_by FROM events WHERE id = ${ev.id}`;
      expect(row?.["created_by"]).toBeNull();
    });

    it("is a no-op for a user who organized nothing", async () => {
      await expect(clearOrganizerForUser(t.db, "usr_nobody")).resolves.toBeUndefined();
    });
  });
});
