/**
 * Cron endpoint: auth + flag gate need no database; the scoping tests run the
 * real engine against real Postgres (CLAUDE.md §4) with only the auth tables,
 * so any request the route wrongly picked up would fail its first module step
 * and show up as a 500.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";

const current: { t: TestDb | null } = { t: null };

vi.mock("@bdas/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDb: () => {
    if (!current.t) throw new Error("no test db");
    return current.t.db;
  },
}));

// Wiring only (storage driver, notifier, bus subscriptions); the engine and
// the database stay real.
vi.mock("../../../../lib/files-bootstrap", () => ({ bootFiles: async () => {} }));
vi.mock("../../../../lib/notifications-bootstrap", () => ({ bootNotifications: () => {} }));
vi.mock("../../../../lib/newsletter-bootstrap", () => ({ bootNewsletter: () => {} }));

import { GET } from "./route";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_MIGRATIONS = path.join(__dirname, "../../../../../../modules/auth/migrations");
const URL = "http://x/api/cron/account-deletion-sweep";
const AUTHED = { authorization: "Bearer s3cret" };
const DAY_MS = 24 * 60 * 60 * 1000;
const FLAGS = [
  "BDAS_FLAG_ACCOUNT_DELETION",
  "BDAS_FLAG_FILES",
  "BDAS_FLAG_NOTIFICATIONS",
  "BDAS_FLAG_NEWSLETTER",
];

async function dbReachable(): Promise<boolean> {
  const url = process.env["DATABASE_URL"] ?? "postgres://bdas:bdas@localhost:5432/bdas";
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

describe("account-deletion-sweep cron auth + flag gate", () => {
  beforeEach(() => {
    process.env["CRON_SECRET"] = "s3cret";
    delete process.env["BDAS_FLAG_ACCOUNT_DELETION"];
  });
  afterEach(() => {
    delete process.env["CRON_SECRET"];
    delete process.env["BDAS_FLAG_ACCOUNT_DELETION"];
  });

  it("401s without a bearer token", async () => {
    expect((await GET(new Request(URL))).status).toBe(401);
  });

  it("401s with the wrong token", async () => {
    const res = await GET(new Request(URL, { headers: { authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
  });

  it("401s when CRON_SECRET is unset, even for an empty or matching-looking header", async () => {
    delete process.env["CRON_SECRET"];
    for (const authorization of ["Bearer ", "Bearer undefined", "Bearer"]) {
      const res = await GET(new Request(URL, { headers: { authorization } }));
      expect(res.status).toBe(401);
    }
  });

  it("skips (200) with a valid token when the account_deletion flag is off", async () => {
    const res = await GET(new Request(URL, { headers: AUTHED }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "account_deletion flag off" });
  });
});

describeIfDb("account-deletion-sweep cron scoping", () => {
  let t: TestDb;

  beforeEach(async () => {
    process.env["CRON_SECRET"] = "s3cret";
    for (const f of FLAGS) process.env[f] = "true";
    t = await createTestDb();
    current.t = t;
    for (const file of (await fs.readdir(AUTH_MIGRATIONS)).sort()) {
      await t.client.unsafe(await fs.readFile(path.join(AUTH_MIGRATIONS, file), "utf8"));
    }
  });
  afterEach(async () => {
    current.t = null;
    await t.cleanup();
    delete process.env["CRON_SECRET"];
    for (const f of FLAGS) delete process.env[f];
  });

  async function seed(id: string, opts: { status: string; dueInDays: number; email: string }) {
    const userStatus = opts.status === "cancelled" ? "active" : "pending_deletion";
    await t.client.unsafe(
      `insert into auth_users (id, email_normalized, email_display, status) values ($1, $2, $2, $3)`,
      [`usr_${id}`, opts.email, userStatus],
    );
    await t.client.unsafe(
      `insert into account_deletion_requests
         (id, user_id, email_snapshot, name_snapshot, requested_at, scheduled_purge_at, status)
       values ($1, $2, $3, 'Name Geheim', now() - interval '30 days', $4, $5)`,
      [
        `adr_${id}`,
        `usr_${id}`,
        opts.email,
        new Date(Date.now() + opts.dueInDays * DAY_MS).toISOString(),
        opts.status,
      ],
    );
  }

  const statusOf = async (id: string) =>
    (
      await t.client.unsafe(`select status from account_deletion_requests where id = $1`, [
        `adr_${id}`,
      ])
    )[0]?.["status"];

  it("200 with zeros on an empty table", async () => {
    const res = await GET(new Request(URL, { headers: AUTHED }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0, completed: 0, failed: [] });
  });

  it("leaves not-yet-due, cancelled and completed requests untouched", async () => {
    await seed("later", { status: "pending", dueInDays: 5, email: "later@example.de" });
    await seed("cancelled", { status: "cancelled", dueInDays: -1, email: "cancelled@example.de" });
    await seed("done", { status: "completed", dueInDays: -9, email: "done@example.de" });

    const res = await GET(new Request(URL, { headers: AUTHED }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0, completed: 0, failed: [] });
    expect(await statusOf("later")).toBe("pending");
    expect(await statusOf("cancelled")).toBe("cancelled");
    expect(await statusOf("done")).toBe("completed");
    const users = await t.client.unsafe(`select count(*)::int as n from auth_users`);
    expect(users[0]?.["n"]).toBe(3);
  });

  it.each(["BDAS_FLAG_FILES", "BDAS_FLAG_NOTIFICATIONS", "BDAS_FLAG_NEWSLETTER"])(
    "touches nothing and 500s when %s is off",
    async (flag) => {
      delete process.env[flag];
      await seed("due", { status: "pending", dueInDays: -1, email: "due@example.de" });

      const res = await GET(new Request(URL, { headers: AUTHED }));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: "prerequisite flags off",
        missing: [flag.replace("BDAS_FLAG_", "").toLowerCase()],
      });
      expect(await statusOf("due")).toBe("pending");
      const still = await t.client.unsafe(`select 1 from auth_users where id = 'usr_due'`);
      expect(still).toHaveLength(1);
    },
  );

  it("500s for a due request whose step fails, exposing only requestId and step", async () => {
    await seed("due", { status: "pending", dueInDays: -1, email: "due@example.de" });
    await seed("later", { status: "pending", dueInDays: 5, email: "later@example.de" });

    const res = await GET(new Request(URL, { headers: AUTHED }));

    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      processed: number;
      completed: number;
      failed: Record<string, unknown>[];
    };
    expect(body.processed).toBe(1);
    expect(body.completed).toBe(0);
    expect(body.failed).toHaveLength(1);
    expect(Object.keys(body.failed[0]!).sort()).toEqual(["requestId", "step"]);
    expect(body.failed[0]).toMatchObject({ requestId: "adr_due", step: "blog" });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("example.de");
    expect(raw).not.toContain("Geheim");
    // the not-yet-due one was not claimed, the due one still has its user
    expect(await statusOf("later")).toBe("pending");
    const still = await t.client.unsafe(`select 1 from auth_users where id = 'usr_due'`);
    expect(still).toHaveLength(1);
  });
});
