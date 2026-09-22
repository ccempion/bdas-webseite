# Editable Content Pages (Puck) — BSR Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Board-editable content pages stored as Puck JSON documents, shipping the public Bundessprecher\*innenrat page (`/ueber-uns/bundessprecherinnenrat`) with an in-browser editor for `federal_board` users.

**Architecture:** New `modules/content` owns a `content_pages` table (slug → Puck JSON) with `getPage`/`savePage` services; authorization (`federal_board` only) is enforced inside the module. `apps/web` integrates `@puckeditor/core`: a three-block German palette (Überschrift, Absatz, Personen-Raster with photo upload), a public Server-Component page rendering via `<Render>`, and a client editor page gated server-side. Photos go to a public `content-media` Supabase bucket via a new `core/storage` pair mirroring `event-media`.

**Tech Stack:** TypeScript, Next.js 14 App Router, Drizzle ORM, PostgreSQL (Docker for tests), zod, `@puckeditor/core` ^0.22, Supabase storage, Tailwind + `@bdas/design-system` tokens, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-14-content-pages-design.md`

## Global Constraints

- Module rules (CLAUDE.md §1): only `modules/content` touches `content_pages`; public surface is `modules/content/src/index.ts`; migrations in `modules/content/migrations/` registered in `infra/migrations/src/manifest.ts`; feature flag `content` gates every route.
- `@puckeditor/core` is a dependency of **`apps/web` only** — never of a module or `core/` package.
- All user-facing copy is German. The Puck editor chrome itself is English (board-only surface, accepted in ADR 0023); block/field labels are German.
- Styling only via design tokens / `@bdas/design-system` — no inline hex, radius, shadow, or duration values.
- Module tests run against real Postgres: `docker compose up -d` first; tests skip when unreachable (mirror `modules/groups/src/index.test.ts`).
- Save = live; no drafts. Document size cap 512 KB; upload cap 10 MB, mime allowlist JPG/PNG/WebP/AVIF.
- Slug for this page everywhere: `ueber-uns/bundessprecherinnenrat`.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `modules/content` scaffold, migration, feature flag

**Files:**

- Create: `modules/content/package.json`
- Create: `modules/content/tsconfig.json`
- Create: `modules/content/README.md`
- Create: `modules/content/migrations/0001_init.sql`
- Create: `modules/content/src/schema.ts`
- Create: `modules/content/src/test-db.ts`
- Create: `modules/content/src/index.ts` (minimal; full surface in Task 2)
- Create: `modules/content/src/index.test.ts` (first test; extended in Task 2)
- Modify: `infra/migrations/src/manifest.ts` (append `"content"`)
- Modify: `core/feature-flags/src/index.ts` (add `"content"` to `FLAGS`)
- Modify: `.env.example` (add `BDAS_FLAG_CONTENT=false` under the other `BDAS_FLAG_*` lines and `SUPABASE_CONTENT_MEDIA_BUCKET=content-media` after `SUPABASE_EVENT_MEDIA_BUCKET`)

**Interfaces:**

- Consumes: `createTestDb` from `@bdas/db/test`.
- Produces: table `content_pages`; Drizzle schema `contentPages` + `ContentPageRow`; test harness `dbReachable()` / `setupContentDb()` / `CONTENT_TEST_MIGRATIONS`; flag name `content`.

- [ ] **Step 1: Scaffold the workspace package**

`modules/content/package.json`:

```json
{
  "name": "@bdas/content",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --dir src"
  },
  "dependencies": {
    "@bdas/db": "workspace:*",
    "@bdas/errors": "workspace:*",
    "@bdas/events": "workspace:*",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.5",
    "zod": "^3.23.8"
  }
}
```

`modules/content/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

`modules/content/README.md`:

```markdown
# @bdas/content

Board-editable content pages stored as Puck JSON documents
(spec: `docs/superpowers/specs/2026-07-14-content-pages-design.md`, ADR 0023).

## Owned tables

| Table           | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `content_pages` | One row per editable page: slug → Puck JSON document |

## Public surface

- `getPage(db, slug)` — read a page (public; no auth).
- `savePage(db, { slug, data, actor })` — upsert a page. Throws `ForbiddenError`
  unless the actor's grants include `federal_board`; validates the Puck `Data`
  shape (zod) and caps the document at 512 KB.
- `PuckDataSchema`, types `ContentPage`, `PageData`, `ContentActor`, `ActorGrant`.
- Event `content.page.saved` via `core/events`.

The module never imports Puck — it stores documents opaquely. The Puck editor,
block palette, and rendering live in `apps/web` (`app/_content/`).

## Tests

Integration tests against Docker Postgres: `docker compose up -d`, then
`pnpm --filter @bdas/content test`. Tests skip when the DB is unreachable.
```

`modules/content/src/index.ts` (minimal for now):

```ts
/**
 * @bdas/content — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to
 * other workspaces. Internal files are not importable.
 */

export type { ContentPageRow } from "./schema";
```

- [ ] **Step 2: Write the failing migration test**

`modules/content/src/test-db.ts`:

```ts
/**
 * Private test harness for the content module. Not re-exported from index.ts.
 * `content_pages` has no FKs — only this module's migrations run.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { createTestDb, type TestDb } from "@bdas/db/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

/** Migration files, in apply order. Append new content migrations here. */
export const CONTENT_TEST_MIGRATIONS: ReadonlyArray<ReadonlyArray<string>> = [
  ["..", "migrations", "0001_init.sql"],
];

export async function dbReachable(): Promise<boolean> {
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

/** Fresh schema with every content migration applied. */
export async function setupContentDb(): Promise<TestDb> {
  const t = await createTestDb();
  for (const file of CONTENT_TEST_MIGRATIONS) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
  return t;
}
```

`modules/content/src/index.test.ts`:

```ts
/**
 * Content integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupContentDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

describeIfDb("content schema", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupContentDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("applies the migration and accepts a page row", async () => {
    await t.client`
      INSERT INTO content_pages (slug, data, updated_by)
      VALUES ('ueber-uns/bundessprecherinnenrat', '{"root":{"props":{}},"content":[]}'::jsonb, 'usr_x')
    `;
    const rows = await t.client`SELECT slug, data, updated_by FROM content_pages`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["slug"]).toBe("ueber-uns/bundessprecherinnenrat");
    expect(rows[0]?.["updated_by"]).toBe("usr_x");
  });
});
```

- [ ] **Step 3: Install and run the test to verify it fails**

Run:

```bash
pnpm install
docker compose up -d
pnpm --filter @bdas/content test
```

Expected: FAIL — `ENOENT … migrations/0001_init.sql` (migration file does not exist yet).

- [ ] **Step 4: Write the migration + Drizzle schema**

`modules/content/migrations/0001_init.sql`:

```sql
-- Content module — board-editable pages stored as Puck JSON documents
-- (design docs/superpowers/specs/2026-07-14-content-pages-design.md, ADR 0023).

CREATE TABLE content_pages (
  slug        text PRIMARY KEY,
  data        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text NOT NULL
);

-- RLS lockdown: the app reaches this table only via the service-role /
-- direct-Postgres path (bypasses RLS). No permissive policy ⇒ Supabase
-- `anon` and `authenticated` roles are denied. ENABLE is idempotent.
ALTER TABLE content_pages ENABLE ROW LEVEL SECURITY;
```

`modules/content/src/schema.ts`:

```ts
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const contentPages = pgTable("content_pages", {
  slug: text("slug").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull(),
});

export type ContentPageRow = typeof contentPages.$inferSelect;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @bdas/content test`
Expected: PASS (1 test). If it reports "skipped", Docker Postgres is not up — `docker compose up -d` and re-run.

- [ ] **Step 6: Register migration, flag, env**

In `infra/migrations/src/manifest.ts`, append to `MIGRATION_MANIFEST` (after `"events"`):

```ts
  // Phase 3 onward — append as modules land.
  "content",
```

In `core/feature-flags/src/index.ts`, add `"content"` to the `FLAGS` array after `"group_map"`:

```ts
  "group_map",
  "content",
] as const;
```

In `.env.example`: add `BDAS_FLAG_CONTENT=false` directly under the other `BDAS_FLAG_*` lines, and `SUPABASE_CONTENT_MEDIA_BUCKET=content-media` directly under `SUPABASE_EVENT_MEDIA_BUCKET=event-media`.

- [ ] **Step 7: Verify workspace health**

Run:

```bash
pnpm --filter @bdas/content typecheck
pnpm --filter @bdas/feature-flags test
pnpm --filter @bdas/migrations test
```

Expected: typecheck clean; feature-flags and migrations tests PASS. If a migrations test asserts the manifest list, update its expectation to include `"content"`.

- [ ] **Step 8: Commit**

```bash
git add modules/content infra/migrations/src/manifest.ts core/feature-flags/src/index.ts .env.example pnpm-lock.yaml
git commit -m "feat(content): content module scaffold — content_pages table, flag, manifest

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `getPage` / `savePage` services, events, public surface

**Files:**

- Create: `modules/content/src/types.ts`
- Create: `modules/content/src/events.ts`
- Create: `modules/content/src/services/pages.ts`
- Modify: `modules/content/src/index.ts`
- Modify: `modules/content/src/index.test.ts` (replace the schema smoke test with service tests)

**Interfaces:**

- Consumes: `contentPages` from Task 1; `ForbiddenError`, `ValidationError` from `@bdas/errors`; `getEventBus` from `@bdas/events`.
- Produces (used by Tasks 7–9):
  - `getPage(db: Db, slug: string): Promise<ContentPage | null>`
  - `savePage(db: Db, input: { slug: string; data: unknown; actor: ContentActor }): Promise<ContentPage>`
  - `ContentPage = { slug: string; data: PageData; updatedAt: Date }`
  - `ContentActor = { userId: string; grants: ReadonlyArray<{ role: string; groupId: string | null }> }` — structurally compatible with `@bdas/members`' `Grant[]`, so routes pass `me.grants` directly.
  - Event `ContentPageSaved` with `type: "content.page.saved"`.

- [ ] **Step 1: Write the failing service tests**

Replace the whole body of `modules/content/src/index.test.ts` with:

```ts
/**
 * Content integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import type { ContentPageSaved } from "./events";
import { getPage, savePage } from "./services/pages";
import { dbReachable, setupContentDb } from "./test-db";
import type { ContentActor } from "./types";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

const SLUG = "ueber-uns/bundessprecherinnenrat";

const FEDERAL: ContentActor = {
  userId: "usr_federal",
  grants: [{ role: "federal_board", groupId: null }],
};
const PLAIN: ContentActor = {
  userId: "usr_plain",
  grants: [{ role: "member", groupId: null }],
};

const DOC = {
  root: { props: {} },
  content: [{ type: "Absatz", props: { id: "Absatz-1", text: "Hallo BSR" } }],
};

describeIfDb("content pages service", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupContentDb();
    resetEventBus();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("save → get roundtrip", async () => {
    await savePage(t.db, { slug: SLUG, data: DOC, actor: FEDERAL });
    const page = await getPage(t.db, SLUG);
    expect(page?.slug).toBe(SLUG);
    expect(page?.data).toEqual(DOC);
    expect(page?.updatedAt).toBeInstanceOf(Date);
  });

  it("getPage returns null for an unknown slug", async () => {
    expect(await getPage(t.db, "nicht/da")).toBeNull();
  });

  it("saving again overwrites (upsert) and stamps updated_by", async () => {
    await savePage(t.db, { slug: SLUG, data: DOC, actor: FEDERAL });
    const second = {
      root: { props: {} },
      content: [{ type: "Absatz", props: { id: "Absatz-1", text: "Neuer Text" } }],
    };
    await savePage(t.db, {
      slug: SLUG,
      data: second,
      actor: { userId: "usr_zweite", grants: FEDERAL.grants },
    });
    const page = await getPage(t.db, SLUG);
    expect(page?.data).toEqual(second);
    const rows = await t.client`SELECT updated_by FROM content_pages WHERE slug = ${SLUG}`;
    expect(rows[0]?.["updated_by"]).toBe("usr_zweite");
  });

  it("rejects a non-federal actor", async () => {
    await expect(savePage(t.db, { slug: SLUG, data: DOC, actor: PLAIN })).rejects.toThrow(
      /Bundesvorstand/,
    );
    expect(await getPage(t.db, SLUG)).toBeNull();
  });

  it("rejects an invalid slug", async () => {
    await expect(
      savePage(t.db, { slug: "Über Uns/BSR!", data: DOC, actor: FEDERAL }),
    ).rejects.toThrow(/Slug/);
  });

  it("rejects a document that is not Puck-shaped", async () => {
    await expect(
      savePage(t.db, { slug: SLUG, data: { html: "<script>alert(1)</script>" }, actor: FEDERAL }),
    ).rejects.toThrow(/Seitendokument/);
  });

  it("rejects an oversized document", async () => {
    const big = {
      root: { props: {} },
      content: [{ type: "Absatz", props: { id: "a", text: "x".repeat(600 * 1024) } }],
    };
    await expect(savePage(t.db, { slug: SLUG, data: big, actor: FEDERAL })).rejects.toThrow(
      /zu groß/,
    );
  });

  it("emits content.page.saved", async () => {
    const seen: ContentPageSaved[] = [];
    getEventBus().subscribe<ContentPageSaved>("content.page.saved", (e) => {
      seen.push(e);
    });
    await savePage(t.db, { slug: SLUG, data: DOC, actor: FEDERAL });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ slug: SLUG, updatedBy: "usr_federal" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/content test`
Expected: FAIL — cannot resolve `./services/pages`, `./types`, `./events`.

- [ ] **Step 3: Implement types, events, service**

`modules/content/src/types.ts`:

```ts
import { z } from "zod";

const PuckComponent = z.object({ type: z.string(), props: z.record(z.unknown()) });

/**
 * Structural check of Puck's `Data` shape. The module stores documents
 * opaquely — it never imports Puck (ADR 0023); this schema is the boundary.
 */
export const PuckDataSchema = z
  .object({
    root: z.object({ props: z.record(z.unknown()).optional() }).passthrough(),
    content: z.array(PuckComponent),
    zones: z.record(z.array(PuckComponent)).optional(),
  })
  .passthrough();

export type PageData = z.infer<typeof PuckDataSchema>;

export type ContentPage = {
  readonly slug: string;
  readonly data: PageData;
  readonly updatedAt: Date;
};

/** Minimal grant shape — structurally compatible with @bdas/members' Grant. */
export type ActorGrant = {
  readonly role: string;
  readonly groupId: string | null;
};

export type ContentActor = {
  readonly userId: string;
  readonly grants: ReadonlyArray<ActorGrant>;
};
```

`modules/content/src/events.ts`:

```ts
/**
 * Events emitted by the content module. Subscribers depend on the types,
 * not on the producing services. (CLAUDE.md §3.)
 */

export type ContentPageSaved = {
  readonly type: "content.page.saved";
  readonly slug: string;
  readonly updatedBy: string;
  readonly at: Date;
};

export type ContentEvent = ContentPageSaved;
```

`modules/content/src/services/pages.ts`:

```ts
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ForbiddenError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { ContentPageSaved } from "../events";
import { contentPages } from "../schema";
import { PuckDataSchema, type ContentActor, type ContentPage, type PageData } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

const SLUG_RE = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const MAX_SLUG_LENGTH = 200;
const MAX_DATA_BYTES = 512 * 1024;

export async function getPage(db: Db, slug: string): Promise<ContentPage | null> {
  const rows = await db.select().from(contentPages).where(eq(contentPages.slug, slug)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { slug: row.slug, data: row.data as PageData, updatedAt: row.updatedAt };
}

export async function savePage(
  db: Db,
  input: { slug: string; data: unknown; actor: ContentActor },
): Promise<ContentPage> {
  if (!input.actor.grants.some((g) => g.role === "federal_board")) {
    throw new ForbiddenError("Nur der Bundesvorstand darf Seiten bearbeiten.");
  }
  if (input.slug.length > MAX_SLUG_LENGTH || !SLUG_RE.test(input.slug)) {
    throw new ValidationError("Ungültiger Seiten-Slug.");
  }
  const parsed = PuckDataSchema.safeParse(input.data);
  if (!parsed.success) {
    throw new ValidationError("Ungültiges Seitendokument.");
  }
  if (Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > MAX_DATA_BYTES) {
    throw new ValidationError("Seitendokument zu groß (max. 512 KB).");
  }

  const now = new Date();
  await db
    .insert(contentPages)
    .values({ slug: input.slug, data: parsed.data, updatedAt: now, updatedBy: input.actor.userId })
    .onConflictDoUpdate({
      target: contentPages.slug,
      set: { data: parsed.data, updatedAt: now, updatedBy: input.actor.userId },
    });

  const event: ContentPageSaved = {
    type: "content.page.saved",
    slug: input.slug,
    updatedBy: input.actor.userId,
    at: now,
  };
  await getEventBus().publish(event);

  return { slug: input.slug, data: parsed.data, updatedAt: now };
}
```

Replace `modules/content/src/index.ts` with the full surface:

```ts
/**
 * @bdas/content — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to
 * other workspaces. Internal files are not importable.
 */

export { getPage, savePage } from "./services/pages";
export { PuckDataSchema } from "./types";
export type { ActorGrant, ContentActor, ContentPage, PageData } from "./types";
export type { ContentEvent, ContentPageSaved } from "./events";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/content test && pnpm --filter @bdas/content typecheck`
Expected: 8 tests PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add modules/content
git commit -m "feat(content): getPage/savePage — federal-only upsert of Puck documents

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `content-media` storage pair in `core/storage`

**Files:**

- Modify: `core/storage/src/index.ts` (append below the `eventMediaPublicUrl` function, before the final `export { SupabaseStorageClient };`)
- Create: `core/storage/src/content-media.test.ts`

**Interfaces:**

- Produces (used by Task 6): `getContentMediaStorage(): SupabaseStorageClient` and `contentMediaPublicUrl(storageKey: string): string`, env `SUPABASE_CONTENT_MEDIA_BUCKET` (default `content-media`).

- [ ] **Step 1: Write the failing tests**

`core/storage/src/content-media.test.ts` (mirrors `event-media.test.ts`):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("getContentMediaStorage", () => {
  it("throws a clear error when storage env is missing", async () => {
    vi.resetModules();
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const { getContentMediaStorage } = await import("./index");
    expect(() => getContentMediaStorage()).toThrow(/content-media/i);
  });

  it("builds a public URL for a key when configured", async () => {
    vi.resetModules();
    process.env["SUPABASE_URL"] = "https://proj.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "svc";
    const { getContentMediaStorage } = await import("./index");
    const url = getContentMediaStorage().publicUrl("seite/foto.jpg");
    expect(url).toContain("/storage/v1/object/public/content-media/seite/foto.jpg");
  });
});

describe("contentMediaPublicUrl", () => {
  it("returns a deterministic public URL without the service-role key", async () => {
    vi.resetModules();
    process.env["SUPABASE_URL"] = "https://proj.supabase.co";
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const { contentMediaPublicUrl } = await import("./index");
    const url = contentMediaPublicUrl("seite/foto.jpg");
    expect(url).toContain("/storage/v1/object/public/content-media/seite/foto.jpg");
  });

  it("throws when SUPABASE_URL is missing", async () => {
    vi.resetModules();
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const { contentMediaPublicUrl } = await import("./index");
    expect(() => contentMediaPublicUrl("seite/foto.jpg")).toThrow(/SUPABASE_URL/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/storage test`
Expected: the 4 new tests FAIL (`getContentMediaStorage is not a function`); existing tests still PASS.

- [ ] **Step 3: Implement**

In `core/storage/src/index.ts`, insert after `eventMediaPublicUrl` (keep `export { SupabaseStorageClient };` last):

```ts
let _contentMedia: SupabaseStorageClient | null = null;

/** Storage client for the public `content-media` bucket (board-editable page imagery, ADR 0023). */
export function getContentMediaStorage(): SupabaseStorageClient {
  if (_contentMedia) return _contentMedia;
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const bucket = process.env["SUPABASE_CONTENT_MEDIA_BUCKET"] ?? "content-media";
  if (!url || !serviceRoleKey) {
    throw new Error(
      "content-media storage is not configured (need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  _contentMedia = new SupabaseStorageClient({ url, serviceRoleKey, bucket });
  return _contentMedia;
}

/** Deterministic public URL for a content-media object. Needs only SUPABASE_URL
 *  (no service-role key) — safe to call on public read paths. */
export function contentMediaPublicUrl(storageKey: string): string {
  const url = process.env["SUPABASE_URL"];
  const bucket = process.env["SUPABASE_CONTENT_MEDIA_BUCKET"] ?? "content-media";
  if (!url) {
    throw new Error("content-media public URL needs SUPABASE_URL.");
  }
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${storageKey}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/storage test && pnpm --filter @bdas/storage typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add core/storage
git commit -m "feat(storage): content-media bucket pair for editable-page imagery

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `apps/web` wiring — Puck dependency, transpile, legacy-redirect exception

**Files:**

- Modify: `apps/web/package.json` (add deps)
- Modify: `apps/web/next.config.mjs` (transpilePackages + redirect regex)

**Interfaces:**

- Produces: importable `@puckeditor/core` and `@bdas/content` inside `apps/web`; `/ueber-uns/bundessprecherinnenrat` no longer swallowed by the WordPress legacy redirect.

- [ ] **Step 1: Add dependencies**

In `apps/web/package.json` `dependencies`, add (alphabetical position):

```json
    "@bdas/content": "workspace:*",
    "@puckeditor/core": "^0.22.1",
```

Run: `pnpm install`
Expected: lockfile updates, `node_modules/@puckeditor/core` exists.

- [ ] **Step 2: Verify the Puck CSS export path**

Run: `node -e "console.log(JSON.stringify(require('./apps/web/node_modules/@puckeditor/core/package.json').exports ?? {}, null, 2))" 2>/dev/null || cat node_modules/@puckeditor/core/package.json | head -40`
Expected: an exports entry for a CSS file — normally `"./puck.css"`. If the path differs (e.g. `./dist/index.css`), use that path in Task 5's `PuckEditor.tsx` import instead of `@puckeditor/core/puck.css`.

- [ ] **Step 3: Update next.config.mjs**

In `transpilePackages`, add `"@bdas/content",` (list is roughly alphabetical — put it after `"@bdas/auth"`).

In `redirects()`, change the Über-uns legacy rule to except the new page (and its `/bearbeiten` child):

```js
      {
        source: "/ueber-uns/:slug((?!verbandsstruktur|bdaj|bundessprecherinnenrat).*)",
        destination: "/ueber-uns",
        permanent: true,
      },
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @bdas/web typecheck`
Expected: clean (nothing imports the new packages yet).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/next.config.mjs pnpm-lock.yaml
git commit -m "feat(web): wire @puckeditor/core + @bdas/content; unblock BSR slug from legacy redirect

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Puck block palette, photo field, editor client component

**Files:**

- Create: `apps/web/app/_content/FotoField.tsx`
- Create: `apps/web/app/_content/puck-config.tsx`
- Create: `apps/web/app/_content/PuckEditor.tsx`
- Create: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `Card`, `Alert` from `@bdas/design-system`; `Config`, `Data`, `Puck` from `@puckeditor/core`; `POST /api/content/upload-url` (Task 6 — the field is testable without it; the fetch 404s until Task 6 lands).
- Produces (used by Tasks 7–8): `puckConfig: Config` (blocks `Ueberschrift`, `Absatz`, `PersonenRaster`); `PuckEditor({ slug, initialData })` client component that PUTs to `/api/content/pages/<slug>` on publish.

- [ ] **Step 1: Write the failing palette test**

`apps/web/app/_content/puck-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { puckConfig } from "./puck-config";

describe("puckConfig", () => {
  it("offers exactly the three approved blocks", () => {
    expect(Object.keys(puckConfig.components).sort()).toEqual([
      "Absatz",
      "PersonenRaster",
      "Ueberschrift",
    ]);
  });

  it("PersonenRaster items carry the five BSR fields", () => {
    const personen = puckConfig.components.PersonenRaster?.fields?.personen;
    expect(personen).toBeDefined();
    if (personen?.type !== "array") throw new Error("personen must be an array field");
    expect(Object.keys(personen.arrayFields).sort()).toEqual([
      "foto",
      "name",
      "rolle",
      "studiengang",
      "uni",
    ]);
  });

  it("summarises a person by name with a German fallback", () => {
    const personen = puckConfig.components.PersonenRaster?.fields?.personen;
    if (personen?.type !== "array" || !personen.getItemSummary) {
      throw new Error("array field with getItemSummary expected");
    }
    expect(
      personen.getItemSummary(
        { foto: "", name: "Aylin Kaya", rolle: "", uni: "", studiengang: "" },
        0,
      ),
    ).toBe("Aylin Kaya");
    expect(
      personen.getItemSummary({ foto: "", name: "", rolle: "", uni: "", studiengang: "" }, 0),
    ).toBe("Neue Person");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web test -- app/_content`
Expected: FAIL — `./puck-config` not found.

- [ ] **Step 3: Implement the photo field**

`apps/web/app/_content/FotoField.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

/** Custom Puck field: uploads an image via /api/content/upload-url (signed
 *  Supabase upload, federal-board gated) and stores the public URL. */
export function FotoField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/content/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Upload fehlgeschlagen.");
        return;
      }
      const { uploadUrl, publicUrl } = (await res.json()) as {
        uploadUrl: string;
        publicUrl: string;
      };
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) {
        setError("Upload fehlgeschlagen.");
        return;
      }
      onChange(publicUrl);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element -- Supabase-hosted, next/image needs remotePatterns
        <img src={value} alt="" className="h-24 w-24 rounded-bdas-sm object-cover" />
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover disabled:opacity-50"
      >
        {busy ? "Lädt hoch…" : value ? "Foto ersetzen" : "Foto hochladen"}
      </button>
      {error ? <p className="text-sm text-bdas-ink-body">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Implement the palette**

`apps/web/app/_content/puck-config.tsx` (no `"use client"` — block `render` functions run server-side in `<Render>`; `FotoField` is a client reference used only inside the editor):

```tsx
import type { Config } from "@puckeditor/core";

import { Card } from "@bdas/design-system";

import { FotoField } from "./FotoField";

type Person = {
  foto: string;
  name: string;
  rolle: string;
  uni: string;
  studiengang: string;
};

type Blocks = {
  Ueberschrift: { text: string; ebene: "h2" | "h3" };
  Absatz: { text: string };
  PersonenRaster: { personen: Person[] };
};

/**
 * Block palette for board-editable pages (spec §4). Deliberately small —
 * every extra block is maintenance. No raw-HTML block, ever: text renders
 * React-escaped, which is the structural XSS exclusion the spec relies on.
 */
export const puckConfig: Config<Blocks> = {
  components: {
    Ueberschrift: {
      label: "Überschrift",
      fields: {
        text: { type: "text", label: "Text" },
        ebene: {
          type: "select",
          label: "Ebene",
          options: [
            { label: "Groß (h2)", value: "h2" },
            { label: "Klein (h3)", value: "h3" },
          ],
        },
      },
      defaultProps: { text: "Überschrift", ebene: "h2" },
      render: ({ text, ebene }) =>
        ebene === "h3" ? (
          <h3 className="text-xl font-semibold text-bdas-ink">{text}</h3>
        ) : (
          <h2 className="text-2xl font-semibold text-bdas-ink">{text}</h2>
        ),
    },
    Absatz: {
      label: "Absatz",
      fields: { text: { type: "textarea", label: "Text" } },
      defaultProps: { text: "" },
      render: ({ text }) => <p className="whitespace-pre-line text-bdas-ink-body">{text}</p>,
    },
    PersonenRaster: {
      label: "Personen-Raster",
      fields: {
        personen: {
          type: "array",
          label: "Personen",
          arrayFields: {
            foto: {
              type: "custom",
              label: "Foto",
              render: ({ value, onChange }) => <FotoField value={value} onChange={onChange} />,
            },
            name: { type: "text", label: "Name" },
            rolle: { type: "text", label: "Rolle im BSR" },
            uni: { type: "text", label: "Universität" },
            studiengang: { type: "text", label: "Studiengang" },
          },
          defaultItemProps: { foto: "", name: "", rolle: "", uni: "", studiengang: "" },
          getItemSummary: (p) => p.name || "Neue Person",
        },
      },
      defaultProps: { personen: [] },
      render: ({ personen }) => (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {personen.map((p, i) => (
            <Card key={i} className="overflow-hidden">
              {p.foto ? (
                // eslint-disable-next-line @next/next/no-img-element -- Supabase-hosted, next/image needs remotePatterns
                <img src={p.foto} alt={p.name} className="aspect-square w-full object-cover" />
              ) : (
                <div className="aspect-square w-full bg-bdas-surface-hover" aria-hidden />
              )}
              <div className="flex flex-col gap-1 p-4">
                <p className="font-semibold text-bdas-ink">{p.name}</p>
                <p className="text-bdas-ink-body">{p.rolle}</p>
                <p className="text-sm text-bdas-ink-muted">{p.uni}</p>
                <p className="text-sm text-bdas-ink-muted">{p.studiengang}</p>
              </div>
            </Card>
          ))}
        </div>
      ),
    },
  },
};
```

- [ ] **Step 5: Implement the editor wrapper**

`apps/web/app/_content/PuckEditor.tsx` (adjust the CSS import path if Task 4 Step 2 found a different export):

```tsx
"use client";

import "@puckeditor/core/puck.css";

import { Puck, type Data } from "@puckeditor/core";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@bdas/design-system";

import { puckConfig } from "./puck-config";

/** Full-page Puck editor. Publish = save-is-live (spec §1): PUT the document,
 *  then return to the public page. */
export function PuckEditor({ slug, initialData }: { slug: string; initialData: Data }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen">
      {error ? (
        <Alert variant="error" className="m-4">
          {error}
        </Alert>
      ) : null}
      <Puck
        config={puckConfig}
        data={initialData}
        headerTitle="Bundessprecher*innenrat"
        headerPath={`/${slug}`}
        onPublish={async (data: Data) => {
          setError(null);
          const res = await fetch(`/api/content/pages/${slug}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ data }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            setError(body.error ?? "Speichern fehlgeschlagen.");
            return;
          }
          router.push(`/${slug}` as Route);
          router.refresh();
        }}
      />
    </div>
  );
}
```

Note: if `Alert` does not accept `className`, wrap it in `<div className="m-4">` instead — check `core/design-system/src/components/Alert.tsx` (it extends `HTMLAttributes`, so `className` should pass through via `cx`).

- [ ] **Step 6: Run tests + typecheck to verify they pass**

Run: `pnpm --filter @bdas/web test -- app/_content && pnpm --filter @bdas/web typecheck`
Expected: 3 tests PASS; typecheck clean. Typecheck failures here are most likely Puck type-signature drift (e.g. `getItemSummary` arity, `Config` generics) — fix against the installed package's `.d.ts`, not by `any`-casting.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_content
git commit -m "feat(web): Puck palette (Überschrift, Absatz, Personen-Raster) + editor wrapper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Upload-URL route

**Files:**

- Create: `apps/web/app/api/content/upload-url/route.ts`
- Create: `apps/web/app/api/content/upload-url/route.test.ts`

**Interfaces:**

- Consumes: `getContentMediaStorage` (Task 3); `getCurrentMember`, `isFederalBoard` from `@bdas/members`; `readSessionCookie` from `apps/web/lib/auth-cookie.ts`.
- Produces: `POST /api/content/upload-url` accepting `{ filename, mimeType, sizeBytes, slug? }`, returning `{ uploadUrl, publicUrl, storageKey }` — consumed by `FotoField` (Task 5).

- [ ] **Step 1: Write the failing route tests**

`apps/web/app/api/content/upload-url/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://x/api/content/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("content upload-url gate", () => {
  beforeEach(() => {
    delete process.env["BDAS_FLAG_CONTENT"];
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_CONTENT"];
  });

  it("404s while the content flag is off", async () => {
    const res = await POST(request({ mimeType: "image/png", sizeBytes: 1 }));
    expect(res.status).toBe(404);
  });

  it("401s for an anonymous request when the flag is on", async () => {
    process.env["BDAS_FLAG_CONTENT"] = "true";
    const res = await POST(request({ mimeType: "image/png", sizeBytes: 1 }));
    expect(res.status).toBe(401);
  });
});
```

Note: the 401 path must short-circuit before any DB query (no cookie ⇒ `getCurrentUser` returns null). If the test errors on a DB connection instead, check `readSessionCookie()` is returning undefined outside a request scope — `next/headers` `cookies()` throws outside a request; in that case wrap the route's cookie read exactly like the events upload route does (it uses the same helper and its pattern is the source of truth).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/web test -- app/api/content`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement the route**

`apps/web/app/api/content/upload-url/route.ts` (mirrors `apps/web/app/api/events/[id]/upload-url/route.ts`):

```ts
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember, isFederalBoard } from "@bdas/members";
import { getContentMediaStorage } from "@bdas/storage";

import { readSessionCookie } from "../../../../lib/auth-cookie";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB cap for page imagery
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function POST(req: Request) {
  if (!isFlagOn("content")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  if (!isFederalBoard(me.grants)) {
    return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
    slug?: string;
  } | null;
  if (!body?.mimeType || !ALLOWED.has(body.mimeType)) {
    return Response.json({ error: "Nur Bilddateien (JPG, PNG, WebP, AVIF)." }, { status: 422 });
  }
  if (!body.sizeBytes || body.sizeBytes <= 0 || body.sizeBytes > MAX_BYTES) {
    return Response.json({ error: "Datei zu groß (max. 10 MB)." }, { status: 422 });
  }

  const ext = (body.filename?.split(".").pop() ?? "img").toLowerCase().replace(/[^a-z0-9]/g, "");
  const prefix = (body.slug ?? "").replace(/[^a-z0-9/-]/g, "").replace(/\//g, "-") || "seite";
  const storageKey = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const storage = getContentMediaStorage();
  const signed = await storage.signedUploadUrl({
    storageKey,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
  });
  return Response.json({
    uploadUrl: signed.url,
    publicUrl: storage.publicUrl(storageKey),
    storageKey,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/web test -- app/api/content && pnpm --filter @bdas/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/content/upload-url
git commit -m "feat(web): federal-gated signed-upload route for content-media

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Save route — `PUT /api/content/pages/[...slug]`

**Files:**

- Create: `apps/web/app/api/content/pages/[...slug]/route.ts`
- Create: `apps/web/app/api/content/pages/[...slug]/route.test.ts`

**Interfaces:**

- Consumes: `savePage` (Task 2); `isAppError` from `@bdas/errors`.
- Produces: `PUT /api/content/pages/<slug…>` with body `{ data: <PuckData> }` → `{ ok: true, updatedAt }`; 404 flag off / 401 anonymous / 403 non-federal / 400 invalid document (via `AppError.statusCode`) / 422 missing body. Consumed by `PuckEditor` (Task 5).

- [ ] **Step 1: Write the failing route tests**

`apps/web/app/api/content/pages/[...slug]/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PUT } from "./route";

const PARAMS = { params: { slug: ["ueber-uns", "bundessprecherinnenrat"] } };

function request(body: unknown): Request {
  return new Request("http://x/api/content/pages/ueber-uns/bundessprecherinnenrat", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("content pages PUT gate", () => {
  beforeEach(() => {
    delete process.env["BDAS_FLAG_CONTENT"];
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_CONTENT"];
  });

  it("404s while the content flag is off", async () => {
    const res = await PUT(request({ data: { root: { props: {} }, content: [] } }), PARAMS);
    expect(res.status).toBe(404);
  });

  it("401s for an anonymous request when the flag is on", async () => {
    process.env["BDAS_FLAG_CONTENT"] = "true";
    const res = await PUT(request({ data: { root: { props: {} }, content: [] } }), PARAMS);
    expect(res.status).toBe(401);
  });
});
```

(403/400/success paths are covered by the module integration tests in Task 2 and the e2e flow in Task 10 — they need a real session, which route unit tests here don't have.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/web test -- app/api/content/pages`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement the route**

`apps/web/app/api/content/pages/[...slug]/route.ts`:

```ts
import { savePage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../../lib/auth-cookie";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { slug: string[] } }) {
  if (!isFlagOn("content")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { data?: unknown } | null;
  if (!body || body.data === undefined) {
    return Response.json({ error: "Es fehlt das Seitendokument (data)." }, { status: 422 });
  }

  try {
    const page = await savePage(db, {
      slug: params.slug.join("/"),
      data: body.data,
      actor: { userId: me.user.id, grants: me.grants },
    });
    return Response.json({ ok: true, updatedAt: page.updatedAt.toISOString() });
  } catch (err) {
    if (isAppError(err)) {
      return Response.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/web test -- app/api/content && pnpm --filter @bdas/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/content/pages"
git commit -m "feat(web): PUT /api/content/pages/[...slug] — save-is-live content endpoint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Public BSR page + editor page

**Files:**

- Create: `apps/web/app/ueber-uns/bundessprecherinnenrat/page.tsx`
- Create: `apps/web/app/ueber-uns/bundessprecherinnenrat/bearbeiten/page.tsx`

**Interfaces:**

- Consumes: `getPage` (Task 2), `puckConfig` + `PuckEditor` (Task 5), `loadCurrentMember` from `apps/web/app/_dashboard/session.ts`, `requirePublicShellFlag` from `apps/web/app/_public/flag.ts`, `isFederalBoard` from `@bdas/members`, `Render`/`Data` from `@puckeditor/core`.
- Produces: the two user-facing routes of this feature. No new exports.

- [ ] **Step 1: Implement the public page**

`apps/web/app/ueber-uns/bundessprecherinnenrat/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { puckConfig } from "../../_content/puck-config";
import { loadCurrentMember } from "../../_dashboard/session";
import { requirePublicShellFlag } from "../../_public/flag";

export const dynamic = "force-dynamic";

const SLUG = "ueber-uns/bundessprecherinnenrat";

export const metadata: Metadata = {
  title: "Bundessprecher*innenrat",
  description:
    "Der Bundessprecher*innenrat des BDAS — die Mitglieder des Bundesvorstands mit Rolle, Universität und Studiengang.",
};

export default async function BsrPage() {
  requirePublicShellFlag();
  if (!isFlagOn("content")) notFound();

  const page = await getPage(getDb(), SLUG);
  const me = await loadCurrentMember();
  const canEdit = me !== null && isFederalBoard(me.grants);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold text-bdas-ink">Bundessprecher*innenrat</h1>
        {canEdit ? (
          <Link
            href="/ueber-uns/bundessprecherinnenrat/bearbeiten"
            className="inline-flex shrink-0 items-center rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
          >
            Seite bearbeiten
          </Link>
        ) : null}
      </div>
      {page ? (
        <Render config={puckConfig} data={page.data as Data} />
      ) : (
        <p className="text-bdas-ink-body">Inhalte folgen in Kürze.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Implement the editor page**

`apps/web/app/ueber-uns/bundessprecherinnenrat/bearbeiten/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { PuckEditor } from "../../../_content/PuckEditor";
import { loadCurrentMember } from "../../../_dashboard/session";

export const dynamic = "force-dynamic";

const SLUG = "ueber-uns/bundessprecherinnenrat";

export const metadata: Metadata = {
  title: "Seite bearbeiten — Bundessprecher*innenrat",
  robots: { index: false },
};

/** Editor is board-only; everyone else gets a 404 (no existence leak, spec §6). */
export default async function BsrBearbeitenPage() {
  if (!isFlagOn("public_shell") || !isFlagOn("content")) notFound();

  const me = await loadCurrentMember();
  if (!me || !isFederalBoard(me.grants)) notFound();

  const page = await getPage(getDb(), SLUG);
  const initialData = (page?.data ?? { root: { props: {} }, content: [] }) as Data;

  return <PuckEditor slug={SLUG} initialData={initialData} />;
}
```

- [ ] **Step 3: Verify with typecheck + dev server**

Run: `pnpm --filter @bdas/web typecheck`
Expected: clean.

Then start the dev server and check by hand (flags on):

```bash
BDAS_FLAG_PUBLIC_SHELL=true BDAS_FLAG_CONTENT=true BDAS_FLAG_AUTH=true BDAS_FLAG_MEMBERS=true BDAS_FLAG_GROUPS=true pnpm --filter @bdas/web dev
```

- `http://localhost:3000/ueber-uns/bundessprecherinnenrat` → heading + „Inhalte folgen in Kürze.", no edit button when logged out.
- `http://localhost:3000/ueber-uns/bundessprecherinnenrat/bearbeiten` → 404 when logged out.
- Log in as a federal-board user (email on `BDAS_FEDERAL_BOARD_EMAILS`) → edit button appears; editor shows the three German blocks; publishing an Absatz block lands on the public page.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/ueber-uns/bundessprecherinnenrat
git commit -m "feat(web): public BSR page + federal-only Puck editor route

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Navigation entry + sitemap

**Files:**

- Modify: `apps/web/app/_public/nav-items.ts`
- Modify: `apps/web/app/_public/nav-items.test.ts`
- Modify: `apps/web/app/sitemap.ts`

**Interfaces:**

- Consumes: `isFlagOn("content")`.
- Produces: „Bundessprecher\*innenrat" leaf in the Über-uns dropdown + sitemap entry, both only while the flag is on.

- [ ] **Step 1: Write the failing nav test**

Append to `apps/web/app/_public/nav-items.test.ts` inside `describe("navItems", …)`:

```ts
it("adds the BSR page to Über uns only while the content flag is on", () => {
  const prev = process.env["BDAS_FLAG_CONTENT"];

  process.env["BDAS_FLAG_CONTENT"] = "true";
  const on = byLabel(navItems(), "Über uns");
  expect(on && "children" in on ? on.children.map((c) => c.href) : []).toContain(
    "/ueber-uns/bundessprecherinnenrat",
  );

  process.env["BDAS_FLAG_CONTENT"] = "false";
  const off = byLabel(navItems(), "Über uns");
  expect(off && "children" in off ? off.children.map((c) => c.href) : []).not.toContain(
    "/ueber-uns/bundessprecherinnenrat",
  );

  if (prev === undefined) delete process.env["BDAS_FLAG_CONTENT"];
  else process.env["BDAS_FLAG_CONTENT"] = prev;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web test -- app/_public/nav-items`
Expected: the new test FAILS (href missing); existing nav tests PASS.

- [ ] **Step 3: Implement nav + sitemap**

In `apps/web/app/_public/nav-items.ts`, change the Über-uns children to:

```ts
    {
      label: "Über uns",
      children: [
        { label: "Kurzportrait", href: "/ueber-uns" },
        ...(isFlagOn("content")
          ? [{ label: "Bundessprecher*innenrat", href: "/ueber-uns/bundessprecherinnenrat" }]
          : []),
        { label: "Verbandsstruktur", href: "/ueber-uns/verbandsstruktur" },
        { label: "Bund der Alevitischen Jugendlichen (BDAJ)", href: "/ueber-uns/bdaj" },
      ],
    },
```

In `apps/web/app/sitemap.ts`, inside the existing `if (isFlagOn("public_shell")) { … }` block, after the four `entries.push(…)` lines add:

```ts
if (isFlagOn("content")) {
  entries.push({ url: url("/ueber-uns/bundessprecherinnenrat"), changeFrequency: "monthly" });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/web test -- app/_public/nav-items && pnpm --filter @bdas/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_public/nav-items.ts apps/web/app/_public/nav-items.test.ts apps/web/app/sitemap.ts
git commit -m "feat(web): BSR page in Über-uns nav + sitemap (content flag)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: E2E coverage + CI/Playwright flags

**Files:**

- Create: `e2e/content-pages.e2e.ts`
- Modify: `playwright.config.ts` (webServer env)
- Modify: `.github/workflows/ci.yml` (e2e job env)

**Interfaces:**

- Consumes: `deleteUserByEmail` from `e2e/helpers/db`, `registerVerifyLogin` from `e2e/helpers/flows`, CI's `BDAS_FEDERAL_BOARD_EMAILS: federal@e2e.bdas.test`.
- Produces: e2e proof of the public page, the 404 gate, and the board edit entry.

- [ ] **Step 1: Enable the flag in both e2e environments**

`playwright.config.ts`, in `webServer.env`, add:

```ts
      BDAS_FLAG_PUBLIC_SHELL: "true",
      BDAS_FLAG_CONTENT: "true",
```

`.github/workflows/ci.yml`, in the e2e job's `env:` block (the one containing `BDAS_FLAG_PUBLIC_SHELL: "true"`), add:

```yaml
BDAS_FLAG_CONTENT: "true"
```

Check whether other CI jobs' env blocks (unit tests around lines 93/135) also list flags — the content module tests don't need a flag, so only the e2e job changes.

- [ ] **Step 2: Write the e2e spec**

`e2e/content-pages.e2e.ts`:

```ts
/**
 * Editable content pages (spec 2026-07-14): public BSR page + editor gating.
 * Requires BDAS_FLAG_CONTENT=true and BDAS_FLAG_PUBLIC_SHELL=true in the e2e
 * env, plus federal@e2e.bdas.test on BDAS_FEDERAL_BOARD_EMAILS (CI has both).
 */
import { expect, test } from "@playwright/test";

import { deleteUserByEmail } from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

const FEDERAL_EMAIL = "federal@e2e.bdas.test";

test.describe("content pages", () => {
  test("visitor sees the BSR page without an edit button", async ({ page }) => {
    await page.goto("/ueber-uns/bundessprecherinnenrat");
    await expect(page.getByRole("heading", { name: "Bundessprecher*innenrat" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Seite bearbeiten" })).toHaveCount(0);
  });

  test("anonymous /bearbeiten is a 404", async ({ page }) => {
    const res = await page.goto("/ueber-uns/bundessprecherinnenrat/bearbeiten");
    expect(res?.status()).toBe(404);
  });

  test("federal board reaches the Puck editor via the edit button", async ({ page }) => {
    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Fed",
      lastName: "Eral",
    });
    await page.goto("/ueber-uns/bundessprecherinnenrat");
    await page.getByRole("link", { name: "Seite bearbeiten" }).click();
    // Puck's chrome is English (ADR 0023); the German blocks live in the side panel.
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  });
});
```

Before running, compare the `registerVerifyLogin` call signature with its usage in `e2e/board-shell.e2e.ts` and adjust if it differs.

- [ ] **Step 3: Run the e2e suite**

Run:

```bash
docker compose up -d
pnpm db:migrate
pnpm --filter @bdas/web build
BDAS_FEDERAL_BOARD_EMAILS=federal@e2e.bdas.test pnpm e2e content-pages
```

Expected: 3 tests PASS. If the "Publish" button locator fails, open the Playwright trace and use the actual button label from Puck's header.

- [ ] **Step 4: Commit**

```bash
git add e2e/content-pages.e2e.ts playwright.config.ts .github/workflows/ci.yml
git commit -m "test(e2e): content pages — public view, 404 gate, board editor entry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: ADR 0023 + final verification

**Files:**

- Create: `docs/decisions/0023-puck-content-pages.md`

- [ ] **Step 1: Write the ADR**

`docs/decisions/0023-puck-content-pages.md`:

```markdown
# ADR 0023 — Puck for board-editable content pages

- **Status:** Accepted
- **Date:** 2026-07-14
- **Supersedes:** —
- **Superseded by:** —

## Context

The federation wants the Bundessprecher\*innenrat page (photo, BSR role,
university, degree programme per member) editable by the board in the
browser — no developer round-trip. More placeholder pages (Kurzportrait,
Verbandsstruktur, BDAJ) are waiting on board-authored content and would
benefit from the same mechanism. The pinned stack (CLAUDE.md §2) has no
visual editor; adding one is a new dependency and needs an ADR.

## Decision

- **Editor:** Puck (`@puckeditor/core`, MIT — formerly published as
  `@measured/puck`), pinned `^0.22`. A React visual editor with a JSON
  document model and a `<Render>` component; auth is deliberately ours
  (`federal_board` via `@bdas/members`).
- **Boundary:** Puck is a dependency of `apps/web` only. The new `content`
  module stores documents opaquely — it validates a structural zod schema of
  Puck's `Data` shape and never imports Puck. Storage (`content_pages`),
  save-authorization, and the `content.page.saved` event live in the module.
- **Coupling accepted:** stored documents are Puck-format JSON. A move away
  from Puck means migrating documents (or re-authoring the few pages).
  Accepted: pages are few, content is short-lived, and the alternative
  (an own block format) is speculative abstraction.
- **Save = live.** No drafts/versions until real usage demands them.
- **Editor language:** Puck's chrome is English; block and field labels are
  German. Accepted for a board-only surface — the German-strings requirement
  (spec §22) targets member/public surfaces.
- **Imagery:** public `content-media` bucket via `core/storage`, exact
  analogue of `event-media` (ADR 0012 pattern), signed uploads minted only
  after the federal-board check.

## Consequences

- New editable pages need: a row-slug decision, a five-line Server Component
  route, and (if navigable) a nav entry — no schema or module change.
- Puck upgrades ride `^0.22`; major upgrades re-check the `Data` zod schema
  against Puck's changelog.
- Orphaned uploaded images are tolerated (no sweeper); revisit if the bucket
  grows noticeably.
- **Owner setup:** create the public `content-media` bucket in Supabase and
  set `SUPABASE_CONTENT_MEDIA_BUCKET` if the name differs.
```

- [ ] **Step 2: Full verification**

Run:

```bash
docker compose up -d
pnpm -r typecheck
pnpm lint
pnpm -r test
pnpm format:check
```

Expected: everything green (run `pnpm format` if prettier complains). Fix anything red before committing.

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0023-puck-content-pages.md
git commit -m "docs: ADR 0023 — Puck for board-editable content pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: PR + reviews**

This feature is one module → one PR (CLAUDE.md §4). On the PR: run `/review`; because it touches auth-gating and uploads, also run `/security-review`. Remind the owner of the one manual step: **create the public `content-media` bucket in Supabase** before enabling `BDAS_FLAG_CONTENT` in preview/production.
