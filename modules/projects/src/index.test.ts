/**
 * Projects integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 *
 * Applies the full groups migration chain because projects.group_id FKs into
 * groups(id) and group enrichment reads the groups schema as Drizzle declares
 * it — including columns added after 0001 — then the projects migration.
 * Owning groups are seeded with raw SQL.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import type { ProjectsEvent } from "./events";
import { getProject } from "./services/get";
import { listProjects } from "./services/list";
import { adoptProject, createProject, updateProject } from "./services/manage";

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

describeIfDb("projects integration", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0002_status_check.sql"],
      ["..", "..", "groups", "migrations", "0003_drop_university_description.sql"],
      ["..", "..", "groups", "migrations", "0004_location.sql"],
      ["..", "..", "groups", "migrations", "0005_image_key.sql"],
      ["..", "migrations", "0001_init.sql"],
    ]) {
      const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  function capture(type: ProjectsEvent["type"]): ProjectsEvent[] {
    const out: ProjectsEvent[] = [];
    getEventBus().subscribe<ProjectsEvent>(type, (e) => {
      out.push(e);
    });
    return out;
  }

  async function seedGroup(id: string, slug: string, name: string): Promise<void> {
    await t.client`
      INSERT INTO groups (id, slug, name, city, status)
      VALUES (${id}, ${slug}, ${name}, 'Aachen', 'active')`;
  }

  it("createProject inserts, enriches the group, defaults status, and emits", async () => {
    await seedGroup("grp_aachen", "aachen", "BDAS Aachen");
    const created = capture("projects.project.created");

    const p = await createProject(
      t.db,
      { groupId: "grp_aachen", title: "Nowruz-Fest", topic: "kultur" },
      "usr_board",
    );

    expect(p.id).toMatch(/^prj_/);
    expect(p.status).toBe("active");
    expect(p.groupName).toBe("BDAS Aachen");
    expect(p.groupSlug).toBe("aachen");
    expect(p.adoptedFromProjectId).toBeNull();
    expect(p.artifactFileIds).toEqual([]);
    expect(created).toMatchObject([
      { type: "projects.project.created", projectId: p.id, groupId: "grp_aachen" },
    ]);
  });

  it("createProject rejects a non-existent owning group with NOT_FOUND", async () => {
    await expect(
      createProject(t.db, { groupId: "grp_ghost", title: "Geisterprojekt" }, "usr_board"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("createProject rejects a too-short title with VALIDATION", async () => {
    await seedGroup("grp_aachen", "aachen", "BDAS Aachen");
    await expect(
      createProject(t.db, { groupId: "grp_aachen", title: "x" }, "usr_board"),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("updateProject edits, keeps the owning group, and emits", async () => {
    await seedGroup("grp_aachen", "aachen", "BDAS Aachen");
    const updated = capture("projects.project.updated");
    const p = await createProject(
      t.db,
      { groupId: "grp_aachen", title: "Lerngruppe" },
      "usr_board",
    );

    const edited = await updateProject(t.db, p.id, {
      title: "Lerngruppe Mathe",
      status: "completed",
      topic: "bildung",
    });

    expect(edited.groupId).toBe("grp_aachen");
    expect(edited.title).toBe("Lerngruppe Mathe");
    expect(edited.status).toBe("completed");
    expect(edited.topic).toBe("bildung");
    expect(updated).toMatchObject([{ type: "projects.project.updated", projectId: p.id }]);
  });

  it("updateProject throws NOT_FOUND for an unknown id", async () => {
    await expect(updateProject(t.db, "prj_missing", { title: "Nirgendwo" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("getProject returns the enriched project, null for unknown", async () => {
    await seedGroup("grp_aachen", "aachen", "BDAS Aachen");
    const p = await createProject(t.db, { groupId: "grp_aachen", title: "Mentoring" }, "usr_board");

    const fetched = await getProject(t.db, p.id);
    expect(fetched).toMatchObject({ id: p.id, title: "Mentoring", groupSlug: "aachen" });
    expect(await getProject(t.db, "prj_nope")).toBeNull();
  });

  it("listProjects filters by group and topic and enriches group refs", async () => {
    await seedGroup("grp_aachen", "aachen", "BDAS Aachen");
    await seedGroup("grp_koeln", "koeln", "BDAS Köln");
    await createProject(
      t.db,
      { groupId: "grp_aachen", title: "Kultur A", topic: "kultur" },
      "usr_a",
    );
    await createProject(
      t.db,
      { groupId: "grp_aachen", title: "Bildung A", topic: "bildung" },
      "usr_a",
    );
    await createProject(
      t.db,
      { groupId: "grp_koeln", title: "Kultur K", topic: "kultur" },
      "usr_k",
    );

    const all = await listProjects(t.db);
    expect(all).toHaveLength(3);
    expect(new Set(all.map((p) => p.groupName))).toEqual(new Set(["BDAS Aachen", "BDAS Köln"]));

    const aachen = await listProjects(t.db, { groupId: "grp_aachen" });
    expect(new Set(aachen.map((p) => p.title))).toEqual(new Set(["Kultur A", "Bildung A"]));

    const kultur = await listProjects(t.db, { topic: "kultur" });
    expect(new Set(kultur.map((p) => p.title))).toEqual(new Set(["Kultur A", "Kultur K"]));

    const both = await listProjects(t.db, { groupId: "grp_koeln", topic: "kultur" });
    expect(both.map((p) => p.title)).toEqual(["Kultur K"]);
  });

  it("adoptProject forks a copy to the target group with provenance", async () => {
    await seedGroup("grp_aachen", "aachen", "BDAS Aachen");
    await seedGroup("grp_koeln", "koeln", "BDAS Köln");
    const adopted = capture("projects.project.adopted");

    const source = await createProject(
      t.db,
      {
        groupId: "grp_aachen",
        title: "Erstsemester-Café",
        topic: "soziales",
        contact: "vorstand@aachen.de",
        status: "completed",
        artifactFileIds: ["fil_flyer"],
      },
      "usr_aachen",
    );

    const copy = await adoptProject(t.db, source.id, "grp_koeln", "usr_koeln");

    expect(copy.id).not.toBe(source.id);
    expect(copy.groupId).toBe("grp_koeln");
    expect(copy.groupSlug).toBe("koeln");
    expect(copy.title).toBe("Erstsemester-Café");
    expect(copy.topic).toBe("soziales");
    expect(copy.contact).toBe("vorstand@aachen.de");
    expect(copy.createdBy).toBe("usr_koeln");
    expect(copy.adoptedFromProjectId).toBe(source.id);
    // status reset to default; source artifacts not carried over.
    expect(copy.status).toBe("active");
    expect(copy.artifactFileIds).toEqual([]);
    expect(adopted).toMatchObject([
      { type: "projects.project.adopted", projectId: copy.id, adoptedFromProjectId: source.id },
    ]);
  });

  it("adoptProject rejects a non-existent target group with NOT_FOUND", async () => {
    await seedGroup("grp_aachen", "aachen", "BDAS Aachen");
    const source = await createProject(t.db, { groupId: "grp_aachen", title: "Workshop" }, "usr_a");
    await expect(adoptProject(t.db, source.id, "grp_ghost", "usr_x")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("the DB CHECK constraint rejects a status outside the allowed set", async () => {
    await seedGroup("grp_aachen", "aachen", "BDAS Aachen");
    await expect(
      t.client`insert into projects (id, group_id, title, status, created_by)
               values ('prj_bad', 'grp_aachen', 'Bad', 'bogus', 'usr_x')`,
    ).rejects.toThrow();
  });
});
