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
import { getEventBus, resetEventBus } from "@bdas/events";

import { setNotifier, type OutboundEmail } from "./notifier";
import { setRecipientResolver } from "./resolver";
import { notificationLog } from "./schema";
import { sendOrganizerMessage } from "./services/broadcast";
import { sendTransactional } from "./services/send";
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

describeIfDb("notifications integration", () => {
  let t: TestDb;
  let sent: OutboundEmail[];

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0004_location.sql"],
      ["..", "..", "members", "migrations", "0001_init.sql"],
      // The change/cancellation subscribers read the events roster, so this
      // suite needs the events tables too.
      ["..", "..", "events", "migrations", "0001_init.sql"],
      ["..", "..", "events", "migrations", "0002_event_pages.sql"],
      ["..", "..", "events", "migrations", "0003_guest_registration.sql"],
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
        return { email: "mara@example.org", firstName: "Mara" };
      },
    });
  });

  afterEach(async () => {
    unregisterNotificationSubscribers();
    resetEventBus();
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

  it("sends via the events bus when a registration event is published", async () => {
    const memberId = await seedMember();

    resetEventBus();
    registerNotificationSubscribers(t.db, { siteUrl: "https://dashboard.bdas.de" });
    await getEventBus().publish({
      type: "events.event.registered",
      eventId: "evt_1",
      memberId,
      waitlisted: true,
      at: new Date(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("Warteliste");
    // The subscriber builds the event link from siteUrl + eventId and threads it
    // through to the rendered email so the recipient can cancel their spot.
    expect(sent[0]?.text).toContain("https://dashboard.bdas.de/events/evt_1");

    const rows = await t.db.select().from(notificationLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.template).toBe("event_waitlisted");

    unregisterNotificationSubscribers();
  });

  it("registration event for a guest emails the guest with a self-cancel link, null member_id", async () => {
    resetEventBus();
    registerNotificationSubscribers(t.db, { siteUrl: "https://dashboard.bdas.de" });
    await getEventBus().publish({
      type: "events.event.registered",
      eventId: "evt_g",
      memberId: null,
      guestEmail: "gast@example.org",
      guestName: "Gast",
      guestCancelToken: "gtok_abc",
      waitlisted: false,
      at: new Date(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("gast@example.org");
    expect(sent[0]?.subject).toContain("Anmeldung");
    expect(sent[0]?.text).toContain(
      "https://dashboard.bdas.de/events/evt_g/gast-abmelden?token=gtok_abc",
    );

    const rows = await t.db.select().from(notificationLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.memberId).toBeNull();
    expect(rows[0]?.toEmail).toBe("gast@example.org");

    unregisterNotificationSubscribers();
  });

  /** Seed an auth_user + member with a unique suffix. */
  async function seedMemberN(n: number): Promise<string> {
    const userId = `usr_r_${n}`;
    const memberId = `mbr_r_${n}`;
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES (${userId}, ${`r${n}@example.org`}, ${`r${n}@example.org`}, 'active')`;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, status)
      VALUES (${memberId}, ${userId}, 'R', ${String(n)}, 'active')`;
    return memberId;
  }

  /** Seed a published event with one confirmed + one waitlisted registration. */
  async function seedRoster(eventId: string): Promise<string[]> {
    await t.client`
      INSERT INTO events (id, title, starts_at, status, visibility, created_by)
      VALUES (${eventId}, 'Sommerfest', now() + interval '7 days', 'published', 'public', 'usr_seed')`;
    const m1 = await seedMemberN(1);
    const m2 = await seedMemberN(2);
    await t.client`
      INSERT INTO event_registrations (id, event_id, member_id, waitlist_position)
      VALUES ('ereg_1', ${eventId}, ${m1}, NULL)`;
    await t.client`
      INSERT INTO event_registrations (id, event_id, member_id, waitlist_position)
      VALUES ('ereg_2', ${eventId}, ${m2}, 1)`;
    // A guest registrant (no member_id) — fan-out must reach them too.
    await t.client`
      INSERT INTO event_registrations (id, event_id, guest_name, guest_email, waitlist_position)
      VALUES ('ereg_3', ${eventId}, 'Gast Drei', 'gast3@example.org', NULL)`;
    return [m1, m2];
  }

  it("event.updated fans out an event_changed email to every active registrant", async () => {
    const eventId = "evt_upd";
    await seedRoster(eventId);

    resetEventBus();
    registerNotificationSubscribers(t.db, { siteUrl: "https://dashboard.bdas.de" });
    await getEventBus().publish({
      type: "events.event.updated",
      eventId,
      changed: ["time"],
      at: new Date(),
    });

    expect(sent).toHaveLength(3);
    expect(sent.some((s) => s.subject.includes("Änderung"))).toBe(true);
    expect(sent.map((s) => s.to)).toContain("gast3@example.org");
    const rows = await t.db.select().from(notificationLog);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.template === "event_changed")).toBe(true);
    // The guest row is logged with a null member_id.
    expect(rows.some((r) => r.toEmail === "gast3@example.org" && r.memberId === null)).toBe(true);

    unregisterNotificationSubscribers();
  });

  it("event.cancelled fans out an event_cancelled email to every active registrant", async () => {
    const eventId = "evt_cxl";
    await seedRoster(eventId);

    resetEventBus();
    registerNotificationSubscribers(t.db);
    await getEventBus().publish({ type: "events.event.cancelled", eventId, at: new Date() });

    expect(sent).toHaveLength(3);
    expect(sent[0]?.subject).toContain("abgesagt");
    expect(sent.map((s) => s.to)).toContain("gast3@example.org");
    const rows = await t.db.select().from(notificationLog);
    expect(rows.every((r) => r.template === "event_cancelled")).toBe(true);

    unregisterNotificationSubscribers();
  });

  it("sendOrganizerMessage sends one logged email per member id", async () => {
    const ids = [await seedMemberN(1), await seedMemberN(2)];

    const result = await sendOrganizerMessage(t.db, {
      memberIds: ids,
      eventTitle: "Sommerfest",
      eventId: "evt_1",
      subject: "Wichtige Info",
      body: "Bitte denkt an euren Ausweis.",
    });

    expect(result).toMatchObject({ sent: 2, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(2);
    expect(sent[0]?.subject).toBe("Wichtige Info");
    const rows = await t.db.select().from(notificationLog);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.template === "event_organizer_message")).toBe(true);
  });

  it("emails the new organizer on members.role.granted, and ignores other roles", async () => {
    const sent: OutboundEmail[] = [];
    setNotifier({
      async send(m: OutboundEmail) {
        sent.push(m);
      },
    });
    setRecipientResolver({
      async resolve() {
        return { email: "org@example.de", firstName: "Mara" };
      },
    });
    registerNotificationSubscribers(t.db, { siteUrl: "https://dashboard.bdas.de" });

    // A non-organizer role grant must NOT send an organizer email.
    await getEventBus().publish({
      type: "members.role.granted",
      memberId: "mem_x",
      role: "local_board",
      groupId: "grp_a",
      actorUserId: "usr_lead",
      at: new Date(),
    });
    expect(sent).toHaveLength(0);

    await getEventBus().publish({
      type: "members.role.granted",
      memberId: "mem_x",
      role: "event_organizer",
      groupId: "grp_a",
      actorUserId: "usr_lead",
      at: new Date(),
    });
    await new Promise((r) => setTimeout(r, 0)); // let the async handler settle
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toContain("Organisator");

    unregisterNotificationSubscribers();
  });

  it("a failing handler does not reject the bus publish (producer is protected)", async () => {
    const memberId = await seedMember();
    setRecipientResolver({
      async resolve(): Promise<RecipientContact | null> {
        throw new Error("resolver boom");
      },
    });

    resetEventBus();
    registerNotificationSubscribers(t.db);

    // The events producer publishes after commit, so a thrown handler must not
    // surface here — `safe()` swallows it. publish() must resolve, not reject.
    await expect(
      getEventBus().publish({
        type: "events.event.registered",
        eventId: "evt_1",
        memberId,
        waitlisted: false,
        at: new Date(),
      }),
    ).resolves.toBeUndefined();

    expect(sent).toHaveLength(0);
    const rows = await t.db.select().from(notificationLog);
    expect(rows).toHaveLength(0);

    unregisterNotificationSubscribers();
  });
});
