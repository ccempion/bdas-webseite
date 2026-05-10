/**
 * Groups integration test against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { getGroupBySlug } from "./services/get.js";
import { getJoinPolicy } from "./services/join-policy.js";
import { listGroups } from "./services/list.js";
import { upsertGroupBySlug } from "./services/upsert.js";

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

describeIfDb("groups integration", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    const sql = await fs.readFile(
      path.join(__dirname, "..", "migrations", "0001_init.sql"),
      "utf8",
    );
    await t.client.unsafe(sql);
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("upsert by slug creates then updates idempotently", async () => {
    const a = await upsertGroupBySlug(t.db, {
      slug: "aachen",
      name: "BDAS Aachen",
      city: "Aachen",
      contactEmail: "aachen@bdas.de",
      instagramUrl: "https://www.instagram.com/bdas_aachen/",
    });
    expect(a.created).toBe(true);
    expect(a.group.id).toMatch(/^grp_/);

    const b = await upsertGroupBySlug(t.db, {
      slug: "aachen",
      name: "BDAS Aachen",
      city: "Aachen",
      contactEmail: "aachen@bdas.de",
      instagramUrl: "https://www.instagram.com/bdas_aachen/",
      university: "RWTH Aachen",
    });
    expect(b.created).toBe(false);
    expect(b.group.id).toBe(a.group.id);

    const fetched = await getGroupBySlug(t.db, "aachen");
    expect(fetched?.university).toBe("RWTH Aachen");
  });

  it("list orders by city then name and respects status filter", async () => {
    await upsertGroupBySlug(t.db, { slug: "berlin", name: "BDAS Berlin", city: "Berlin" });
    await upsertGroupBySlug(t.db, { slug: "aachen", name: "BDAS Aachen", city: "Aachen" });
    await upsertGroupBySlug(t.db, {
      slug: "muenchen-old",
      name: "BDAS München",
      city: "München",
      status: "dormant",
    });

    const active = await listGroups(t.db, { status: "active" });
    expect(active.map((g) => g.slug)).toEqual(["aachen", "berlin"]);

    const all = await listGroups(t.db);
    expect(all.map((g) => g.slug)).toEqual(["aachen", "berlin", "muenchen-old"]);
  });

  it("getGroupBySlug returns null for unknown slug", async () => {
    expect(await getGroupBySlug(t.db, "nope")).toBeNull();
  });

  it("getJoinPolicy is a Phase-1 stub returning { required: false }", () => {
    expect(getJoinPolicy("grp_anything")).toEqual({ required: false });
  });

  it("rejects malformed slugs", async () => {
    await expect(
      upsertGroupBySlug(t.db, { slug: "Has Spaces", name: "x", city: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
