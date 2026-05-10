/**
 * CLI entry point: `pnpm db:migrate` and `pnpm db:migrate:dry`.
 *
 * Resolves repo root by walking up from this file until it finds a
 * `pnpm-workspace.yaml`. That avoids relying on PWD or env shenanigans.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

import { run } from "./index.js";

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
  throw new Error(`Could not locate repo root (pnpm-workspace.yaml) from ${start}`);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = await findRepoRoot(here);

  // Load .env.local then .env from the repo root (CI relies on real env vars
  // and is unaffected because dotenv never overwrites existing keys).
  loadEnv({ path: path.join(repoRoot, ".env.local") });
  loadEnv({ path: path.join(repoRoot, ".env") });

  const result = await run({ repoRoot, dryRun });
  if (dryRun) {
    process.stdout.write(`[migrate] dry-run complete (${result.planned.length} planned)\n`);
    return;
  }
  process.stdout.write(
    `[migrate] done. applied=${result.applied.length} skipped=${result.skipped.length}\n`,
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`[migrate] FAILED: ${(err as Error).message}\n`);
  process.exit(1);
});
