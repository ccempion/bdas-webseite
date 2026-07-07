/**
 * listUpcomingEvents / listPastEvents split against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable (CI provides Postgres).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { ANON, type Viewer } from "./get";
import { listPastEvents, listUpcomingEvents } from "./list";
import { createEvent, publishEvent } from "./manage";

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
const FEDERAL: Viewer = {
  isActiveMember: true,
  memberGroupIds: [],
  isFederal: true,
  boardGroupIds: [],
  organizerGroupIds: [],
};

describeIfDb("listUpcomingEvents / listPastEvents", () => {
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
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", ...file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  async function publishPublic(title: string, startsAt: Date): Promise<string> {
    const ev = await createEvent(
      t.db,
      { title, startsAt, visibility: "public" },
      "usr_creator",
    );
    await publishEvent(t.db, ev.id);
    return ev.id;
  }

  it("partitions published events by start time", async () => {
    const pastId = await publishPublic("Rückblick", days(-5));
    const futureId = await publishPublic("Ausblick", days(5));

    const upcoming = await listUpcomingEvents(t.db, FEDERAL);
    const past = await listPastEvents(t.db, FEDERAL);

    expect(upcoming.map((e) => e.id)).toEqual([futureId]);
    expect(past.map((e) => e.id)).toEqual([pastId]);
  });

  it("orders past events newest-first", async () => {
    const older = await publishPublic("Älter", days(-10));
    const newer = await publishPublic("Neuer", days(-2));

    const past = await listPastEvents(t.db, FEDERAL);
    expect(past.map((e) => e.id)).toEqual([newer, older]);
  });

  it("applies the visibility filter to past events", async () => {
    const publicId = await publishPublic("Offen", days(-3));
    const members = await createEvent(
      t.db,
      { title: "Intern", startsAt: days(-3), visibility: "members_only" },
      "usr_creator",
    );
    await publishEvent(t.db, members.id);

    const anonPast = await listPastEvents(t.db, ANON);
    expect(anonPast.map((e) => e.id)).toEqual([publicId]);
  });
});
