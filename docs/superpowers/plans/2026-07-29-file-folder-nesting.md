# File Folder Nesting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a group's Vorstand create, rename, and delete subfolders inside the four system-provisioned folders, with subfolders permanently inheriting their parent's permissions.

**Architecture:** `folders` gains `parent_id` and `depth`. A child row **copies** its parent's `scope` and `group_id`, enforced by a database trigger. Because inherited permissions are denormalised onto every row, `permissions.ts` is not touched at all — `canRead`/`canWrite` already return the correct answer for a folder five levels deep. Three new services (`createFolder`, `renameFolder`, `deleteFolder`) gate on the existing `canWrite(parent)`; no new role logic exists anywhere in this plan.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Components + Server Actions), PostgreSQL via Drizzle ORM, vitest (unit + integration against Docker Postgres), Tailwind via `@bdas/design-system` tokens.

**Source spec:** `docs/superpowers/specs/2026-07-29-file-nesting-and-preview-design.md` (decisions D1–D5). This plan implements **PR 1 only**. PRs 2–4 (inline preview, search/quota/recency, trash) get their own plans.

## Global Constraints

- **Modular rule 8:** the module's public surface is `modules/files/src/index.ts`. Anything not re-exported there is private and must not be imported from `apps/web`.
- **Modular rule 1:** `@bdas/files` owns `folders`, `files`, `file_access_log`. No other module reads or writes them.
- **Modular rule 7:** migrations live in `modules/files/migrations/` and are named `NNNN_snake_case.sql`. The runner discovers `*.sql` at the top level of that folder only.
- **Design tokens only.** Never inline a hex, radius, shadow, or duration. Use the existing Tailwind token classes (`rounded-bdas`, `border-bdas-soft`, `bg-bdas-surface`, `shadow-bdas-card`, `text-bdas-ink`, `text-bdas-ink-body`, `text-bdas-ink-muted`, `text-bdas-red`, `duration-bdas-card`, `ease-bdas`). If a value is missing, raise it — do not add an ad-hoc one.
- **All user-facing copy is German.** Error messages are thrown from the service layer in German and surfaced verbatim by the UI (existing pattern: `"Kein Schreibzugriff auf diesen Ordner."`).
- **No new dependencies.**
- **Feature flag:** all file routes are behind `requireFilesFlag()` / `isFlagOn("files")`. The flag is currently **ON in production** — this ships to live users.
- **Max depth is 5.** Roots are depth 0; a folder at depth 5 accepts no children.
- **Tests ship in the same commit as the code.** No database mocks in multi-module flows.
- **Every file below is UTF-8 with LF endings; the repo runs `prettier --write` in CI (`format:check` gate).** Run `pnpm format` before the final commit of each task.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `modules/files/migrations/0003_folder_nesting.sql` | `parent_id` + `depth` columns, the inheritance trigger, the four unique-index swaps |
| `modules/files/src/slug.ts` | `slugifyFolderName` — German-aware name → slug. Pure, no imports |
| `modules/files/src/slug.test.ts` | Unit tests for the above |
| `modules/files/src/services/folder-writes.ts` | `createFolder`, `renameFolder`, `deleteFolder`. Kept out of `folders.ts` so the read path stays small |
| `modules/files/src/folder-writes.test.ts` | Integration tests for the three write services |
| `apps/web/app/_files/folder-actions.ts` | Server actions wrapping the three services |
| `apps/web/app/_files/NewFolderButton.tsx` | Client component: inline create form |
| `apps/web/app/_files/FolderAdminControls.tsx` | Client component: rename + delete for one subfolder |
| `apps/web/app/_files/breadcrumbs.ts` | `buildBreadcrumbs` — pure path assembly from a flat folder list |
| `apps/web/app/_files/breadcrumbs.test.ts` | Unit tests for the above |
| `apps/web/app/_files/Breadcrumbs.tsx` | Server component rendering a breadcrumb trail |

**Modified:**

| File | Change |
|---|---|
| `modules/files/src/schema.ts:6-21` | Add `parentId`, `depth` to the Drizzle `folders` table |
| `modules/files/src/types.ts:9-18` | Add `parentId`, `depth` to the `Folder` type |
| `modules/files/src/constants.ts` | Add `MAX_FOLDER_DEPTH` and `MAX_FOLDER_NAME_LENGTH` |
| `modules/files/src/services/folders.ts:15-26` | `rowToFolder` maps the two new columns |
| `modules/files/src/services/folders.ts:39-79` | `ensureFolders`/`provisionGroupFolders` write `parentId: null, depth: 0` explicitly |
| `modules/files/src/index.ts` | Export the three new services and `getFolder` |
| `modules/files/src/index.test.ts:57-69` | Apply `0003_folder_nesting.sql` in `applyMigrations` |
| `modules/files/README.md` | Document nesting, the write services, and the depth cap |
| `apps/web/app/_files/FolderIndex.tsx` | Accept and render an optional subfolder section |
| `apps/web/app/dateien/[folderId]/page.tsx` | Breadcrumbs, subfolder list, create/rename/delete controls |
| `apps/web/app/(board)/federal/files/[folderId]/page.tsx` | Same |
| `apps/web/app/(board)/gruppe/[slug]/files/[folderId]/page.tsx` | Same |

---

### Task 1: Migration — columns, trigger, unique-index swaps

**Files:**
- Create: `modules/files/migrations/0003_folder_nesting.sql`
- Modify: `modules/files/src/index.test.ts:57-69`
- Test: `modules/files/src/folder-nesting-schema.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: a `folders` table with `parent_id text NULL REFERENCES folders(id)` and `depth int NOT NULL DEFAULT 0`; trigger `folders_inherit_trg`; indexes `folders_root_scope_group_uq`, `folders_root_slug_uq`, `folders_sibling_slug_uq`, `folders_parent_idx`.

**Background you need:** `0001_init.sql:24` declares `folders_scope_group_uq UNIQUE (scope, group_id)`, and `0001_init.sql:7` declares `slug text NOT NULL UNIQUE` (Postgres auto-names that constraint `folders_slug_key`). Both block nesting: the first prevents a second folder of the same scope, the second prevents two subfolders named "Protokolle" under different parents. Both must become **partial** indexes scoped to roots.

Note also that `folders_scope_group_uq` never actually protected the two singletons, because Postgres treats `NULL` values as distinct in a `UNIQUE` — `('members_all', NULL)` does not conflict with itself. What makes `ensureFolders` idempotent today is the **slug** unique. So `folders_root_slug_uq` below is load-bearing: without it, every boot would insert duplicate singleton folders.

A `CHECK` constraint cannot read another row, so inheritance is enforced by a trigger, not a check.

- [ ] **Step 1: Write the failing test**

Create `modules/files/src/folder-nesting-schema.test.ts`:

```ts
/**
 * Schema-level guarantees of 0003_folder_nesting.sql. These assert the database
 * refuses invalid nesting even if a service forgets to — the trigger is the
 * backstop for the inheritance invariant (spec D1).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";

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

async function applyMigrations(t: TestDb): Promise<void> {
  for (const file of [
    ["..", "..", "auth", "migrations", "0001_init.sql"],
    ["..", "..", "groups", "migrations", "0001_init.sql"],
    ["..", "..", "groups", "migrations", "0004_location.sql"],
    ["..", "..", "members", "migrations", "0001_init.sql"],
    ["..", "migrations", "0001_init.sql"],
    ["..", "migrations", "0002_rls_lockdown.sql"],
    ["..", "migrations", "0003_folder_nesting.sql"],
  ]) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
}

describeIfDb("0003_folder_nesting", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    await t.client`
      INSERT INTO groups (id, slug, name, city, status)
      VALUES ('grp_a', 'a', 'Gruppe A', 'Stadt', 'active')
    `;
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_root', 'local-board-grp_a', 'A – Vorstand', 'local_board', 'grp_a', NULL, 0)
    `;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("accepts a child that copies the parent's scope and group", async () => {
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_c1', 'protokolle', 'Protokolle', 'local_board', 'grp_a', 'fld_root', 1)
    `;
    const rows = await t.client`SELECT depth FROM folders WHERE id = 'fld_c1'`;
    expect(rows[0]?.["depth"]).toBe(1);
  });

  it("rejects a child whose scope differs from its parent", async () => {
    await expect(
      t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES ('fld_bad', 'offen', 'Offen', 'group_members', 'grp_a', 'fld_root', 1)
      `,
    ).rejects.toThrow(/erbt/i);
  });

  it("rejects a child whose depth is not parent depth + 1", async () => {
    await expect(
      t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES ('fld_bad', 'tief', 'Tief', 'local_board', 'grp_a', 'fld_root', 3)
      `,
    ).rejects.toThrow(/Tiefe/i);
  });

  it("rejects a sixth level", async () => {
    let parent = "fld_root";
    for (let d = 1; d <= 5; d++) {
      const id = `fld_d${d}`;
      await t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES (${id}, ${`ebene-${d}`}, ${`Ebene ${d}`}, 'local_board', 'grp_a', ${parent}, ${d})
      `;
      parent = id;
    }
    await expect(
      t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES ('fld_d6', 'ebene-6', 'Ebene 6', 'local_board', 'grp_a', ${parent}, 6)
      `,
    ).rejects.toThrow(/Tiefe/i);
  });

  it("allows the same slug under different parents", async () => {
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_x1', 'x', 'X', 'local_board', 'grp_a', 'fld_root', 1)
    `;
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_y', 'y', 'Y', 'local_board', 'grp_a', 'fld_root', 1)
    `;
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_x2', 'x', 'X', 'local_board', 'grp_a', 'fld_y', 2)
    `;
    const rows = await t.client`SELECT count(*)::int AS n FROM folders WHERE slug = 'x'`;
    expect(rows[0]?.["n"]).toBe(2);
  });

  it("rejects two children with the same slug under one parent", async () => {
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_s1', 'gleich', 'Gleich', 'local_board', 'grp_a', 'fld_root', 1)
    `;
    await expect(
      t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES ('fld_s2', 'gleich', 'Gleich', 'local_board', 'grp_a', 'fld_root', 1)
      `,
    ).rejects.toThrow(/folders_sibling_slug_uq/);
  });

  it("still allows only one root per (scope, group)", async () => {
    await expect(
      t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES ('fld_dup', 'anderer-slug', 'Doppelt', 'local_board', 'grp_a', NULL, 0)
      `,
    ).rejects.toThrow(/folders_root_scope_group_uq/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm db:up && pnpm --filter @bdas/files test folder-nesting-schema`
Expected: FAIL — `ENOENT` reading `0003_folder_nesting.sql`.

If the tests report as **skipped** instead, Docker Postgres is not up. `pnpm db:up` must succeed first; a skipped suite is not a passing suite.

- [ ] **Step 3: Write the migration**

Create `modules/files/migrations/0003_folder_nesting.sql`:

```sql
-- Files module — folder nesting (spec 2026-07-29, decisions D1-D5).
--
-- Subfolders inherit their parent's scope and group_id permanently. The
-- inheritance is denormalised onto every row so permissions.ts needs no
-- knowledge of the tree: canRead/canWrite already answer correctly for a
-- folder at any depth. The trigger below is what keeps that denormalisation
-- honest.

ALTER TABLE folders ADD COLUMN parent_id text REFERENCES folders(id);
ALTER TABLE folders ADD COLUMN depth     int NOT NULL DEFAULT 0;

-- Every existing folder is a system-provisioned root; the defaults above are
-- already correct for them, so no backfill is required.

-- 1. One root per (scope, group). Was a plain UNIQUE that also caught
--    subfolders; now scoped to roots so a group may have many local_board
--    folders in its tree but only one local_board ROOT.
ALTER TABLE folders DROP CONSTRAINT folders_scope_group_uq;
CREATE UNIQUE INDEX folders_root_scope_group_uq
  ON folders (scope, group_id) WHERE parent_id IS NULL;

-- 2. Slug was globally UNIQUE, which would forbid "protokolle" under two
--    different parents. Split into root-global and per-parent.
--    The root index is load-bearing for ensureFolders' idempotency: a UNIQUE
--    on (scope, group_id) does NOT protect the two singletons, because
--    Postgres treats NULL group_id values as distinct. The slug index is what
--    makes re-running ensureFolders a no-op.
ALTER TABLE folders DROP CONSTRAINT folders_slug_key;
CREATE UNIQUE INDEX folders_root_slug_uq
  ON folders (slug) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX folders_sibling_slug_uq
  ON folders (parent_id, slug) WHERE parent_id IS NOT NULL;

CREATE INDEX folders_parent_idx ON folders (parent_id);

-- 3. Inheritance + depth invariant. A CHECK cannot read the parent row, so
--    this is a trigger. Messages are German: they surface to boards if a
--    service ever forgets its own validation.
CREATE OR REPLACE FUNCTION folders_inherit_check() RETURNS trigger AS $$
DECLARE
  p_scope text;
  p_group text;
  p_depth int;
BEGIN
  IF NEW.parent_id IS NULL THEN
    IF NEW.depth <> 0 THEN
      RAISE EXCEPTION 'Ordner ohne Elternordner muss Tiefe 0 haben.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT scope, group_id, depth INTO p_scope, p_group, p_depth
    FROM folders WHERE id = NEW.parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Elternordner nicht gefunden.';
  END IF;

  IF NEW.scope IS DISTINCT FROM p_scope OR NEW.group_id IS DISTINCT FROM p_group THEN
    RAISE EXCEPTION 'Unterordner erbt Sichtbarkeit und Gruppe vom Elternordner.';
  END IF;

  IF NEW.depth <> p_depth + 1 THEN
    RAISE EXCEPTION 'Ungültige Tiefe für diesen Unterordner.';
  END IF;

  IF NEW.depth > 5 THEN
    RAISE EXCEPTION 'Maximale Ordnertiefe (5) überschritten.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER folders_inherit_trg
  BEFORE INSERT OR UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION folders_inherit_check();
```

- [ ] **Step 4: Register the migration in the existing integration harness**

In `modules/files/src/index.test.ts`, inside `applyMigrations` (currently lines 57-69), add one entry after the `0002_rls_lockdown.sql` line:

```ts
    ["..", "migrations", "0003_folder_nesting.sql"],
```

`modules/files/src/index.test.ts` is the only harness that applies files migrations — verify with:

```bash
grep -rln "0002_rls_lockdown" --include="*.ts" . | grep -v node_modules
```

If that command lists any file other than `modules/files/src/index.test.ts` and your new `folder-nesting-schema.test.ts`, add the same line there too.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @bdas/files test`
Expected: PASS — 7 new schema tests plus the whole existing suite still green.

- [ ] **Step 6: Commit**

```bash
git add modules/files/migrations/0003_folder_nesting.sql modules/files/src/folder-nesting-schema.test.ts modules/files/src/index.test.ts
git commit -m "feat(files): nest folders — parent_id, depth, inheritance trigger"
```

---

### Task 2: Slug helper

**Files:**
- Create: `modules/files/src/slug.ts`, `modules/files/src/slug.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `slugifyFolderName(name: string): string`.

- [ ] **Step 1: Write the failing test**

Create `modules/files/src/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { slugifyFolderName } from "./slug";

describe("slugifyFolderName", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyFolderName("Protokolle 2026")).toBe("protokolle-2026");
  });

  it("transliterates German umlauts and eszett", () => {
    expect(slugifyFolderName("Beschlüsse & Anträge")).toBe("beschluesse-antraege");
    expect(slugifyFolderName("Straße")).toBe("strasse");
  });

  it("collapses runs of separators and trims them", () => {
    expect(slugifyFolderName("  --Ordner///Name--  ")).toBe("ordner-name");
  });

  it("falls back when nothing survives", () => {
    expect(slugifyFolderName("!!!")).toBe("ordner");
  });

  it("caps length at 60 characters without a trailing hyphen", () => {
    const s = slugifyFolderName("a".repeat(80));
    expect(s).toHaveLength(60);
    expect(s.endsWith("-")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/files test slug`
Expected: FAIL — cannot resolve `./slug`.

- [ ] **Step 3: Write the implementation**

Create `modules/files/src/slug.ts`:

```ts
/**
 * Folder name -> URL-safe slug. German-aware: umlauts transliterate the way a
 * German reader expects (ü -> ue, not u), so "Beschlüsse" reads as
 * "beschluesse" rather than "beschlsse".
 */
const TRANSLITERATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

const MAX_SLUG_LENGTH = 60;

export function slugifyFolderName(name: string): string {
  let s = name.toLowerCase();
  for (const [pattern, replacement] of TRANSLITERATIONS) {
    s = s.replace(pattern, replacement);
  }
  s = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (s.length > MAX_SLUG_LENGTH) {
    s = s.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  }
  return s === "" ? "ordner" : s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/files test slug`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add modules/files/src/slug.ts modules/files/src/slug.test.ts
git commit -m "feat(files): add German-aware folder slugifier"
```

---

### Task 3: Types, constants, and the read path

**Files:**
- Modify: `modules/files/src/types.ts:9-18`, `modules/files/src/schema.ts:6-21`, `modules/files/src/constants.ts`, `modules/files/src/services/folders.ts:15-79`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces: `Folder` gains `readonly parentId: string | null` and `readonly depth: number`. New constants `MAX_FOLDER_DEPTH = 5`, `MAX_FOLDER_NAME_LENGTH = 80`. `getFolder(db, folderId)` becomes exported from the module surface in Task 6.

- [ ] **Step 1: Extend the Drizzle table**

In `modules/files/src/schema.ts`, add to the `folders` column block (after `description`, before `createdAt`):

```ts
    parentId: text("parent_id"),
    depth: integer("depth").notNull().default(0),
```

and extend the import on line 1 to include `integer`:

```ts
import { bigint, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
```

Leave the existing `scopeGroupUq` entry in the table's second argument as-is — Drizzle uses it only for query building, and the authoritative DDL now lives in `0003_folder_nesting.sql`. Add a comment above it so the next reader is not misled:

```ts
  (t) => ({
    // Authoritative DDL is in migrations; since 0003 this unique is partial
    // (roots only). Kept here only so Drizzle can build queries.
    scopeGroupUq: unique("folders_scope_group_uq").on(t.scope, t.groupId),
  }),
```

- [ ] **Step 2: Extend the public type**

In `modules/files/src/types.ts`, add two fields to `Folder` after `groupId`:

```ts
  readonly parentId: string | null;
  readonly depth: number;
```

- [ ] **Step 3: Add the constants**

Append to `modules/files/src/constants.ts`:

```ts
/**
 * Folder tree limits. Depth 0 is a system-provisioned root; a folder at
 * MAX_FOLDER_DEPTH accepts no children. Enforced in the service AND by the
 * trigger in 0003_folder_nesting.sql.
 */
export const MAX_FOLDER_DEPTH = 5;
export const MAX_FOLDER_NAME_LENGTH = 80;
```

- [ ] **Step 4: Map the new columns in the read path**

In `modules/files/src/services/folders.ts`, extend `rowToFolder` (lines 15-26) to include both fields:

```ts
export function rowToFolder(r: FolderRow): Folder {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    scope: r.scope as Folder["scope"],
    groupId: r.groupId,
    parentId: r.parentId,
    depth: r.depth,
    description: r.description,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
  };
}
```

In the same file, make the provisioning inserts explicit about being roots. In `ensureFolders`, the singleton insert becomes:

```ts
      .values({
        id: createId("fld"),
        slug: s.slug,
        name: s.name,
        scope: s.scope,
        groupId: null,
        parentId: null,
        depth: 0,
      })
```

and both inserts in `provisionGroupFolders` gain `parentId: null, depth: 0` alongside their existing fields.

- [ ] **Step 5: Fix the test fixture that constructs a Folder**

`modules/files/src/permissions.test.ts:9-20` builds a `Folder` literal and will now fail to typecheck. Add the two fields to its `folder()` helper:

```ts
function folder(scope: Folder["scope"], groupId: string | null): Folder {
  return {
    id: "fld_x",
    slug: "x",
    name: "X",
    scope,
    groupId,
    parentId: null,
    depth: 0,
    description: "",
    createdAt: new Date(),
    createdBy: null,
  };
}
```

- [ ] **Step 6: Run the full module suite and the typechecker**

Run: `pnpm --filter @bdas/files test && pnpm typecheck`
Expected: PASS. If `pnpm typecheck` flags other `Folder` literals, add `parentId: null, depth: 0` to each — they are all test fixtures.

- [ ] **Step 7: Commit**

```bash
git add modules/files/src/types.ts modules/files/src/schema.ts modules/files/src/constants.ts modules/files/src/services/folders.ts modules/files/src/permissions.test.ts
git commit -m "feat(files): surface parentId and depth on Folder"
```

---

### Task 4: `createFolder`

**Files:**
- Create: `modules/files/src/services/folder-writes.ts`, `modules/files/src/folder-writes.test.ts`

**Interfaces:**
- Consumes: `slugifyFolderName` (Task 2), `MAX_FOLDER_DEPTH`/`MAX_FOLDER_NAME_LENGTH` (Task 3), `getFolder` and `rowToFolder` from `./folders`, `canWrite` from `../permissions`.
- Produces:
  ```ts
  createFolder(
    db: Db,
    input: { parentId: string; name: string; description?: string },
    byMember: CurrentMember,
  ): Promise<Folder>
  ```

**Background:** the service layer mirrors `services/files.ts` — a private `requireActingMember` that throws `ForbiddenError("Mitgliedsprofil erforderlich.")`, German messages, and permission checks before any write. Error classes come from `@bdas/errors`: `NotFoundError`, `ForbiddenError`, `ValidationError`, `ConflictError`.

- [ ] **Step 1: Write the failing test**

Create `modules/files/src/folder-writes.test.ts`:

```ts
/**
 * Integration tests for folder create/rename/delete against a real schema.
 * Permission inheritance is the property under test: a subfolder must be
 * readable and writable by exactly the people its root is.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import type { CurrentMember, Grant } from "@bdas/members";

import { createFolder } from "./services/folder-writes";
import { ensureFolders, listFolders } from "./services/folders";

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

async function applyMigrations(t: TestDb): Promise<void> {
  for (const file of [
    ["..", "..", "auth", "migrations", "0001_init.sql"],
    ["..", "..", "groups", "migrations", "0001_init.sql"],
    ["..", "..", "groups", "migrations", "0004_location.sql"],
    ["..", "..", "members", "migrations", "0001_init.sql"],
    ["..", "migrations", "0001_init.sql"],
    ["..", "migrations", "0002_rls_lockdown.sql"],
    ["..", "migrations", "0003_folder_nesting.sql"],
  ]) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
}

function actor(grants: Grant[], memberId = "mbr_board"): CurrentMember {
  return {
    user: { id: "usr_1", email: "b@x.org", status: "active", roles: [], sessionId: "ses_1" },
    member: {
      id: memberId,
      userId: "usr_1",
      firstName: "B",
      lastName: "V",
      primaryGroupId: "grp_a",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants,
  };
}

const BOARD_A: Grant[] = [{ role: "local_board", groupId: "grp_a" }];
const BOARD_B: Grant[] = [{ role: "local_board", groupId: "grp_b" }];
const PLAIN: Grant[] = [{ role: "member", groupId: null }];

describeIfDb("createFolder", () => {
  let t: TestDb;
  let boardRoot: string;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    await t.client`
      INSERT INTO groups (id, slug, name, city, status) VALUES
        ('grp_a', 'a', 'Gruppe A', 'Stadt', 'active'),
        ('grp_b', 'b', 'Gruppe B', 'Stadt', 'active')
    `;
    await t.client`
      INSERT INTO users (id, email, password_hash, status)
      VALUES ('usr_1', 'b@x.org', 'x', 'active')
    `;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mbr_board', 'usr_1', 'B', 'V', 'grp_a', 'active')
    `;
    await ensureFolders(t.db);
    const rows = await t.client`
      SELECT id FROM folders WHERE scope = 'local_board' AND group_id = 'grp_a'
    `;
    boardRoot = String(rows[0]?.["id"]);
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("creates a child that inherits scope, group, and depth+1", async () => {
    const f = await createFolder(
      t.db,
      { parentId: boardRoot, name: "Protokolle" },
      actor(BOARD_A),
    );
    expect(f.scope).toBe("local_board");
    expect(f.groupId).toBe("grp_a");
    expect(f.parentId).toBe(boardRoot);
    expect(f.depth).toBe(1);
    expect(f.slug).toBe("protokolle");
    expect(f.createdBy).toBe("mbr_board");
  });

  it("makes the child visible to exactly whoever sees the parent", async () => {
    await createFolder(t.db, { parentId: boardRoot, name: "Protokolle" }, actor(BOARD_A));

    const forOwnBoard = await listFolders(t.db, actor(BOARD_A));
    expect(forOwnBoard.some((f) => f.name === "Protokolle")).toBe(true);

    const forOtherBoard = await listFolders(t.db, actor(BOARD_B, "mbr_board"));
    expect(forOtherBoard.some((f) => f.name === "Protokolle")).toBe(false);

    const forPlainMember = await listFolders(t.db, actor(PLAIN));
    expect(forPlainMember.some((f) => f.name === "Protokolle")).toBe(false);
  });

  it("refuses a member without write permission on the parent", async () => {
    await expect(
      createFolder(t.db, { parentId: boardRoot, name: "Fremd" }, actor(BOARD_B, "mbr_board")),
    ).rejects.toThrow("Kein Schreibzugriff auf diesen Ordner.");
  });

  it("refuses a duplicate name among siblings", async () => {
    await createFolder(t.db, { parentId: boardRoot, name: "Protokolle" }, actor(BOARD_A));
    await expect(
      createFolder(t.db, { parentId: boardRoot, name: "protokolle" }, actor(BOARD_A)),
    ).rejects.toThrow("Ein Ordner mit diesem Namen existiert hier bereits.");
  });

  it("refuses an empty or oversized name", async () => {
    await expect(
      createFolder(t.db, { parentId: boardRoot, name: "   " }, actor(BOARD_A)),
    ).rejects.toThrow("Ordnername darf nicht leer sein.");
    await expect(
      createFolder(t.db, { parentId: boardRoot, name: "a".repeat(81) }, actor(BOARD_A)),
    ).rejects.toThrow("Ordnername ist zu lang (max. 80 Zeichen).");
  });

  it("refuses a sixth level", async () => {
    let parent = boardRoot;
    for (let d = 1; d <= 5; d++) {
      const f = await createFolder(t.db, { parentId: parent, name: `Ebene ${d}` }, actor(BOARD_A));
      parent = f.id;
    }
    await expect(
      createFolder(t.db, { parentId: parent, name: "Zu tief" }, actor(BOARD_A)),
    ).rejects.toThrow("Maximale Ordnertiefe (5) erreicht.");
  });

  it("refuses an unknown parent", async () => {
    await expect(
      createFolder(t.db, { parentId: "fld_nope", name: "X" }, actor(BOARD_A)),
    ).rejects.toThrow("Ordner nicht gefunden.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/files test folder-writes`
Expected: FAIL — cannot resolve `./services/folder-writes`.

- [ ] **Step 3: Write the implementation**

Create `modules/files/src/services/folder-writes.ts`:

```ts
import { and, eq } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { ConflictError, ForbiddenError, ValidationError } from "@bdas/errors";
import { createId } from "@bdas/id";
import type { CurrentMember } from "@bdas/members";

import { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from "../constants";
import { canWrite } from "../permissions";
import { folders } from "../schema";
import { slugifyFolderName } from "../slug";
import type { Folder } from "../types";
import { getFolder, rowToFolder } from "./folders";

function requireActingMember(me: CurrentMember): { id: string } {
  if (!me.member) throw new ForbiddenError("Mitgliedsprofil erforderlich.");
  return { id: me.member.id };
}

/** Trim + length-check a folder name, returning it with its slug. */
function normalizeName(raw: string): { name: string; slug: string } {
  const name = raw.trim();
  if (name === "") throw new ValidationError("Ordnername darf nicht leer sein.");
  if (name.length > MAX_FOLDER_NAME_LENGTH) {
    throw new ValidationError(`Ordnername ist zu lang (max. ${MAX_FOLDER_NAME_LENGTH} Zeichen).`);
  }
  return { name, slug: slugifyFolderName(name) };
}

/** Throw if `slug` is already taken by a different child of `parentId`. */
async function assertSlugFree(
  db: Db,
  parentId: string,
  slug: string,
  exceptFolderId?: string,
): Promise<void> {
  const clash = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.parentId, parentId), eq(folders.slug, slug)))
    .limit(2);
  if (clash.some((r) => r.id !== exceptFolderId)) {
    throw new ConflictError("Ein Ordner mit diesem Namen existiert hier bereits.");
  }
}

/**
 * Create a subfolder. It permanently inherits the parent's scope and group
 * (spec D1), so no permission choice is offered and none can be made. The
 * right to create is exactly the right to upload into the parent (D2) — no
 * new role logic.
 */
export async function createFolder(
  db: Db,
  input: { parentId: string; name: string; description?: string },
  byMember: CurrentMember,
): Promise<Folder> {
  const actor = requireActingMember(byMember);
  const parent = await getFolder(db, input.parentId);
  if (!canWrite(parent, byMember)) {
    throw new ForbiddenError("Kein Schreibzugriff auf diesen Ordner.");
  }
  if (parent.depth >= MAX_FOLDER_DEPTH) {
    throw new ValidationError(`Maximale Ordnertiefe (${MAX_FOLDER_DEPTH}) erreicht.`);
  }

  const { name, slug } = normalizeName(input.name);
  await assertSlugFree(db, parent.id, slug);

  const rows = await db
    .insert(folders)
    .values({
      id: createId("fld"),
      slug,
      name,
      scope: parent.scope,
      groupId: parent.groupId,
      parentId: parent.id,
      depth: parent.depth + 1,
      description: input.description?.trim() ?? "",
      createdBy: actor.id,
    })
    .returning();

  const row = rows[0];
  if (!row) throw new ConflictError("Ordner konnte nicht angelegt werden.");
  return rowToFolder(row);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/files test folder-writes`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add modules/files/src/services/folder-writes.ts modules/files/src/folder-writes.test.ts
git commit -m "feat(files): createFolder with inherited scope and depth cap"
```

---

### Task 5: `renameFolder` and `deleteFolder`

**Files:**
- Modify: `modules/files/src/services/folder-writes.ts`, `modules/files/src/folder-writes.test.ts`

**Interfaces:**
- Consumes: everything from Task 4.
- Produces:
  ```ts
  renameFolder(
    db: Db,
    folderId: string,
    input: { name: string; description?: string },
    byMember: CurrentMember,
  ): Promise<Folder>

  deleteFolder(db: Db, folderId: string, byMember: CurrentMember): Promise<void>
  ```

**Background:** roots are system-owned (D5) — `ensureFolders` re-creates and re-names them, so a board renaming one would be silently reverted at the next boot. Both services therefore refuse when `parentId === null`. Delete refuses a non-empty folder (D4): no cascade, no orphaned storage objects.

- [ ] **Step 1: Write the failing tests**

Append to `modules/files/src/folder-writes.test.ts`, importing the two new services at the top (extend the existing import from `./services/folder-writes` to `import { createFolder, deleteFolder, renameFolder } from "./services/folder-writes";`) and adding the `files` table import `import { files } from "./schema";`:

```ts
describeIfDb("renameFolder", () => {
  let t: TestDb;
  let boardRoot: string;
  let child: string;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    await t.client`
      INSERT INTO groups (id, slug, name, city, status) VALUES
        ('grp_a', 'a', 'Gruppe A', 'Stadt', 'active'),
        ('grp_b', 'b', 'Gruppe B', 'Stadt', 'active')
    `;
    await t.client`
      INSERT INTO users (id, email, password_hash, status)
      VALUES ('usr_1', 'b@x.org', 'x', 'active')
    `;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mbr_board', 'usr_1', 'B', 'V', 'grp_a', 'active')
    `;
    await ensureFolders(t.db);
    const rows = await t.client`
      SELECT id FROM folders WHERE scope = 'local_board' AND group_id = 'grp_a'
    `;
    boardRoot = String(rows[0]?.["id"]);
    child = (await createFolder(t.db, { parentId: boardRoot, name: "Alt" }, actor(BOARD_A))).id;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("renames a subfolder and recomputes its slug", async () => {
    const f = await renameFolder(t.db, child, { name: "Protokolle 2026" }, actor(BOARD_A));
    expect(f.name).toBe("Protokolle 2026");
    expect(f.slug).toBe("protokolle-2026");
  });

  it("updates the description", async () => {
    const f = await renameFolder(
      t.db,
      child,
      { name: "Alt", description: "Nur beschlossene Protokolle." },
      actor(BOARD_A),
    );
    expect(f.description).toBe("Nur beschlossene Protokolle.");
  });

  it("refuses to rename a system root", async () => {
    await expect(
      renameFolder(t.db, boardRoot, { name: "Umbenannt" }, actor(BOARD_A)),
    ).rejects.toThrow("Systemordner können nicht umbenannt werden.");
  });

  it("refuses a name already used by a sibling", async () => {
    await createFolder(t.db, { parentId: boardRoot, name: "Finanzen" }, actor(BOARD_A));
    await expect(
      renameFolder(t.db, child, { name: "Finanzen" }, actor(BOARD_A)),
    ).rejects.toThrow("Ein Ordner mit diesem Namen existiert hier bereits.");
  });

  it("allows renaming a folder to its own current name", async () => {
    const f = await renameFolder(t.db, child, { name: "Alt" }, actor(BOARD_A));
    expect(f.name).toBe("Alt");
  });

  it("refuses a member without write permission", async () => {
    await expect(
      renameFolder(t.db, child, { name: "Fremd" }, actor(BOARD_B, "mbr_board")),
    ).rejects.toThrow("Kein Schreibzugriff auf diesen Ordner.");
  });
});

describeIfDb("deleteFolder", () => {
  let t: TestDb;
  let boardRoot: string;
  let child: string;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    await t.client`
      INSERT INTO groups (id, slug, name, city, status) VALUES
        ('grp_a', 'a', 'Gruppe A', 'Stadt', 'active'),
        ('grp_b', 'b', 'Gruppe B', 'Stadt', 'active')
    `;
    await t.client`
      INSERT INTO users (id, email, password_hash, status)
      VALUES ('usr_1', 'b@x.org', 'x', 'active')
    `;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mbr_board', 'usr_1', 'B', 'V', 'grp_a', 'active')
    `;
    await ensureFolders(t.db);
    const rows = await t.client`
      SELECT id FROM folders WHERE scope = 'local_board' AND group_id = 'grp_a'
    `;
    boardRoot = String(rows[0]?.["id"]);
    child = (await createFolder(t.db, { parentId: boardRoot, name: "Leer" }, actor(BOARD_A))).id;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("deletes an empty subfolder", async () => {
    await deleteFolder(t.db, child, actor(BOARD_A));
    const rows = await t.client`SELECT count(*)::int AS n FROM folders WHERE id = ${child}`;
    expect(rows[0]?.["n"]).toBe(0);
  });

  it("refuses a folder that still holds a file", async () => {
    await t.db.insert(files).values({
      id: "fil_1",
      folderId: child,
      filename: "a.pdf",
      storageKey: "k/a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      status: "ready",
      uploadedBy: "mbr_board",
    });
    await expect(deleteFolder(t.db, child, actor(BOARD_A))).rejects.toThrow(
      "Ordner ist nicht leer.",
    );
  });

  it("refuses a folder that still holds a subfolder", async () => {
    await createFolder(t.db, { parentId: child, name: "Enkel" }, actor(BOARD_A));
    await expect(deleteFolder(t.db, child, actor(BOARD_A))).rejects.toThrow(
      "Ordner ist nicht leer.",
    );
  });

  it("refuses to delete a system root", async () => {
    await expect(deleteFolder(t.db, boardRoot, actor(BOARD_A))).rejects.toThrow(
      "Systemordner können nicht gelöscht werden.",
    );
  });

  it("refuses a member without write permission", async () => {
    await expect(deleteFolder(t.db, child, actor(BOARD_B, "mbr_board"))).rejects.toThrow(
      "Kein Schreibzugriff auf diesen Ordner.",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/files test folder-writes`
Expected: FAIL — `renameFolder` / `deleteFolder` are not exported.

- [ ] **Step 3: Write the implementation**

Append to `modules/files/src/services/folder-writes.ts` (and extend the `drizzle-orm` import on line 1 to `import { and, count, eq } from "drizzle-orm";`, and the schema import to `import { files, folders } from "../schema";`):

```ts
/**
 * Rename a subfolder and optionally reword its description. Roots are
 * system-provisioned (D5) — ensureFolders rewrites their names at every boot,
 * so allowing a rename here would produce a change that silently reverts.
 */
export async function renameFolder(
  db: Db,
  folderId: string,
  input: { name: string; description?: string },
  byMember: CurrentMember,
): Promise<Folder> {
  requireActingMember(byMember);
  const folder = await getFolder(db, folderId);
  if (folder.parentId === null) {
    throw new ForbiddenError("Systemordner können nicht umbenannt werden.");
  }
  if (!canWrite(folder, byMember)) {
    throw new ForbiddenError("Kein Schreibzugriff auf diesen Ordner.");
  }

  const { name, slug } = normalizeName(input.name);
  await assertSlugFree(db, folder.parentId, slug, folder.id);

  const rows = await db
    .update(folders)
    .set({
      name,
      slug,
      ...(input.description === undefined ? {} : { description: input.description.trim() }),
    })
    .where(eq(folders.id, folder.id))
    .returning();

  const row = rows[0];
  if (!row) throw new ConflictError("Ordner konnte nicht geändert werden.");
  return rowToFolder(row);
}

/**
 * Delete an empty subfolder. Refuses while anything is inside it (D4): no
 * cascade means no click can destroy a year of protocols, and no storage
 * object is ever orphaned by a folder deletion.
 */
export async function deleteFolder(
  db: Db,
  folderId: string,
  byMember: CurrentMember,
): Promise<void> {
  requireActingMember(byMember);
  const folder = await getFolder(db, folderId);
  if (folder.parentId === null) {
    throw new ForbiddenError("Systemordner können nicht gelöscht werden.");
  }
  if (!canWrite(folder, byMember)) {
    throw new ForbiddenError("Kein Schreibzugriff auf diesen Ordner.");
  }

  const [fileCount] = await db
    .select({ n: count() })
    .from(files)
    .where(eq(files.folderId, folder.id));
  const [childCount] = await db
    .select({ n: count() })
    .from(folders)
    .where(eq(folders.parentId, folder.id));

  if ((fileCount?.n ?? 0) > 0 || (childCount?.n ?? 0) > 0) {
    throw new ConflictError("Ordner ist nicht leer.");
  }

  await db.delete(folders).where(eq(folders.id, folder.id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/files test`
Expected: PASS — 11 new tests plus everything from Tasks 1-4.

- [ ] **Step 5: Commit**

```bash
git add modules/files/src/services/folder-writes.ts modules/files/src/folder-writes.test.ts
git commit -m "feat(files): renameFolder and deleteFolder, empty-only"
```

---

### Task 6: Public surface

**Files:**
- Modify: `modules/files/src/index.ts`, `modules/files/src/index.export.test.ts` (create if absent — check first with `ls modules/files/src/index.export.test.ts`)

**Interfaces:**
- Produces: `createFolder`, `renameFolder`, `deleteFolder`, `getFolder`, `MAX_FOLDER_DEPTH`, `MAX_FOLDER_NAME_LENGTH` importable from `@bdas/files`.

**Background:** `apps/web` may import **only** from `@bdas/files`. The folder detail pages need `getFolder` to resolve a single folder without scanning `listFolders`, so it graduates from private helper to public surface.

- [ ] **Step 1: Write the failing test**

Create `modules/files/src/folder-writes.export.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import * as filesModule from "./index";

describe("files public surface", () => {
  it("exports the folder write services", () => {
    expect(typeof filesModule.createFolder).toBe("function");
    expect(typeof filesModule.renameFolder).toBe("function");
    expect(typeof filesModule.deleteFolder).toBe("function");
    expect(typeof filesModule.getFolder).toBe("function");
  });

  it("exports the folder tree limits", () => {
    expect(filesModule.MAX_FOLDER_DEPTH).toBe(5);
    expect(filesModule.MAX_FOLDER_NAME_LENGTH).toBe(80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/files test folder-writes.export`
Expected: FAIL — `createFolder is not a function` (undefined).

- [ ] **Step 3: Extend the public surface**

In `modules/files/src/index.ts`, change line 5 and add one export line:

```ts
export { ensureFolders, listFolders, getFolder } from "./services/folders";
export { createFolder, renameFolder, deleteFolder } from "./services/folder-writes";
```

and extend the constants export (line 17):

```ts
export { ALLOWED_MIME, MAX_FILE_BYTES, MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH } from "./constants";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/files test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Update the module README**

In `modules/files/README.md`, replace the sentence under the scope table that reads "Folders are system-provisioned (`ensureFolders` at boot + a `groups.group.created` subscriber); they are not user-creatable in v1." with:

```markdown
The four scopes above are **root** folders, system-provisioned by `ensureFolders`
at boot and by the `groups.group.created` subscriber. Roots cannot be renamed or
deleted.

Inside a root, anyone with write permission on it (`canWrite` — the group's board
or federal board) may create subfolders up to `MAX_FOLDER_DEPTH` (5) levels deep.
A subfolder permanently **inherits** its parent's `scope` and `group_id`; there is
no per-folder permission setting, and a database trigger
(`folders_inherit_trg`) rejects any row that diverges. Deletion is refused while a
folder still contains files or subfolders.
```

Then add `createFolder`, `renameFolder`, `deleteFolder`, and `getFolder` to the "Public surface" list.

- [ ] **Step 6: Commit**

```bash
git add modules/files/src/index.ts modules/files/src/folder-writes.export.test.ts modules/files/README.md
git commit -m "feat(files): export folder write services and tree limits"
```

---

### Task 7: Breadcrumb assembly

**Files:**
- Create: `apps/web/app/_files/breadcrumbs.ts`, `apps/web/app/_files/breadcrumbs.test.ts`

**Interfaces:**
- Consumes: `Folder` from `@bdas/files`.
- Produces: `buildBreadcrumbs(folders: readonly Folder[], folderId: string): Folder[]` — root-first path **including** the target folder; `[]` when the id is absent.

**Background:** `listFolders` already returns the flat set of folders the member may read, so the path can be assembled in memory with no extra query. A member who may read a child may always read its ancestors (inheritance guarantees identical scope), so no ancestor can be missing from that list.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_files/breadcrumbs.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { Folder } from "@bdas/files";

import { buildBreadcrumbs } from "./breadcrumbs";

function f(id: string, parentId: string | null, depth: number, name = id): Folder {
  return {
    id,
    slug: id,
    name,
    scope: "local_board",
    groupId: "grp_a",
    parentId,
    depth,
    description: "",
    createdAt: new Date(),
    createdBy: null,
  };
}

const TREE: Folder[] = [
  f("root", null, 0, "Vorstand"),
  f("a", "root", 1, "Protokolle"),
  f("b", "a", 2, "2026"),
];

describe("buildBreadcrumbs", () => {
  it("returns the root-first path including the target", () => {
    expect(buildBreadcrumbs(TREE, "b").map((x) => x.name)).toEqual([
      "Vorstand",
      "Protokolle",
      "2026",
    ]);
  });

  it("returns just the folder for a root", () => {
    expect(buildBreadcrumbs(TREE, "root").map((x) => x.name)).toEqual(["Vorstand"]);
  });

  it("returns empty for an unknown id", () => {
    expect(buildBreadcrumbs(TREE, "nope")).toEqual([]);
  });

  it("stops instead of looping if a parent link is dangling", () => {
    const orphan: Folder[] = [f("x", "missing", 1)];
    expect(buildBreadcrumbs(orphan, "x").map((y) => y.id)).toEqual(["x"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web test breadcrumbs`
Expected: FAIL — cannot resolve `./breadcrumbs`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/_files/breadcrumbs.ts`:

```ts
import type { Folder } from "@bdas/files";

import { MAX_FOLDER_DEPTH } from "@bdas/files";

/**
 * Root-first path to `folderId`, target included. Built from the flat readable
 * set listFolders already returned — a member who may read a child may always
 * read its ancestors, because a subfolder inherits its parent's scope exactly.
 */
export function buildBreadcrumbs(folders: readonly Folder[], folderId: string): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];

  let current = byId.get(folderId);
  // Bounded by the depth cap + 1 so a dangling or cyclic parent link cannot spin.
  for (let i = 0; current && i <= MAX_FOLDER_DEPTH + 1; i++) {
    path.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return path;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/web test breadcrumbs`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_files/breadcrumbs.ts apps/web/app/_files/breadcrumbs.test.ts
git commit -m "feat(web): assemble folder breadcrumbs from the readable set"
```

---

### Task 8: Server actions

**Files:**
- Create: `apps/web/app/_files/folder-actions.ts`

**Interfaces:**
- Consumes: `createFolder`, `renameFolder`, `deleteFolder` from `@bdas/files`.
- Produces:
  ```ts
  type FolderActionResult = { readonly ok: true } | { readonly error: string };
  createFolderAction(parentId: string, name: string, description: string): Promise<FolderActionResult>
  renameFolderAction(folderId: string, name: string, description: string): Promise<FolderActionResult>
  deleteFolderAction(folderId: string): Promise<FolderActionResult>
  ```

**Background:** mirror `file-actions.ts` exactly — flag check, session check, `isAppError` translation to a German string, rethrow of anything else. Do **not** add permission logic here; the services own it.

- [ ] **Step 1: Write the implementation**

Create `apps/web/app/_files/folder-actions.ts`:

```ts
"use server";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { isFlagOn } from "@bdas/feature-flags";
import { createFolder, deleteFolder, renameFolder } from "@bdas/files";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";

export type FolderActionResult = { readonly ok: true } | { readonly error: string };

/**
 * Create a subfolder. The service write-gates against the PARENT and copies its
 * scope/group onto the child, so there is no permission input to validate here.
 */
export async function createFolderAction(
  parentId: string,
  name: string,
  description: string,
): Promise<FolderActionResult> {
  if (!isFlagOn("files")) return { error: "Nicht verfügbar." };

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    await createFolder(getDb(), { parentId, name, description }, me);
    return { ok: true };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}

/** Rename a subfolder and reword its description. Roots are refused by the service. */
export async function renameFolderAction(
  folderId: string,
  name: string,
  description: string,
): Promise<FolderActionResult> {
  if (!isFlagOn("files")) return { error: "Nicht verfügbar." };

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    await renameFolder(getDb(), folderId, { name, description }, me);
    return { ok: true };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}

/** Delete an empty subfolder. Non-empty and root deletions are refused by the service. */
export async function deleteFolderAction(folderId: string): Promise<FolderActionResult> {
  if (!isFlagOn("files")) return { error: "Nicht verfügbar." };

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    await deleteFolder(getDb(), folderId, me);
    return { ok: true };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/_files/folder-actions.ts
git commit -m "feat(web): server actions for folder create/rename/delete"
```

---

### Task 9: Client components — create, rename, delete

**Files:**
- Create: `apps/web/app/_files/NewFolderButton.tsx`, `apps/web/app/_files/FolderAdminControls.tsx`

**Interfaces:**
- Consumes: the three actions from Task 8.
- Produces: `<NewFolderButton parentId={string} />`, `<FolderAdminControls folderId={string} name={string} description={string} />`.

**Background:** follow `DeleteFileButton.tsx` — `"use client"`, `useTransition`, `useRouter().refresh()` on success so the server-rendered list re-fetches, and the service's German error rendered inline in `text-bdas-red`. Use `Button` from `@bdas/design-system`. No overlay/modal primitive exists in the design system; use the inline two-step confirm idiom.

- [ ] **Step 1: Write NewFolderButton**

Create `apps/web/app/_files/NewFolderButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@bdas/design-system";

import { createFolderAction } from "./folder-actions";

/**
 * Inline create form for a subfolder. Rendered only where the server already
 * determined the viewer may write to the parent — this component performs no
 * permission check of its own; the service is the authority.
 */
export function NewFolderButton({ parentId }: { parentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Neuer Ordner
      </Button>
    );
  }

  function submit() {
    setError(null);
    start(async () => {
      const result = await createFolderAction(parentId, name, description);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setName("");
      setDescription("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card">
      <label className="flex flex-col gap-1 text-sm text-bdas-ink-body">
        Name
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-bdas-ink-body">
        Beschreibung (optional)
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
      </label>
      {error ? <span className="text-sm text-bdas-red">{error}</span> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Wird angelegt…" : "Anlegen"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
```

Radius classes in this repo are `rounded-bdas-sm` (6px, inner items), `rounded-bdas` (12px, cards), `rounded-bdas-pill`, and `rounded-bdas-full`. There is no `rounded-bdas-inner`. Never inline `rounded-[6px]`.

- [ ] **Step 2: Write FolderAdminControls**

Create `apps/web/app/_files/FolderAdminControls.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@bdas/design-system";

import { deleteFolderAction, renameFolderAction } from "./folder-actions";

/**
 * Rename + delete for one subfolder. Delete is a two-step inline confirm and
 * the service refuses a non-empty folder, so the confirm is about intent, not
 * about data loss.
 */
export function FolderAdminControls({
  folderId,
  name,
  description,
}: {
  folderId: string;
  name: string;
  description: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "rename" | "confirmDelete">("idle");
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("idle");
      router.refresh();
    });
  }

  if (mode === "rename") {
    return (
      <div className="flex flex-col gap-2">
        <input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          maxLength={80}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
        <input
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          placeholder="Beschreibung (optional)"
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
        {error ? <span className="text-sm text-bdas-red">{error}</span> : null}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => renameFolderAction(folderId, draftName, draftDescription))}
          >
            {pending ? "Wird gespeichert…" : "Speichern"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("idle")} disabled={pending}>
            Abbrechen
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "confirmDelete") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => deleteFolderAction(folderId))}
          >
            {pending ? "Wird gelöscht…" : "Wirklich löschen"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("idle")} disabled={pending}>
            Abbrechen
          </Button>
        </div>
        {error ? <span className="text-xs text-bdas-red">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => setMode("rename")}>
          Umbenennen
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setMode("confirmDelete")}>
          Löschen
        </Button>
      </div>
      {error ? <span className="text-xs text-bdas-red">{error}</span> : null}
    </div>
  );
}
```

- [ ] **Step 3: Verify it typechecks and lints**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. `Button` accepts `variant` of `"primary" | "secondary" | "ghost"` and `size` of `"sm" | "md"` (`core/design-system/src/components/Button.tsx:6-7`) — all usages above are within that set.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_files/NewFolderButton.tsx apps/web/app/_files/FolderAdminControls.tsx
git commit -m "feat(web): inline folder create, rename, and delete controls"
```

---

### Task 10: Wire the tree into the three folder pages

**Files:**
- Create: `apps/web/app/_files/Breadcrumbs.tsx`
- Modify: `apps/web/app/dateien/[folderId]/page.tsx`, `apps/web/app/(board)/federal/files/[folderId]/page.tsx`, `apps/web/app/(board)/gruppe/[slug]/files/[folderId]/page.tsx`
- Modify: `apps/web/app/_files/FolderIndex.tsx`

**Interfaces:**
- Consumes: `buildBreadcrumbs` (Task 7), `NewFolderButton`/`FolderAdminControls` (Task 9), `canWriteFolder` from `@bdas/files` (already exported, `index.ts:16`).
- Produces: `<Breadcrumbs trail={Folder[]} hrefBase={string} />`.

**Background:** each folder page currently loads `listFolders` and finds one folder by id (`dateien/[folderId]/page.tsx:23`). That same flat list is everything needed for both the breadcrumb trail and the child list — no additional query. Write permission is computed **server-side** with `canWriteFolder(folder, me)` and used only to decide whether to render the controls; the services re-check regardless.

- [ ] **Step 1: Write the Breadcrumbs component**

Create `apps/web/app/_files/Breadcrumbs.tsx`:

```tsx
import Link from "next/link";

import type { Folder } from "@bdas/files";

/**
 * Root-first breadcrumb trail. The last entry is the current folder and is not
 * a link. `hrefBase` is the surface's folder path prefix, e.g. "/dateien".
 */
export function Breadcrumbs({ trail, hrefBase }: { trail: Folder[]; hrefBase: string }) {
  return (
    <nav aria-label="Pfad" className="flex flex-wrap items-center gap-1 text-sm">
      <Link href={hrefBase} className="text-bdas-ink-muted hover:underline">
        Alle Ordner
      </Link>
      {trail.map((folder, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={folder.id} className="flex items-center gap-1">
            <span aria-hidden className="text-bdas-ink-muted">
              ›
            </span>
            {isLast ? (
              <span className="text-bdas-ink-body">{folder.name}</span>
            ) : (
              <Link
                href={`${hrefBase}/${folder.id}`}
                className="text-bdas-ink-muted hover:underline"
              >
                {folder.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Let FolderIndex render a subfolder section**

In `apps/web/app/_files/FolderIndex.tsx`, add an optional `emptyLabel` prop so the component can say "Keine Unterordner." in the child context instead of "Keine Ordner.". Change the signature and the empty branch:

```tsx
export function FolderIndex({
  folders,
  groupNames,
  counts,
  hrefBase,
  emptyLabel = "Keine Ordner.",
}: {
  folders: Folder[];
  groupNames: Record<string, string>;
  counts: Record<string, number>;
  hrefBase: string;
  emptyLabel?: string;
}) {
  if (folders.length === 0) {
    return (
      <div className="rounded-bdas border border-bdas-soft bg-bdas-surface p-6 text-center text-bdas-ink-muted shadow-bdas-card">
        {emptyLabel}
      </div>
    );
  }
```

Leave the rest of the component unchanged.

- [ ] **Step 3: Update the member folder page**

Rewrite `apps/web/app/dateien/[folderId]/page.tsx` as:

```tsx
import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { canWriteFolder, folderFileCounts, listFiles, listFolders } from "@bdas/files";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { requireFilesFlag } from "../../_files/flag";
import { Breadcrumbs } from "../../_files/Breadcrumbs";
import { buildBreadcrumbs } from "../../_files/breadcrumbs";
import { FileList } from "../../_files/FileList";
import { FolderAdminControls } from "../../_files/FolderAdminControls";
import { FolderIndex } from "../../_files/FolderIndex";
import { NewFolderButton } from "../../_files/NewFolderButton";
import { readSessionCookie } from "../../../lib/auth-cookie";

export const metadata = { title: "Ordner" };

export default async function DateiOrdnerPage({ params }: { params: { folderId: string } }) {
  requireFilesFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) notFound();

  // Only folders the member may read are returned; an unknown or forbidden id is
  // indistinguishable from missing here — no existence leak.
  const readable = await listFolders(db, me);
  const folder = readable.find((f) => f.id === params.folderId);
  if (!folder) notFound();

  const children = readable.filter((f) => f.parentId === folder.id);
  const [files, groups, counts] = await Promise.all([
    listFiles(db, params.folderId, me),
    listGroups(db),
    folderFileCounts(
      db,
      children.map((c) => c.id),
      me,
    ),
  ]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  const canWrite = canWriteFolder(folder, me);
  const trail = buildBreadcrumbs(readable, folder.id);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <Breadcrumbs trail={trail} hrefBase="/dateien" />
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold text-bdas-ink">{folder.name}</h1>
          {canWrite && folder.parentId !== null ? (
            <FolderAdminControls
              folderId={folder.id}
              name={folder.name}
              description={folder.description}
            />
          ) : null}
        </div>
        {folder.description ? <p className="text-bdas-ink-body">{folder.description}</p> : null}
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-bdas-ink">Unterordner</h2>
          {canWrite ? <NewFolderButton parentId={folder.id} /> : null}
        </div>
        <FolderIndex
          folders={children}
          groupNames={groupNames}
          counts={counts}
          hrefBase="/dateien"
          emptyLabel="Keine Unterordner."
        />
      </section>

      <FileList files={files} folderId={params.folderId} canWrite={false} />
    </main>
  );
}
```

- [ ] **Step 4: Apply the same treatment to the two board pages**

Open `apps/web/app/(board)/federal/files/[folderId]/page.tsx` and `apps/web/app/(board)/gruppe/[slug]/files/[folderId]/page.tsx`. Each already resolves a folder and renders a `FileList`. In each, make the same four additions, adapting `hrefBase` to that surface's own prefix (`/federal/files` and `/gruppe/${params.slug}/files` respectively — read the file to confirm the exact existing link prefix and reuse it verbatim):

1. Replace the single-folder lookup with `const readable = await listFolders(db, me); const folder = readable.find(...)`.
2. Add `const children = readable.filter((f) => f.parentId === folder.id);` and fetch `folderFileCounts` for those child ids.
3. Render `<Breadcrumbs trail={buildBreadcrumbs(readable, folder.id)} hrefBase={...} />` in the header, replacing whatever back-link exists.
4. Render the `Unterordner` section with `<NewFolderButton>` and `<FolderAdminControls>` gated on `canWriteFolder(folder, me)` — and gate `FolderAdminControls` additionally on `folder.parentId !== null`, since roots cannot be renamed or deleted.

Do not change the existing `canWrite` value these pages already pass to `FileList` — that governs uploads and is out of scope here.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm --filter @bdas/web test`
Expected: PASS.

- [ ] **Step 6: Manual smoke test against local Postgres**

```bash
pnpm db:up
pnpm db:migrate
BDAS_FLAG_FILES=true pnpm dev
```

Log in as a member with a `local_board` grant, open `/dateien`, enter the group's Vorstand folder, and confirm:
- "Neuer Ordner" appears; creating "Protokolle" adds it to the Unterordner list
- entering it shows `Alle Ordner › … › Protokolle` and its own "Neuer Ordner"
- "Umbenennen" changes the title; "Löschen" removes an empty folder
- uploading a file into it, then trying "Löschen", shows **Ordner ist nicht leer.**
- a member **without** that board grant sees neither the folder nor the buttons

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_files/Breadcrumbs.tsx apps/web/app/_files/FolderIndex.tsx "apps/web/app/dateien/[folderId]/page.tsx" "apps/web/app/(board)/federal/files/[folderId]/page.tsx" "apps/web/app/(board)/gruppe/[slug]/files/[folderId]/page.tsx"
git commit -m "feat(web): folder tree with breadcrumbs and board controls"
```

---

### Task 11: Ship

**Files:** none — this task is process.

- [ ] **Step 1: Run the whole suite and the gates**

```bash
pnpm db:up
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

Expected: PASS. `format:check` is a CI gate — run `pnpm format` if it fails.

- [ ] **Step 2: Open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(files): folder nesting" --body "$(cat <<'EOF'
Implements PR 1 of docs/superpowers/specs/2026-07-29-file-nesting-and-preview-design.md.

Subfolders inside the four system-provisioned roots, created by whoever may
already upload there (`canWrite`). A subfolder permanently inherits its parent's
scope and group — enforced by a database trigger, so `permissions.ts` is
unchanged and no new role logic exists. Depth capped at 5. Deletion refused
while a folder holds anything.

`folders_scope_group_uq` and the global `slug` UNIQUE both became partial
indexes scoped to roots; the root slug index is load-bearing for
`ensureFolders` idempotency.

⚠️ Requires a manual production migration apply — see below.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Run the required reviews**

Run `/review`, then `/security-review` — the working agreement requires a security review on **every** files PR. Put these in front of the reviewer:

- the `folders_inherit_trg` trigger is the only thing preventing a subfolder from diverging from its parent's permissions
- `folders_root_slug_uq` is what keeps `ensureFolders` idempotent (the `(scope, group_id)` unique never did, because Postgres treats NULL group ids as distinct)
- write gating is `canWrite(parent)` for create and `canWrite(folder)` for rename/delete, with roots refused outright

- [ ] **Step 4: Apply the migration to production — after merge, before announcing**

Vercel does **not** run the migration runner on deploy. `folders` is a live table serving real users (`BDAS_FLAG_FILES` is on), so the deployed code will 500 on `column parent_id does not exist` until this is applied.

```bash
vercel env pull .env.prod.local --environment=production --yes
DATABASE_URL=$(grep '^DATABASE_URL' .env.prod.local | cut -d= -f2- | tr -d '"') pnpm db:migrate
rm -f .env.prod.local
```

Expected output: every earlier migration `skip`, and exactly one `apply files/0003_folder_nesting.sql`. If it applies more than one file, it connected to the wrong database — stop and investigate.

`pnpm db:migrate:dry` is **not** a safety check here: it returns before opening a connection and simply lists every SQL file on disk.

- [ ] **Step 5: Verify production**

```bash
curl -s -L https://bdas.de/dateien | grep -o "Dokumente, die dir zur Verfügung stehen"
```

Expected: the page still renders. Then log in as a board member and create one subfolder.

---

## Self-Review

**Spec coverage.** D1 inheritance → Task 1 (trigger) + Task 4 (service copies parent scope) + Task 4's visibility test. D2 create right = `canWrite` → Task 4. D3 no `event_organizer` rights → satisfied by omission; no role logic is added anywhere. D4 delete refused when non-empty → Task 5. D5 roots system-owned → Tasks 5 and 10. Schema section → Task 1. Services table → Tasks 4-5. UI section → Tasks 7, 9, 10. Deployment warning → Task 11 Step 4. Testing section → Tasks 1, 2, 4, 5, 7. Review section → Task 11 Step 3.

**Gap found and closed:** the spec's migration sketch dropped `folders_scope_group_uq` but missed the **global `UNIQUE` on `slug`** (`0001_init.sql:7`), which would have blocked two subfolders sharing a name under different parents. Task 1 drops `folders_slug_key` and replaces it with a root-scoped and a sibling-scoped partial index. The related discovery — that `ensureFolders` idempotency rests on the slug unique rather than the `(scope, group_id)` unique, because Postgres treats NULLs as distinct — is documented in the migration and in the review notes.

**Type consistency.** `Folder.parentId: string | null` and `Folder.depth: number` are introduced in Task 3 and used identically in Tasks 4, 5, 7, 10. `FolderActionResult` is defined once in Task 8 and consumed in Task 9. `buildBreadcrumbs(folders, folderId)` has one signature across Tasks 7 and 10. `MAX_FOLDER_DEPTH` is defined in Task 3, exported in Task 6, and consumed in Tasks 4 and 7.

**Deliberately deferred to their own plans:** inline preview (PR 2), search/quota/recency (PR 3), trash (PR 4).
