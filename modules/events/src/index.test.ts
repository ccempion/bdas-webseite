/**
 * Events integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 *
 * Applies auth + groups + members migrations because the events tables FK into
 * groups and members.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import type { EventsEvent } from "./events";
import { getEvent, type Viewer } from "./services/get";
import { listManagedEvents } from "./services/list";
import { createEvent, deleteEvent, publishEvent } from "./services/manage";
import { cancelRegistration, getMyRegistration, registerMember } from "./services/registration";

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

const ACTIVE: Viewer = {
  isActiveMember: true,
  memberGroupIds: [],
  isFederal: false,
  boardGroupIds: [],
};
const ANON_VIEWER: Viewer = {
  isActiveMember: false,
  memberGroupIds: [],
  isFederal: false,
  boardGroupIds: [],
};
const FEDERAL: Viewer = {
  isActiveMember: true,
  memberGroupIds: [],
  isFederal: true,
  boardGroupIds: [],
};

function future(daysAhead = 7): Date {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
}

describeIfDb("events integration", () => {
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
      const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  function capture(type: EventsEvent["type"]): EventsEvent[] {
    const out: EventsEvent[] = [];
    getEventBus().subscribe<EventsEvent>(type, (e) => {
      out.push(e);
    });
    return out;
  }

  async function createUser(id: string): Promise<void> {
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES (${id}, ${id + "@e2e.test"}, ${id + "@e2e.test"}, 'active')`;
  }
  async function createMember(id: string, groupId: string | null): Promise<void> {
    await createUser("usr_" + id);
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES (${id}, ${"usr_" + id}, 'Test', ${id}, ${groupId}, 'active')`;
  }

  it("createEvent creates a draft; publishEvent publishes and emits", async () => {
    const published = capture("events.event.published");
    const ev = await createEvent(t.db, { title: "Sommerfest", startsAt: future() }, "usr_creator");
    expect(ev.status).toBe("draft");

    const pub = await publishEvent(t.db, ev.id);
    expect(pub.status).toBe("published");
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ type: "events.event.published", eventId: ev.id });
  });

  it("registers up to capacity, then waitlists", async () => {
    await createMember("mem1", null);
    await createMember("mem2", null);
    await createMember("mem3", null);
    const ev = await publishEvent(
      t.db,
      (await createEvent(t.db, { title: "Workshop", startsAt: future(), capacity: 2 }, "usr_c")).id,
    );

    expect(await registerMember(t.db, ev.id, "mem1")).toEqual({
      status: "registered",
      waitlistPosition: null,
    });
    expect(await registerMember(t.db, ev.id, "mem2")).toEqual({
      status: "registered",
      waitlistPosition: null,
    });
    expect(await registerMember(t.db, ev.id, "mem3")).toEqual({
      status: "waitlisted",
      waitlistPosition: 1,
    });

    const got = await getEvent(t.db, ev.id, ACTIVE);
    expect(got).toMatchObject({ confirmedCount: 2, waitlistCount: 1 });
  });

  it("cancelling a confirmed seat auto-promotes the waitlist head and shifts positions", async () => {
    for (const m of ["mem1", "mem2", "mem3"]) await createMember(m, null);
    const ev = await publishEvent(
      t.db,
      (await createEvent(t.db, { title: "Dinner", startsAt: future(), capacity: 1 }, "usr_c")).id,
    );
    await registerMember(t.db, ev.id, "mem1"); // confirmed
    await registerMember(t.db, ev.id, "mem2"); // waitlist 1
    await registerMember(t.db, ev.id, "mem3"); // waitlist 2

    const promoted = capture("events.waitlist.promoted");
    const deregistered = capture("events.event.deregistered");

    await cancelRegistration(t.db, ev.id, "mem1");

    expect(await getMyRegistration(t.db, ev.id, "mem1")).toBeNull();
    expect((await getMyRegistration(t.db, ev.id, "mem2"))?.waitlistPosition).toBeNull(); // promoted
    expect((await getMyRegistration(t.db, ev.id, "mem3"))?.waitlistPosition).toBe(1); // shifted 2→1
    expect(promoted).toHaveLength(1);
    expect(promoted[0]).toMatchObject({ memberId: "mem2" });
    expect(deregistered).toHaveLength(1);
  });

  it("rejects registering on a draft and double registration", async () => {
    await createMember("mem1", null);
    const draft = await createEvent(t.db, { title: "Geheim", startsAt: future() }, "usr_c");
    await expect(registerMember(t.db, draft.id, "mem1")).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const open = await publishEvent(
      t.db,
      (await createEvent(t.db, { title: "Offen", startsAt: future() }, "usr_c")).id,
    );
    await registerMember(t.db, open.id, "mem1");
    await expect(registerMember(t.db, open.id, "mem1")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deleteEvent removes a draft and refuses a published event", async () => {
    const draft = await createEvent(t.db, { title: "Wegwerf", startsAt: future() }, "usr_c");
    await deleteEvent(t.db, draft.id);
    expect(await getEvent(t.db, draft.id, FEDERAL)).toBeNull();

    const pub = await publishEvent(
      t.db,
      (await createEvent(t.db, { title: "Bleibt", startsAt: future() }, "usr_c")).id,
    );
    await expect(deleteEvent(t.db, pub.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("listManagedEvents returns per-event confirmed/waitlist counts in one grouped query", async () => {
    for (const m of ["mem1", "mem2", "mem3"]) await createMember(m, null);

    // Event A: 2 confirmed, 0 waitlist, plus one cancelled seat that must NOT count.
    const a = await publishEvent(
      t.db,
      (await createEvent(t.db, { title: "Event A", startsAt: future(1), capacity: 10 }, "usr_c"))
        .id,
    );
    await registerMember(t.db, a.id, "mem1");
    await registerMember(t.db, a.id, "mem2");
    await registerMember(t.db, a.id, "mem3");
    await cancelRegistration(t.db, a.id, "mem3"); // no waitlist to promote → stays cancelled

    // Event B: capacity 1 → 1 confirmed + 1 waitlisted.
    const b = await publishEvent(
      t.db,
      (await createEvent(t.db, { title: "Event B", startsAt: future(2), capacity: 1 }, "usr_c")).id,
    );
    await registerMember(t.db, b.id, "mem1");
    await registerMember(t.db, b.id, "mem2");

    // Event C: a draft with zero registrations (federal viewer still sees it).
    const c = await createEvent(t.db, { title: "Event C", startsAt: future(3) }, "usr_c");

    const managed = await listManagedEvents(t.db, FEDERAL);
    const byId = new Map(managed.map((e) => [e.id, e]));

    expect(byId.get(a.id)).toMatchObject({ confirmedCount: 2, waitlistCount: 0 });
    expect(byId.get(b.id)).toMatchObject({ confirmedCount: 1, waitlistCount: 1 });
    expect(byId.get(c.id)).toMatchObject({ confirmedCount: 0, waitlistCount: 0 });
  });

  it("stores and reads structured content + cover + location", async () => {
    const ev = await createEvent(
      t.db,
      {
        title: "Stadtführung",
        startsAt: future(),
        summary: "Ein Rundgang durch die Altstadt",
        content: { body: { type: "doc", content: [] } },
        coverImageKey: "evt_x/cover.jpg",
        locationName: "Rathaus",
        locationLat: 51.18,
        locationLng: 6.44,
      },
      "usr_c",
    );
    await publishEvent(t.db, ev.id);
    const got = await getEvent(t.db, ev.id, ACTIVE);
    expect(got?.summary).toBe("Ein Rundgang durch die Altstadt");
    expect(got?.coverImageKey).toBe("evt_x/cover.jpg");
    expect(got?.locationName).toBe("Rathaus");
    expect(got?.locationLat).toBeCloseTo(51.18);
  });

  it("visibility: members_only is hidden from anon, public is visible", async () => {
    const membersOnly = await publishEvent(
      t.db,
      (
        await createEvent(
          t.db,
          { title: "Intern", startsAt: future(), visibility: "members_only" },
          "usr_c",
        )
      ).id,
    );
    const pub = await publishEvent(
      t.db,
      (
        await createEvent(
          t.db,
          { title: "Öffentlich", startsAt: future(), visibility: "public" },
          "usr_c",
        )
      ).id,
    );

    expect(await getEvent(t.db, membersOnly.id, ANON_VIEWER)).toBeNull();
    expect(await getEvent(t.db, membersOnly.id, ACTIVE)).not.toBeNull();
    expect(await getEvent(t.db, pub.id, ANON_VIEWER)).not.toBeNull();
  });
});
