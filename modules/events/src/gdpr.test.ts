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

import { resetEventBus } from "@bdas/events";

import { eventAttendance } from "./schema";
import {
  clearOrganizerForUser,
  exportForUser,
  exportParticipationForMember,
} from "./services/gdpr";
import { createEvent, publishEvent } from "./services/manage";
import { cancelRegistration, registerMember } from "./services/registration";

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

  describe("exportParticipationForMember", () => {
    beforeEach(async () => {
      resetEventBus();
      for (const id of ["mbr_me", "mbr_other"]) {
        await t.client`
          INSERT INTO auth_users (id, email_normalized, email_display, status)
          VALUES (${"usr_" + id}, ${id + "@e2e.test"}, ${id + "@e2e.test"}, 'active')`;
        await t.client`
          INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
          VALUES (${id}, ${"usr_" + id}, 'Test', ${id}, NULL, 'active')`;
      }
    });

    async function published(title: string): Promise<string> {
      const ev = await createEvent(
        t.db,
        { title, startsAt: future(), visibility: "public" },
        "usr_creator",
      );
      await publishEvent(t.db, ev.id);
      return ev.id;
    }

    it("returns own registrations incl. cancelled and waitlisted, never another member's", async () => {
      const a = await published("Stammtisch");
      const b = await published("Sommerfest");
      await registerMember(t.db, a, "mbr_me");
      await registerMember(t.db, b, "mbr_me");
      await cancelRegistration(t.db, b, "mbr_me");
      await registerMember(t.db, a, "mbr_other");

      const result = await exportParticipationForMember(t.db, "mbr_me");

      expect(result.registrations.map((r) => r.eventTitle).sort()).toEqual([
        "Sommerfest",
        "Stammtisch",
      ]);
      const cancelled = result.registrations.find((r) => r.eventTitle === "Sommerfest");
      expect(cancelled?.cancelledAt).toBeInstanceOf(Date);
      const all = JSON.stringify(result);
      expect(all).not.toContain("mbr_other");
    });

    it("exposes waitlist position", async () => {
      const id = await published("Voll");
      await registerMember(t.db, id, "mbr_me");
      await t.client`UPDATE event_registrations SET waitlist_position = 2 WHERE member_id = 'mbr_me'`;

      const result = await exportParticipationForMember(t.db, "mbr_me");

      expect(result.registrations[0]?.waitlistPosition).toBe(2);
    });

    it("returns own attendance rows and omits the checker's identity", async () => {
      const ev = await createEvent(
        t.db,
        { title: "Vergangen", startsAt: future(-3), visibility: "public" },
        "usr_creator",
      );
      await t.db.insert(eventAttendance).values({
        id: "att_me",
        eventId: ev.id,
        memberId: "mbr_me",
        attended: true,
        checkedInBy: "mbr_other",
      });
      await t.db.insert(eventAttendance).values({
        id: "att_other",
        eventId: ev.id,
        memberId: "mbr_other",
        attended: true,
      });

      const result = await exportParticipationForMember(t.db, "mbr_me");

      expect(result.attendance).toHaveLength(1);
      expect(result.attendance[0]?.attended).toBe(true);
      expect(Object.keys(result.attendance[0] ?? {})).not.toContain("checkedInBy");
      expect(JSON.stringify(result)).not.toContain("mbr_other");
    });

    it("returns empty lists for a member with no participation", async () => {
      expect(await exportParticipationForMember(t.db, "mbr_me")).toEqual({
        registrations: [],
        attendance: [],
      });
    });
  });
});
