import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discover, run } from "./index.js";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bdas-mig-"));
  await fs.mkdir(path.join(tmpRoot, "modules"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

async function writeMigration(moduleName: string, filename: string, body: string): Promise<void> {
  const dir = path.join(tmpRoot, "modules", moduleName, "migrations");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), body, "utf8");
}

describe("discover", () => {
  it("returns nothing when no module folders exist", async () => {
    const result = await discover(tmpRoot, ["auth", "members"]);
    expect(result).toEqual([]);
  });

  it("orders by manifest, then lexically by filename", async () => {
    await writeMigration("members", "0001_init.sql", "select 1;");
    await writeMigration("members", "0002_add.sql", "select 2;");
    await writeMigration("auth", "0001_init.sql", "select 3;");

    const result = await discover(tmpRoot, ["auth", "members"]);
    expect(result.map((m) => m.id)).toEqual([
      "auth/0001_init.sql",
      "members/0001_init.sql",
      "members/0002_add.sql",
    ]);
  });

  it("ignores non-sql files", async () => {
    await writeMigration("auth", "0001_init.sql", "select 1;");
    await writeMigration("auth", "README.md", "notes");

    const result = await discover(tmpRoot, ["auth"]);
    expect(result.map((m) => m.filename)).toEqual(["0001_init.sql"]);
  });

  it("silently skips modules with no migrations folder", async () => {
    await writeMigration("auth", "0001_init.sql", "select 1;");
    const result = await discover(tmpRoot, ["auth", "members", "groups"]);
    expect(result.map((m) => m.module)).toEqual(["auth"]);
  });
});

describe("run (dry-run)", () => {
  it("reports the plan without touching a database", async () => {
    await writeMigration("auth", "0001_init.sql", "select 1;");
    await writeMigration("groups", "0001_init.sql", "select 2;");

    const lines: string[] = [];
    const result = await run({
      repoRoot: tmpRoot,
      dryRun: true,
      manifest: ["auth", "groups"],
      log: (l) => lines.push(l),
    });

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.planned.map((m) => m.id)).toEqual(["auth/0001_init.sql", "groups/0001_init.sql"]);
    expect(lines.some((l) => l.includes("dry-run"))).toBe(true);
  });
});
