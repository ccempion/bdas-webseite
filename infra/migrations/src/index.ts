/**
 * Migration aggregator.
 *
 * Discovery rule: each module declared in `MIGRATION_MANIFEST` is expected to
 * own a `modules/<name>/migrations/` directory containing `*.sql` files.
 * Files within a module are applied in **lexical** filename order. Modules
 * themselves are applied in **manifest** order — never by directory walk —
 * so cross-module FK dependencies stay deterministic (per CLAUDE.md §3 r7).
 *
 * Each migration's identity is `<module>/<filename>`. The runner persists
 * applied migrations to a `_bdas_migrations` table and skips ones already
 * applied. Each migration runs inside its own transaction; a SQL failure
 * rolls back that one file and aborts the run.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";

import { MIGRATION_MANIFEST } from "./manifest.js";

export type DiscoveredMigration = {
  readonly module: string;
  readonly filename: string;
  readonly id: string;
  readonly absolutePath: string;
};

export type RunOptions = {
  /** Absolute path to the monorepo root (the parent of `modules/`). */
  readonly repoRoot: string;
  /** Postgres URL. Defaults to env DATABASE_URL. */
  readonly databaseUrl?: string;
  /** When true, log the plan and exit without applying. */
  readonly dryRun?: boolean;
  /** Override manifest (test only). */
  readonly manifest?: ReadonlyArray<string>;
  /** Sink for human-readable progress lines. Defaults to console.log. */
  readonly log?: (line: string) => void;
};

export type RunResult = {
  readonly applied: ReadonlyArray<DiscoveredMigration>;
  readonly skipped: ReadonlyArray<DiscoveredMigration>;
  readonly planned: ReadonlyArray<DiscoveredMigration>;
};

const TRACKING_TABLE = "_bdas_migrations";

/**
 * Discover all migrations in manifest order. Missing module folders are
 * silently skipped (Sprint 0 has zero modules; this lets the runner be a
 * no-op until the first module ships its migrations).
 */
export async function discover(
  repoRoot: string,
  manifest: ReadonlyArray<string> = MIGRATION_MANIFEST,
): Promise<DiscoveredMigration[]> {
  const out: DiscoveredMigration[] = [];
  for (const moduleName of manifest) {
    const dir = path.join(repoRoot, "modules", moduleName, "migrations");
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (err) {
      if (isNoEnt(err)) continue;
      throw err;
    }
    const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();
    for (const filename of sqlFiles) {
      out.push({
        module: moduleName,
        filename,
        id: `${moduleName}/${filename}`,
        absolutePath: path.join(dir, filename),
      });
    }
  }
  return out;
}

export async function run(opts: RunOptions): Promise<RunResult> {
  const log = opts.log ?? ((s) => console.log(s));
  const manifest = opts.manifest ?? MIGRATION_MANIFEST;
  const planned = await discover(opts.repoRoot, manifest);

  if (opts.dryRun) {
    log(`[migrate] dry-run: ${planned.length} migration(s) discovered`);
    for (const m of planned) log(`  - ${m.id}`);
    return { applied: [], skipped: [], planned };
  }

  const url = opts.databaseUrl ?? process.env["DATABASE_URL"];
  if (!url) {
    throw new Error("DATABASE_URL is not set. Set it explicitly or via env (see .env.example).");
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const applied: DiscoveredMigration[] = [];
  const skipped: DiscoveredMigration[] = [];
  try {
    await ensureTrackingTable(client);
    const alreadyApplied = await loadApplied(client);

    for (const m of planned) {
      if (alreadyApplied.has(m.id)) {
        skipped.push(m);
        log(`[migrate] skip  ${m.id}`);
        continue;
      }
      const sql = await fs.readFile(m.absolutePath, "utf8");
      await client.begin(async (tx) => {
        await tx.unsafe(sql);
        await tx`
          INSERT INTO ${tx(TRACKING_TABLE)} (id, module, filename, applied_at)
          VALUES (${m.id}, ${m.module}, ${m.filename}, now())
        `;
      });
      applied.push(m);
      log(`[migrate] apply ${m.id}`);
    }
  } finally {
    await client.end();
  }

  return { applied, skipped, planned };
}

async function ensureTrackingTable(client: Sql): Promise<void> {
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      id          text PRIMARY KEY,
      module      text NOT NULL,
      filename    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadApplied(client: Sql): Promise<Set<string>> {
  const rows = await client<{ id: string }[]>`
    SELECT id FROM ${client(TRACKING_TABLE)}
  `;
  return new Set(rows.map((r) => r.id));
}

function isNoEnt(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ENOENT"
  );
}

export { MIGRATION_MANIFEST } from "./manifest.js";
