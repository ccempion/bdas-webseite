/**
 * listMyUpcomingRegistrations against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable (CI provides Postgres).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { events } from "../schema";

import { listMyUpcomingRegistrations } from "./mine";
import { createEvent, publishEvent } from "./manage";
import { cancelRegistration, registerMember } from "./registration";

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

const describeIfDb = (await dbReachable()) ? describe : describe.skip;
const days = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const MEMBER = "mbr_lena";

describeIfDb("listMyUpcomingRegistrations", () => {
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
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", ...file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();

    // event_registrations.member_id is NOT NULL REFERENCES members(id), and
    // members.user_id references auth_users — so every member id a test uses
    // has to exist for real. Same helper shape as index.test.ts:112-123.
    for (const id of [MEMBER, "mbr_someone_else", "mbr_first"]) {
      await t.client`
        INSERT INTO auth_users (id, email_normalized, email_display, status)
        VALUES (${"usr_" + id}, ${id + "@e2e.test"}, ${id + "@e2e.test"}, 'active')`;
      await t.client`
        INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
        VALUES (${id}, ${"usr_" + id}, 'Test', ${id}, NULL, 'active')`;
    }
  });

  afterEach(async () => {
    await t.cleanup();
  });

  async function publish(title: string, startsAt: Date, capacity?: number): Promise<string> {
    const ev = await createEvent(
      t.db,
      capacity === undefined
        ? { title, startsAt, visibility: "public" }
        : { title, startsAt, visibility: "public", capacity },
      "usr_creator",
    );
    await publishEvent(t.db, ev.id);
    return ev.id;
  }

  it("returns the member's upcoming registrations, soonest first", async () => {
    const later = await publish("Sommerfest", days(20));
    const sooner = await publish("Stammtisch", days(2));
    await registerMember(t.db, later, MEMBER);
    await registerMember(t.db, sooner, MEMBER);

    const rows = await listMyUpcomingRegistrations(t.db, MEMBER);

    expect(rows.map((r) => r.eventId)).toEqual([sooner, later]);
    expect(rows[0]?.title).toBe("Stammtisch");
    expect(rows[0]?.waitlistPosition).toBeNull();
  });

  it("excludes another member's registrations", async () => {
    const id = await publish("Stammtisch", days(2));
    await registerMember(t.db, id, "mbr_someone_else");

    expect(await listMyUpcomingRegistrations(t.db, MEMBER)).toEqual([]);
  });

  it("excludes cancelled registrations", async () => {
    const id = await publish("Stammtisch", days(2));
    await registerMember(t.db, id, MEMBER);
    await cancelRegistration(t.db, id, MEMBER);

    expect(await listMyUpcomingRegistrations(t.db, MEMBER)).toEqual([]);
  });

  it("excludes events that have already started", async () => {
    // registerMember refuses a past event, so register first and move the event.
    const id = await publish("Rückblick", days(2));
    await registerMember(t.db, id, MEMBER);
    await t.db
      .update(events)
      .set({ startsAt: days(-1) })
      .where(eq(events.id, id));

    expect(await listMyUpcomingRegistrations(t.db, MEMBER)).toEqual([]);
  });

  it("reports the waitlist rank for a waitlisted registration", async () => {
    const id = await publish("Workshop", days(5), 1);
    await registerMember(t.db, id, "mbr_first");
    await registerMember(t.db, id, MEMBER);

    const rows = await listMyUpcomingRegistrations(t.db, MEMBER);
    expect(rows[0]?.waitlistPosition).toBe(1);
  });

  it("honours the limit", async () => {
    for (const n of [2, 4, 6, 8]) {
      const id = await publish(`Termin ${n}`, days(n));
      await registerMember(t.db, id, MEMBER);
    }

    const rows = await listMyUpcomingRegistrations(t.db, MEMBER, 2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.title)).toEqual(["Termin 2", "Termin 4"]);
  });
});
