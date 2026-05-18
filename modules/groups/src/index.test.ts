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
import { getEventBus, resetEventBus } from "@bdas/events";

import type { GroupEvent } from "./events";
import { getGroup, getGroupBySlug } from "./services/get";
import { getJoinPolicy } from "./services/join-policy";
import { listGroups } from "./services/list";
import { archiveGroup, createGroup, updateGroup } from "./services/manage";
import { upsertGroupBySlug } from "./services/upsert";

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
    for (const file of [
      "0001_init.sql",
      "0002_status_check.sql",
      "0003_drop_university_description.sql",
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
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
      contactEmail: "kontakt@bdas-aachen.de",
      instagramUrl: "https://www.instagram.com/bdas_aachen/",
    });
    expect(b.created).toBe(false);
    expect(b.group.id).toBe(a.group.id);

    const fetched = await getGroupBySlug(t.db, "aachen");
    expect(fetched?.contactEmail).toBe("kontakt@bdas-aachen.de");
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

  it("createGroup inserts and emits groups.group.created", async () => {
    const seen: GroupEvent[] = [];
    getEventBus().subscribe<GroupEvent>("groups.group.created", (e) => {
      seen.push(e);
    });

    const g = await createGroup(t.db, {
      slug: "koeln",
      name: "BDAS Köln",
      city: "Köln",
      contactEmail: "koeln@bdas.de",
    });

    expect(g.id).toMatch(/^grp_/);
    expect(g.status).toBe("active");
    expect(await getGroupBySlug(t.db, "koeln")).toMatchObject({ name: "BDAS Köln" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: "groups.group.created", slug: "koeln" });
  });

  it("createGroup rejects a duplicate slug with CONFLICT", async () => {
    await createGroup(t.db, { slug: "hamburg", name: "BDAS Hamburg", city: "Hamburg" });
    await expect(
      createGroup(t.db, { slug: "hamburg", name: "Andere", city: "Hamburg" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("updateGroup edits by id and keeps the slug immutable", async () => {
    const created = await createGroup(t.db, {
      slug: "dresden",
      name: "BDAS Dresden",
      city: "Dresden",
    });

    const updated = await updateGroup(t.db, created.id, {
      name: "BDAS Dresden e.V.",
      city: "Dresden Neustadt",
    });

    expect(updated.slug).toBe("dresden");
    expect(updated.name).toBe("BDAS Dresden e.V.");
    expect(updated.city).toBe("Dresden Neustadt");
    // Same row, not a fork.
    expect((await listGroups(t.db)).filter((x) => x.slug === "dresden")).toHaveLength(1);
  });

  it("updateGroup throws NOT_FOUND for an unknown id", async () => {
    await expect(
      updateGroup(t.db, "grp_does_not_exist", { name: "Nirgendwo", city: "Nirgendwo" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("archiveGroup sets archived, emits the event, and drops from the active list", async () => {
    const seen: GroupEvent[] = [];
    getEventBus().subscribe<GroupEvent>("groups.group.archived", (e) => {
      seen.push(e);
    });

    const g = await createGroup(t.db, { slug: "jena", name: "BDAS Jena", city: "Jena" });
    const archived = await archiveGroup(t.db, g.id);

    expect(archived.status).toBe("archived");
    expect((await getGroup(t.db, g.id))?.status).toBe("archived");
    expect((await listGroups(t.db, { status: "active" })).map((x) => x.slug)).not.toContain("jena");
    expect(seen).toMatchObject([{ type: "groups.group.archived", slug: "jena" }]);
  });

  it("the DB CHECK constraint rejects a status outside the allowed set", async () => {
    await expect(
      t.client`insert into groups (id, slug, name, city, status)
               values ('grp_bad', 'bad', 'Bad', 'Nowhere', 'bogus')`,
    ).rejects.toThrow();
  });
});
