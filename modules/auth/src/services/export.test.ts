/**
 * getUserEmails integration test — real Postgres per CLAUDE.md §4. Skipped
 * when DATABASE_URL is unreachable, like the other service tests here.
 *
 * The batch reader exists for one caller: the newsletter board list resolves
 * every account address on the page at once. Read one at a time it would be a
 * query per subscriber.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { createTestDb, type TestDb } from "@bdas/db/test";

import { authUsers } from "../schema";
import { getUserEmails } from "./export";

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

describeIfDb("getUserEmails", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of ["0001_init.sql", "0002_consent.sql", "0003_email_change.sql"]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
  });

  afterEach(async () => {
    await t.cleanup();
  });

  const seed = (id: string, display: string) =>
    t.db.insert(authUsers).values({
      id,
      emailNormalized: display.toLowerCase(),
      emailDisplay: display,
      status: "active",
    });

  it("returns one entry per known id in a single call", async () => {
    await seed("u_a", "Ayse@Example.de");
    await seed("u_b", "Baran@Example.de");

    const map = await getUserEmails(t.db, ["u_a", "u_b"]);

    expect(map.size).toBe(2);
    // The address as the person wrote it, not the normalised duplicate key —
    // this is what gets shown and exported.
    expect(map.get("u_a")).toBe("Ayse@Example.de");
    expect(map.get("u_b")).toBe("Baran@Example.de");
  });

  it("leaves an unknown id out rather than mapping it to undefined", async () => {
    await seed("u_a", "Ayse@Example.de");

    const map = await getUserEmails(t.db, ["u_a", "u_ghost"]);

    expect(map.size).toBe(1);
    expect(map.has("u_ghost")).toBe(false);
  });

  it("answers an empty list without touching the database", async () => {
    // `inArray(x, [])` is not portable — depending on the driver it becomes
    // `false` or a syntax error. The caller passes an empty array whenever a
    // page happens to hold only anonymous rows, which is an ordinary state,
    // not an edge case.
    const map = await getUserEmails(t.db, []);
    expect(map.size).toBe(0);
  });

  it("does not care about the order it is asked in", async () => {
    await seed("u_a", "Ayse@Example.de");
    await seed("u_b", "Baran@Example.de");

    const map = await getUserEmails(t.db, ["u_b", "u_a", "u_b"]);
    expect([...map.keys()].sort()).toEqual(["u_a", "u_b"]);
  });
});
