/**
 * Groups CLI — `pnpm groups:seed` entry point.
 *
 * Reads `infra/seeds/groups.json` (or a path passed as the second arg) and
 * upserts each entry by slug. Idempotent.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

import { closeDb, getDb } from "@bdas/db";

import { upsertGroupBySlug } from "./services/upsert";

async function findRepoRoot(start: string): Promise<string> {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    try {
      await fs.access(path.join(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch {
      // climb
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate repo root from ${start}`);
}

async function main(): Promise<void> {
  const [, , subcommand, jsonPath] = process.argv;
  if (subcommand !== "seed") {
    process.stderr.write("usage: groups seed [path/to/groups.json]\n");
    process.exit(2);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = await findRepoRoot(here);
  loadEnv({ path: path.join(repoRoot, ".env.local") });
  loadEnv({ path: path.join(repoRoot, ".env") });

  const target = jsonPath
    ? path.resolve(process.cwd(), jsonPath)
    : path.join(repoRoot, "infra", "seeds", "groups.json");

  const raw = await fs.readFile(target, "utf8");
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) {
    throw new Error(`${target} must be a JSON array of group objects`);
  }

  const db = getDb();
  let created = 0;
  let updated = 0;
  for (const entry of entries) {
    const result = await upsertGroupBySlug(db, entry);
    if (result.created) created += 1;
    else updated += 1;
    process.stdout.write(
      `${result.created ? "created" : "updated"}  ${result.group.slug}  ${result.group.name}\n`,
    );
  }
  await closeDb();
  process.stdout.write(`\ndone — ${created} created, ${updated} updated\n`);
}

main().catch(async (err: unknown) => {
  process.stderr.write(`groups:seed FAILED: ${(err as Error).message}\n`);
  await closeDb().catch(() => {});
  process.exit(1);
});
