# Blog Filtering, Permissions & Abuse Protection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shipped blog module with post categories, time-based feed filtering, tightened author eligibility, and abuse-protection mechanisms (rate-limiting, member reporting, soft-delete).

**Architecture:** `modules/blog` gains a `category` enum column + `deleted_at` soft-delete marker on `posts`, and a new `post_reports` table it owns. Services stay authorization-agnostic (`listPosts` grows optional category/time filters; `createPost`/`reportPost` add rate-limit checks against their own tables). The app layer (`apps/web/app/_blog`) centralizes the tightened author-eligibility check and adds a server-driven filter bar, a report control, and a federal-board-only moderation queue at `/blog/meldungen`. `modules/notifications` gets one more event subscriber to email the federal board when a post is reported.

**Tech Stack:** TypeScript, Next.js 14 App Router, Drizzle ORM, PostgreSQL (Docker for tests), zod, vitest, Playwright — same as the existing blog module.

**Spec:** `docs/superpowers/specs/2026-07-26-blog-filtering-permissions-design.md`
**Prior spec/plan:** `docs/superpowers/specs/2026-07-22-blog-module-design.md`, `docs/superpowers/plans/2026-07-22-blog-module.md`

## Global Constraints

- Module rules (CLAUDE.md §1): only `modules/blog` touches `posts`/`post_reports`; public surface is `modules/blog/src/index.ts`; migrations live in `modules/blog/migrations/`, run in lexical filename order (no manifest change needed — `"blog"` is already a manifest entry).
- Services carry no auth/db-of-another-module import — authorization lives at the app layer, matching the existing `blog` convention.
- All user-facing copy is German. Styling only via `@bdas/design-system` tokens — no inline hex/radius/shadow/duration; reuse the existing `FilterChip` token classes (copy the exact class strings `EventFilterBar.tsx` uses — there is no shared constant to import).
- Module tests run against real Postgres (`docker compose up -d` first); they self-skip via `dbReachable()` when Postgres is unreachable, matching every existing test file in this repo.
- Rate limits: **3 posts/hour** per author, **10 reports/24h** per reporter — implemented as `count(*)` queries against the module's own tables (no new generic rate-limit table; `RateLimitError` already exists in `@bdas/errors`).
- Soft-delete is a marker only (`deleted_at`) — no restore UI. Every read path must exclude `deleted_at IS NOT NULL` rows.
- `docs/decisions/0030-blog-authoring-rights.md` is a new ADR — next free number after `0029-profile-module.md` (there are two `0028-*` files already in the repo; leave that as-is, it is not this plan's concern).

---

### Task 1: Migration + schema + types (category, soft-delete, reports)

**Files:**

- Create: `modules/blog/migrations/0002_categories_reports_softdelete.sql`
- Create: `modules/blog/src/schema.test.ts`
- Modify: `modules/blog/src/schema.ts`
- Modify: `modules/blog/src/types.ts`

**Interfaces:**

- Produces: `PostCategory` (union of 6 string literals), `CATEGORY_LABELS: Record<PostCategory, string>`, `PostReportStatus` (`"open" | "dismissed"`), `PostReport` type, `postReports` Drizzle table, `PostReportRow` type. `Post`/`PostSummary` gain a `category: PostCategory` field. `posts` Drizzle table gains `category` and `deletedAt` columns.

- [ ] **Step 1: Write the migration**

Create `modules/blog/migrations/0002_categories_reports_softdelete.sql`:

```sql
-- Blog module — categories, soft-delete, and reports.
-- Adds `category` (fixed enum) + `deleted_at` (soft-delete marker) to posts,
-- and a new post_reports table for the member-reporting abuse flow.

ALTER TABLE posts
  ADD COLUMN category text NOT NULL DEFAULT 'sonstiges',
  ADD COLUMN deleted_at timestamptz;

ALTER TABLE posts
  ADD CONSTRAINT posts_category_check
    CHECK (category IN (
      'verbandsintern', 'gruppenleben', 'veranstaltungsrueckblick',
      'politik_positionen', 'karriere_weiterbildung', 'sonstiges'
    ));

CREATE INDEX posts_category_idx    ON posts(category);
CREATE INDEX posts_deleted_at_idx  ON posts(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE post_reports (
  id            text PRIMARY KEY,
  post_id       text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter_id   text NOT NULL,
  reason        text,
  status        text NOT NULL DEFAULT 'open',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_reports_status_check
    CHECK (status IN ('open', 'dismissed'))
);

CREATE INDEX post_reports_status_idx   ON post_reports(status);
CREATE INDEX post_reports_post_id_idx  ON post_reports(post_id);
```

- [ ] **Step 2: Update `schema.ts`**

Modify `modules/blog/src/schema.ts` — add `category`/`deletedAt` columns to `posts` (after `visibility: text(...)`, before `createdBy`), a `categoryIdx` index, and a new `postReports` table at the end of the file:

```typescript
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { TiptapDoc } from "./types";

// Drizzle table definition for query building. The authoritative DDL — the
// visibility CHECK, the unique slug, defaults — lives in migrations/0001_init.sql
// and migrations/0002_categories_reports_softdelete.sql.

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    // Tiptap/ProseMirror JSON. Rendered to sanitized HTML at the app layer.
    content: jsonb("content").$type<TiptapDoc>().notNull(),
    visibility: text("visibility").notNull().default("public"),
    category: text("category").notNull().default("sonstiges"),
    // Soft-delete marker (spec 2026-07-26): moderation "delete" sets this
    // instead of removing the row. Every read path filters it out.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Auth user id of the author. Plain id, no FK (matches events).
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Feed is newest-first, visibility-filtered.
    feedIdx: index("posts_created_at_idx").on(t.createdAt),
    visibilityIdx: index("posts_visibility_idx").on(t.visibility),
    authorIdx: index("posts_author_idx").on(t.createdBy),
    categoryIdx: index("posts_category_idx").on(t.category),
  }),
);

export type PostRow = typeof posts.$inferSelect;

// A member's report against a post (spec 2026-07-26). Blog-owned per rule 1.
export const postReports = pgTable(
  "post_reports",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    reporterId: text("reporter_id").notNull(),
    reason: text("reason"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("post_reports_status_idx").on(t.status),
    postIdx: index("post_reports_post_id_idx").on(t.postId),
  }),
);

export type PostReportRow = typeof postReports.$inferSelect;
```

- [ ] **Step 3: Update `types.ts`**

Modify `modules/blog/src/types.ts` — add `PostCategory`, `CATEGORY_LABELS`, `category` on `Post`, and the report types. Full new file:

```typescript
/**
 * Domain types for the blog module's public surface. The DB row shape
 * (`PostRow`) is internal — service callers see `Post` / `PostSummary`.
 *
 * A post's body is stored as Tiptap/ProseMirror JSON (`TiptapDoc`), the same
 * content shape the events module uses. The app renders it to sanitized HTML
 * via `renderPostContentHtml` so the editor never ships to visitors.
 */

/** ProseMirror document root, as emitted by the Tiptap editor. */
export type TiptapDoc = { readonly type: "doc"; readonly content?: ReadonlyArray<unknown> };

/**
 * Audience of a post. Enforced server-side (see `visibility.ts`):
 *   - `public`  — everyone, including signed-out external visitors,
 *   - `members` — signed-in members only,
 *   - `board`   — federal board only ("Nur Vorstände").
 */
export type PostVisibility = "public" | "members" | "board";

/**
 * A post's fixed topical category (spec 2026-07-26), chosen by the author at
 * publish time. One category per post — not free-form tags.
 */
export type PostCategory =
  | "verbandsintern"
  | "gruppenleben"
  | "veranstaltungsrueckblick"
  | "politik_positionen"
  | "karriere_weiterbildung"
  | "sonstiges";

/** German display labels, in the fixed order shown in selects/filter chips. */
export const CATEGORY_LABELS: Record<PostCategory, string> = {
  verbandsintern: "Verbandsintern",
  gruppenleben: "Gruppenleben",
  veranstaltungsrueckblick: "Veranstaltungsrückblick",
  politik_positionen: "Politik & Positionen",
  karriere_weiterbildung: "Karriere & Weiterbildung",
  sonstiges: "Sonstiges",
};

export type Post = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly content: TiptapDoc;
  readonly visibility: PostVisibility;
  readonly category: PostCategory;
  /** Auth user id of the author (no FK, matches events). */
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/** Feed row — same fields as `Post`; the feed renders the full body inline. */
export type PostSummary = Post;

/** A report's review state: open (awaiting board review) or dismissed. */
export type PostReportStatus = "open" | "dismissed";

/** One member's report against a post, hydrated with the post's title/slug for the moderation queue. */
export type PostReport = {
  readonly id: string;
  readonly postId: string;
  readonly postTitle: string;
  readonly postSlug: string;
  readonly reporterId: string;
  readonly reason: string | null;
  readonly status: PostReportStatus;
  readonly createdAt: Date;
};
```

- [ ] **Step 4: Write the schema test**

Create `modules/blog/src/schema.test.ts`:

```typescript
/**
 * DB-level checks for the 0002 migration: category default/CHECK, and the
 * post_reports table + its FK cascade. Skips when DATABASE_URL is unreachable.
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
  for (const file of ["0001_init.sql", "0002_categories_reports_softdelete.sql"]) {
    const sql = await fs.readFile(path.join(__dirname, "..", "migrations", file), "utf8");
    await t.client.unsafe(sql);
  }
}

describeIfDb("blog schema — categories, soft-delete, reports", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
  });

  afterEach(async () => {
    await t.cleanup();
  });

  async function insertPost(id: string, category?: string): Promise<void> {
    if (category) {
      await t.client`
        INSERT INTO posts (id, slug, title, content, created_by, category)
        VALUES (${id}, ${id}, 'Titel', '{"type":"doc"}', 'usr_1', ${category})`;
    } else {
      await t.client`
        INSERT INTO posts (id, slug, title, content, created_by)
        VALUES (${id}, ${id}, 'Titel', '{"type":"doc"}', 'usr_1')`;
    }
  }

  it("defaults category to 'sonstiges' and deleted_at to null", async () => {
    await insertPost("post_1");
    const rows = await t.client`SELECT category, deleted_at FROM posts WHERE id = 'post_1'`;
    expect(rows[0]?.["category"]).toBe("sonstiges");
    expect(rows[0]?.["deleted_at"]).toBeNull();
  });

  it("rejects an invalid category via the CHECK constraint", async () => {
    await expect(insertPost("post_2", "unsinn")).rejects.toThrow();
  });

  it("accepts a post_reports row and cascades on hard post delete", async () => {
    await insertPost("post_3");
    await t.client`
      INSERT INTO post_reports (id, post_id, reporter_id, reason)
      VALUES ('report_1', 'post_3', 'usr_2', 'Spam')`;

    const before = await t.client`SELECT * FROM post_reports WHERE id = 'report_1'`;
    expect(before).toHaveLength(1);

    await t.client`DELETE FROM posts WHERE id = 'post_3'`;

    const after = await t.client`SELECT * FROM post_reports WHERE id = 'report_1'`;
    expect(after).toHaveLength(0);
  });

  it("rejects an invalid post_reports status via the CHECK constraint", async () => {
    await insertPost("post_4");
    await expect(
      t.client`
        INSERT INTO post_reports (id, post_id, reporter_id, status)
        VALUES ('report_2', 'post_4', 'usr_2', 'unsinn')`,
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `docker compose up -d` (if not already running), then `pnpm --filter @bdas/blog test schema.test.ts`
Expected: 4 tests PASS (or all SKIP if Postgres is unreachable — check `docker compose ps` if so).

- [ ] **Step 6: Commit**

```bash
git add modules/blog/migrations/0002_categories_reports_softdelete.sql modules/blog/src/schema.ts modules/blog/src/types.ts modules/blog/src/schema.test.ts
git commit -m "feat(blog): add category, soft-delete, and post_reports schema"
```

---

### Task 2: Category on create/update + rate-limit on `createPost`

**Files:**

- Modify: `modules/blog/src/services/manage.ts`
- Modify: `modules/blog/src/index.ts`
- Modify: `modules/blog/src/index.test.ts`

**Interfaces:**

- Consumes: `PostCategory`, `CATEGORY_LABELS` (Task 1, `../types`); `posts` table with `category` column (Task 1).
- Produces: `PostInput` now requires/defaults `category`; `createPost` throws `RateLimitError` past 3 posts/hour per author; `rowToPost` maps `category`.

- [ ] **Step 1: Write the failing tests**

Modify `modules/blog/src/index.test.ts` — add these `it` blocks inside the existing `describeIfDb("blog integration", ...)` block, after the `"createPost rejects a too-short title with VALIDATION"` test:

```typescript
it("createPost persists an explicit category", async () => {
  const p = await createPost(
    t.db,
    { title: "Bericht", content: doc("x"), category: "gruppenleben" },
    "usr_m",
  );
  expect(p.category).toBe("gruppenleben");
});

it("createPost defaults category to 'sonstiges'", async () => {
  const p = await createPost(t.db, { title: "Ohne Kategorie", content: doc("x") }, "usr_m");
  expect(p.category).toBe("sonstiges");
});

it("createPost rejects an invalid category with VALIDATION", async () => {
  await expect(
    createPost(t.db, { title: "Bad", content: doc("x"), category: "unsinn" }, "usr_m"),
  ).rejects.toMatchObject({ code: "VALIDATION" });
});

it("updatePost changes the category", async () => {
  const p = await createPost(
    t.db,
    { title: "Start", content: doc("x"), category: "sonstiges" },
    "usr_m",
  );
  const edited = await updatePost(t.db, p.id, {
    title: "Start",
    content: doc("x"),
    category: "politik_positionen",
  });
  expect(edited.category).toBe("politik_positionen");
});

it("createPost throws RateLimitError past 3 posts/hour for the same author", async () => {
  for (let i = 0; i < 3; i++) {
    await createPost(t.db, { title: `Post ${i}`, content: doc("x") }, "usr_spammer");
  }
  await expect(
    createPost(t.db, { title: "Post 4", content: doc("x") }, "usr_spammer"),
  ).rejects.toMatchObject({ code: "RATE_LIMITED" });
});

it("createPost rate-limit is per-author — a different author is unaffected", async () => {
  for (let i = 0; i < 3; i++) {
    await createPost(t.db, { title: `Post ${i}`, content: doc("x") }, "usr_busy");
  }
  const p = await createPost(t.db, { title: "Fine", content: doc("x") }, "usr_other");
  expect(p.title).toBe("Fine");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/blog test index.test.ts`
Expected: FAIL — `category` is not a recognized `PostInput` key (zod strips unknown keys silently, so the category/updatePost tests fail on `expect(p.category).toBe(...)` returning `undefined`), and the rate-limit tests FAIL because no 4th/`usr_other`-post ever throws.

- [ ] **Step 3: Update `manage.ts`**

Replace the full contents of `modules/blog/src/services/manage.ts`:

```typescript
/**
 * Post lifecycle: create, edit, delete.
 *
 * Authorization is NOT enforced here — callers gate at the app action layer
 * (any signed-in user may create; author or federal board may edit/delete via
 * `canModeratePost`). This keeps `blog` free of an `auth`/`members` dependency
 * (CLAUDE.md §1 rule 2), the same convention as `events`/`projects`.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { NotFoundError, RateLimitError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { PostDeleted, PostPublished, PostUpdated } from "../events";
import { posts } from "../schema";
import { buildSlug } from "../slug";
import type { Post, PostCategory, PostVisibility, TiptapDoc } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

// A Tiptap doc must at least be `{ type: "doc" }`; deeper node validation is the
// editor's job, sanitization happens at render (content.ts).
const TiptapDocSchema = z
  .object({ type: z.literal("doc") })
  .passthrough()
  .refine((d) => "content" in d, { message: "Beitrag darf nicht leer sein" });

const PostCategorySchema = z.enum([
  "verbandsintern",
  "gruppenleben",
  "veranstaltungsrueckblick",
  "politik_positionen",
  "karriere_weiterbildung",
  "sonstiges",
]);

export const PostInput = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Titel muss mindestens 3 Zeichen haben")
    .max(160, "Titel darf höchstens 160 Zeichen haben"),
  content: TiptapDocSchema,
  visibility: z.enum(["public", "members", "board"]).default("public"),
  category: PostCategorySchema.default("sonstiges"),
});
export type PostInput = z.infer<typeof PostInput>;

function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[i.path.join(".") || "_"] = i.message;
    throw new ValidationError("Eingabe ungültig", { fields });
  }
  return parsed.data;
}

export function rowToPost(r: typeof posts.$inferSelect): Post {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    content: r.content as TiptapDoc,
    visibility: r.visibility as PostVisibility,
    category: r.category as PostCategory,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function loadOrThrow(db: Db, id: string): Promise<typeof posts.$inferSelect> {
  const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!rows[0]) throw new NotFoundError("Beitrag nicht gefunden.");
  return rows[0];
}

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_POSTS = 3;

/** Abuse protection (spec 2026-07-26): counts the author's own recent posts. */
async function assertNotRateLimited(db: Db, authorId: string): Promise<void> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(posts)
    .where(and(eq(posts.createdBy, authorId), gte(posts.createdAt, cutoff)));
  if ((row?.n ?? 0) >= RATE_LIMIT_MAX_POSTS) {
    throw new RateLimitError("Zu viele Beiträge in kurzer Zeit. Bitte später erneut versuchen.");
  }
}

/** Create a post authored by `authorId` (an auth user id). */
export async function createPost(db: Db, input: unknown, authorId: string): Promise<Post> {
  const v = parseOrThrow(PostInput, input);
  await assertNotRateLimited(db, authorId);

  const id = createId("post");
  const slug = buildSlug(v.title);
  await db.insert(posts).values({
    id,
    slug,
    title: v.title,
    content: v.content as TiptapDoc,
    visibility: v.visibility,
    category: v.category,
    createdBy: authorId,
  });

  const event: PostPublished = {
    type: "blog.post.published",
    postId: id,
    slug,
    visibility: v.visibility,
    authorId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return rowToPost(await loadOrThrow(db, id));
}

/** Edit a post. Slug and author are immutable; title/content/visibility/category change. */
export async function updatePost(db: Db, id: string, input: unknown): Promise<Post> {
  await loadOrThrow(db, id);
  const v = parseOrThrow(PostInput, input);

  await db
    .update(posts)
    .set({
      title: v.title,
      content: v.content as TiptapDoc,
      visibility: v.visibility,
      category: v.category,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id));

  const event: PostUpdated = { type: "blog.post.updated", postId: id, at: new Date() };
  await getEventBus().publish(event);

  return rowToPost(await loadOrThrow(db, id));
}

/** Soft-delete a post: sets `deletedAt` rather than removing the row (spec 2026-07-26). */
export async function deletePost(db: Db, id: string): Promise<void> {
  await loadOrThrow(db, id);
  await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, id));

  const event: PostDeleted = { type: "blog.post.deleted", postId: id, at: new Date() };
  await getEventBus().publish(event);
}
```

Note: `deletePost` is rewritten here too (soft-delete) because it lives in the same file as the rate-limit change — Task 4 below relies on this already being in place and focuses on `get.ts`/`list.ts` filtering.

- [ ] **Step 4: Update `index.ts` exports**

Modify `modules/blog/src/index.ts` — change the `Types` export line:

```typescript
// Types
export type { Post, PostSummary, PostVisibility, PostCategory, TiptapDoc } from "./types";
export { CATEGORY_LABELS } from "./types";
export type { BlogEvent, PostPublished, PostUpdated, PostDeleted } from "./events";
```

(Replaces the previous two-line `// Types` section — `PostReport`/`PostReported` are added in Task 5.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @bdas/blog test index.test.ts`
Expected: all PASS, including the pre-existing tests (unaffected — `visibility` still defaults, `deletePost`'s soft-delete keeps `getPostBySlug(...) → null` for the existing `"deletePost removes the row and emits"` test since that test only checks visibility, not the row's physical presence).

- [ ] **Step 6: Commit**

```bash
git add modules/blog/src/services/manage.ts modules/blog/src/index.ts modules/blog/src/index.test.ts
git commit -m "feat(blog): category input, per-author create rate-limit, soft-delete on deletePost"
```

---

### Task 3: Category + time filters on `listPosts`

**Files:**

- Modify: `modules/blog/src/services/list.ts`
- Modify: `modules/blog/src/index.test.ts`

**Interfaces:**

- Consumes: `PostCategory` (Task 1).
- Produces: `listPosts(db, viewer, filters?: { category?: PostCategory; since?: Date })`.

- [ ] **Step 1: Write the failing tests**

Add to `modules/blog/src/index.test.ts`, inside `describeIfDb("blog integration", ...)`, after the existing `"listPosts filters by visibility and returns newest first"` test:

```typescript
it("listPosts filters by category", async () => {
  const a = await createPost(
    t.db,
    { title: "Ankündigung", content: doc("a"), category: "verbandsintern" },
    "usr_cat",
  );
  await createPost(
    t.db,
    { title: "Bericht", content: doc("b"), category: "gruppenleben" },
    "usr_cat",
  );

  const filtered = await listPosts(t.db, federal, { category: "verbandsintern" });
  expect(filtered.map((p) => p.id)).toEqual([a.id]);
});

it("listPosts filters by since (time range)", async () => {
  const old = await createPost(t.db, { title: "Alt", content: doc("a") }, "usr_time");
  const recent = await createPost(t.db, { title: "Neu", content: doc("b") }, "usr_time");

  // Backdate the first post 40 days so a 30-day cutoff excludes it.
  const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  await t.client`UPDATE posts SET created_at = ${fortyDaysAgo.toISOString()} WHERE id = ${old.id}`;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const filtered = await listPosts(t.db, federal, { since: thirtyDaysAgo });
  expect(filtered.map((p) => p.id)).toEqual([recent.id]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/blog test index.test.ts`
Expected: FAIL — `listPosts` only accepts `(db, viewer)`, the third argument is currently ignored (TypeScript would actually catch the extra-argument at compile time; run `pnpm --filter @bdas/blog typecheck` to confirm the type error, then run the test with the signature change from Step 3 applied incrementally, or just proceed to Step 3 directly since this is a compile-time-caught case).

- [ ] **Step 3: Update `list.ts`**

Replace the full contents of `modules/blog/src/services/list.ts`:

```typescript
/**
 * The blog feed: posts the viewer may see, newest first (spec requirement 3),
 * optionally narrowed by category and/or a `since` cutoff (spec 2026-07-26).
 *
 * Visibility is enforced in SQL — `visibility IN (<levels the viewer may read>)`
 * OR `created_by = viewer.userId` (author-sees-own). An anonymous visitor only
 * ever gets `public` rows; this is the server-side guard, not a UI filter.
 * Soft-deleted posts (`deleted_at IS NOT NULL`) are always excluded.
 */
import { and, desc, eq, gte, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { posts } from "../schema";
import type { PostCategory, PostSummary } from "../types";
import { visibleLevelsFor, type Viewer } from "../visibility";

import { rowToPost } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type ListPostsFilters = {
  readonly category?: PostCategory;
  readonly since?: Date;
};

export async function listPosts(
  db: Db,
  viewer: Viewer,
  filters?: ListPostsFilters,
): Promise<PostSummary[]> {
  const levels = visibleLevelsFor(viewer);
  const visibleByLevel = inArray(posts.visibility, levels);
  const visibilityWhere: SQL =
    viewer.userId !== null
      ? (or(visibleByLevel, eq(posts.createdBy, viewer.userId)) as SQL)
      : visibleByLevel;

  const conditions: SQL[] = [visibilityWhere, isNull(posts.deletedAt)];
  if (filters?.category) conditions.push(eq(posts.category, filters.category));
  if (filters?.since) conditions.push(gte(posts.createdAt, filters.since));

  const rows = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.createdAt));
  return rows.map(rowToPost);
}
```

(This also folds in the `deletedAt IS NULL` filter that Task 4 depends on — Task 4 focuses on `get.ts` and on verifying `deletePost`'s soft-delete end-to-end.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/blog test index.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/blog/src/services/list.ts modules/blog/src/index.test.ts
git commit -m "feat(blog): category and time-range filters on listPosts"
```

---

### Task 4: Soft-delete on `get.ts` + end-to-end verification

**Files:**

- Modify: `modules/blog/src/services/get.ts`
- Modify: `modules/blog/src/index.test.ts`

**Interfaces:**

- Consumes: `posts.deletedAt` (Task 1), `deletePost`'s soft-delete (Task 2), `listPosts`'s `deletedAt` filter (Task 3).
- Produces: `getPostBySlug`/`getPostById` exclude soft-deleted rows.

- [ ] **Step 1: Write the failing tests**

Add to `modules/blog/src/index.test.ts`, inside `describeIfDb("blog integration", ...)`, after the existing `"deletePost removes the row and emits"` test:

```typescript
it("deletePost soft-deletes: the row remains with deleted_at set", async () => {
  const p = await createPost(t.db, { title: "Bleibt", content: doc("x") }, "usr_m");
  await deletePost(t.db, p.id);

  const rows = await t.client`SELECT deleted_at FROM posts WHERE id = ${p.id}`;
  expect(rows[0]?.["deleted_at"]).not.toBeNull();
});

it("getPostById returns null for a soft-deleted post", async () => {
  const p = await createPost(t.db, { title: "Weg", content: doc("x") }, "usr_m");
  await deletePost(t.db, p.id);

  expect(await getPostById(t.db, p.id)).toBeNull();
});

it("a soft-deleted post is excluded from listPosts even for its author", async () => {
  // `member`'s userId is "usr_m" — the same id used as the author below, so
  // this genuinely exercises the author-sees-own path, not just federal's.
  const p = await createPost(
    t.db,
    { title: "Gelöscht", content: doc("x"), visibility: "board" },
    "usr_m",
  );
  await deletePost(t.db, p.id);

  const feed = await listPosts(t.db, member);
  expect(feed.map((x) => x.id)).not.toContain(p.id);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/blog test index.test.ts`
Expected: FAIL on `getPostById returns null for a soft-deleted post` (currently `getPostById` has no `deletedAt` filter, so it still returns the row).

- [ ] **Step 3: Update `get.ts`**

Replace the full contents of `modules/blog/src/services/get.ts`:

```typescript
/**
 * Fetch one post by slug for its shareable single page (spec requirement 4).
 *
 * The same visibility rule as the feed applies: if the viewer may not see the
 * post, we return `null` so the app renders a 404 — a "board only" post is
 * never revealed to an external visitor via its share link. A soft-deleted
 * post (spec 2026-07-26) is always treated as gone, for every caller
 * including moderation — there is no restore surface.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { posts } from "../schema";
import type { Post } from "../types";
import { canViewPost, type Viewer } from "../visibility";

import { rowToPost } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

/** Visibility-filtered fetch by slug. Returns null when the viewer may not see it. */
export async function getPostBySlug(db: Db, slug: string, viewer: Viewer): Promise<Post | null> {
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), isNull(posts.deletedAt)))
    .limit(1);
  if (!rows[0]) return null;
  const post = rowToPost(rows[0]);
  return canViewPost(viewer, post) ? post : null;
}

/** Unfiltered (by visibility) fetch by id — for edit screens after the caller has authorized. */
export async function getPostById(db: Db, id: string): Promise<Post | null> {
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
    .limit(1);
  return rows[0] ? rowToPost(rows[0]) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/blog test index.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/blog/src/services/get.ts modules/blog/src/index.test.ts
git commit -m "feat(blog): exclude soft-deleted posts from getPostBySlug/getPostById"
```

---

### Task 5: Report service (`reportPost`, `listOpenReports`, `dismissReport`)

**Files:**

- Create: `modules/blog/src/services/report.ts`
- Modify: `modules/blog/src/events.ts`
- Modify: `modules/blog/src/index.ts`
- Modify: `modules/blog/src/index.test.ts`

**Interfaces:**

- Consumes: `postReports` table (Task 1), `posts` table.
- Produces: `reportPost(db, postId, reporterId, reason)`, `listOpenReports(db)`, `dismissReport(db, reportId)`, `PostReported` event, `PostReport`/`PostReportStatus` types (already declared in Task 1's `types.ts`).

- [ ] **Step 1: Update `events.ts`**

Modify `modules/blog/src/events.ts` — add `PostReported` and extend the union:

```typescript
/**
 * Typed events emitted by the blog module (CLAUDE.md §3). Other modules react
 * via `core/events` without importing blog internals — e.g. notifications
 * announces a report to the federal board.
 */
import type { PostVisibility } from "./types";

export type PostPublished = {
  readonly type: "blog.post.published";
  readonly postId: string;
  readonly slug: string;
  readonly visibility: PostVisibility;
  readonly authorId: string;
  readonly at: Date;
};

export type PostUpdated = {
  readonly type: "blog.post.updated";
  readonly postId: string;
  readonly at: Date;
};

export type PostDeleted = {
  readonly type: "blog.post.deleted";
  readonly postId: string;
  readonly at: Date;
};

export type PostReported = {
  readonly type: "blog.post.reported";
  readonly postId: string;
  readonly reporterId: string;
  readonly reason: string | null;
  readonly at: Date;
};

export type BlogEvent = PostPublished | PostUpdated | PostDeleted | PostReported;
```

- [ ] **Step 2: Write the failing tests**

Add to `modules/blog/src/index.test.ts`. First extend the top-level imports (the `import { createPost, deletePost, updatePost } from "./services/manage";` line and the `import type { BlogEvent } from "./events";` line already exist — add a new import line right after them):

```typescript
import { dismissReport, listOpenReports, reportPost } from "./services/report";
```

Then add these `it` blocks at the end of the `describeIfDb("blog integration", ...)` block (after the last existing test):

```typescript
it("reportPost inserts a report and emits blog.post.reported", async () => {
  const reported = capture("blog.post.reported");
  const p = await createPost(t.db, { title: "Fragwürdig", content: doc("x") }, "usr_author");

  await reportPost(t.db, p.id, "usr_reporter", "Wirkt wie Spam");

  expect(reported).toMatchObject([
    {
      type: "blog.post.reported",
      postId: p.id,
      reporterId: "usr_reporter",
      reason: "Wirkt wie Spam",
    },
  ]);
});

it("reportPost rejects a self-report with VALIDATION", async () => {
  const p = await createPost(t.db, { title: "Eigenbeitrag", content: doc("x") }, "usr_author");
  await expect(reportPost(t.db, p.id, "usr_author", null)).rejects.toMatchObject({
    code: "VALIDATION",
  });
});

it("reportPost throws NotFoundError for a nonexistent post", async () => {
  await expect(reportPost(t.db, "post_missing", "usr_reporter", null)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

it("reportPost throws NotFoundError for an already soft-deleted post", async () => {
  const p = await createPost(t.db, { title: "Weg", content: doc("x") }, "usr_author");
  await deletePost(t.db, p.id);
  await expect(reportPost(t.db, p.id, "usr_reporter", null)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

it("reportPost rate-limits a reporter past 10 reports/24h", async () => {
  const targets = await Promise.all(
    Array.from({ length: 11 }, (_, i) =>
      createPost(t.db, { title: `Ziel ${i}`, content: doc("x") }, "usr_author"),
    ),
  );
  for (let i = 0; i < 10; i++) {
    await reportPost(t.db, targets[i]!.id, "usr_flagger", null);
  }
  await expect(reportPost(t.db, targets[10]!.id, "usr_flagger", null)).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
});

it("listOpenReports returns only open reports newest first, excluding deleted posts", async () => {
  const keep = await createPost(t.db, { title: "Bleibt", content: doc("x") }, "usr_author");
  const gone = await createPost(t.db, { title: "Gelöscht", content: doc("x") }, "usr_author");

  await reportPost(t.db, keep.id, "usr_r1", "Grund A");
  await reportPost(t.db, gone.id, "usr_r2", "Grund B");
  await deletePost(t.db, gone.id);

  const open = await listOpenReports(t.db);
  expect(open.map((r) => r.postId)).toEqual([keep.id]);
  expect(open[0]?.postTitle).toBe("Bleibt");
});

it("dismissReport marks a report dismissed and it disappears from listOpenReports", async () => {
  const p = await createPost(t.db, { title: "Geprüft", content: doc("x") }, "usr_author");
  await reportPost(t.db, p.id, "usr_reporter", null);
  const [report] = await listOpenReports(t.db);

  await dismissReport(t.db, report!.id);

  expect(await listOpenReports(t.db)).toEqual([]);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @bdas/blog test index.test.ts`
Expected: FAIL to compile — `./services/report` does not exist yet.

- [ ] **Step 4: Write `report.ts`**

Create `modules/blog/src/services/report.ts`:

```typescript
/**
 * Member-reporting flow (spec 2026-07-26): any signed-in member who can view
 * a post — except its author — may report it. Reports feed a federal-board
 * moderation queue (`listOpenReports`) and a notification (see
 * `@bdas/notifications` subscriber). No pre-publish moderation is implied —
 * this is a post-publish signal, same as the existing author/board delete.
 */
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { NotFoundError, RateLimitError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { PostReported } from "../events";
import { postReports, posts } from "../schema";
import type { PostReport, PostReportStatus } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const REPORT_MAX_PER_WINDOW = 10;
const REASON_MAX_LENGTH = 300;

async function assertNotRateLimited(db: Db, reporterId: string): Promise<void> {
  const cutoff = new Date(Date.now() - REPORT_WINDOW_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(postReports)
    .where(and(eq(postReports.reporterId, reporterId), gte(postReports.createdAt, cutoff)));
  if ((row?.n ?? 0) >= REPORT_MAX_PER_WINDOW) {
    throw new RateLimitError("Zu viele Meldungen in kurzer Zeit. Bitte später erneut versuchen.");
  }
}

/** Report a post for moderation review. Rejects self-reports; rate-limited per reporter. */
export async function reportPost(
  db: Db,
  postId: string,
  reporterId: string,
  reason: string | null,
): Promise<void> {
  const rows = await db
    .select({ createdBy: posts.createdBy })
    .from(posts)
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
    .limit(1);
  const post = rows[0];
  if (!post) throw new NotFoundError("Beitrag nicht gefunden.");
  if (post.createdBy === reporterId) {
    throw new ValidationError("Du kannst deinen eigenen Beitrag nicht melden.");
  }

  const trimmedReason = reason?.trim() || null;
  if (trimmedReason && trimmedReason.length > REASON_MAX_LENGTH) {
    throw new ValidationError("Begründung darf höchstens 300 Zeichen haben.");
  }

  await assertNotRateLimited(db, reporterId);

  await db.insert(postReports).values({
    id: createId("rprt"),
    postId,
    reporterId,
    reason: trimmedReason,
    status: "open",
  });

  const event: PostReported = {
    type: "blog.post.reported",
    postId,
    reporterId,
    reason: trimmedReason,
    at: new Date(),
  };
  await getEventBus().publish(event);
}

/** Open reports for the moderation queue, newest first, joined to post title/slug. */
export async function listOpenReports(db: Db): Promise<PostReport[]> {
  const rows = await db
    .select({
      id: postReports.id,
      postId: postReports.postId,
      postTitle: posts.title,
      postSlug: posts.slug,
      reporterId: postReports.reporterId,
      reason: postReports.reason,
      status: postReports.status,
      createdAt: postReports.createdAt,
    })
    .from(postReports)
    .innerJoin(posts, eq(postReports.postId, posts.id))
    .where(and(eq(postReports.status, "open"), isNull(posts.deletedAt)))
    .orderBy(desc(postReports.createdAt));

  return rows.map((r) => ({ ...r, status: r.status as PostReportStatus }));
}

/** Mark a report as dismissed (reviewed, no action taken). */
export async function dismissReport(db: Db, reportId: string): Promise<void> {
  const result = await db
    .update(postReports)
    .set({ status: "dismissed" })
    .where(eq(postReports.id, reportId))
    .returning({ id: postReports.id });
  if (!result[0]) throw new NotFoundError("Meldung nicht gefunden.");
}
```

- [ ] **Step 5: Update `index.ts` exports**

Modify `modules/blog/src/index.ts` — full new contents:

```typescript
/**
 * @bdas/blog — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only the symbols re-exported here are visible to
 * other workspaces. Internal files (schema, slug) are not importable.
 */

// Services
export { createPost, updatePost, deletePost, PostInput, rowToPost } from "./services/manage";
export { listPosts, type ListPostsFilters } from "./services/list";
export { getPostBySlug, getPostById } from "./services/get";
export { reportPost, listOpenReports, dismissReport } from "./services/report";

// Rendering (server-side Tiptap → sanitized HTML)
export { renderPostContentHtml, plainTextToDoc } from "./content";

// Central visibility rules — reused by the app's page/route guards.
export { ANON, visibleLevelsFor, canViewPost, canModeratePost, type Viewer } from "./visibility";

// Slug helpers (the app previews a post's URL before publish).
export { slugifyTitle } from "./slug";

// Types
export type {
  Post,
  PostSummary,
  PostVisibility,
  PostCategory,
  PostReport,
  PostReportStatus,
  TiptapDoc,
} from "./types";
export { CATEGORY_LABELS } from "./types";
export type { BlogEvent, PostPublished, PostUpdated, PostDeleted, PostReported } from "./events";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @bdas/blog test index.test.ts`
Expected: all PASS. Then run `pnpm --filter @bdas/blog test` to confirm the whole module suite (including `schema.test.ts` from Task 1) is green.

- [ ] **Step 7: Commit**

```bash
git add modules/blog/src/services/report.ts modules/blog/src/events.ts modules/blog/src/index.ts modules/blog/src/index.test.ts
git commit -m "feat(blog): report service (reportPost/listOpenReports/dismissReport)"
```

---

### Task 6: Tighten author eligibility + ADR 0030

**Files:**

- Modify: `apps/web/app/_blog/access.ts`
- Modify: `apps/web/app/blog/actions.ts`
- Create: `apps/web/app/_blog/access.test.ts`
- Create: `docs/decisions/0030-blog-authoring-rights.md`

**Interfaces:**

- Consumes: `CurrentMember` (`@bdas/members`).
- Produces: `canAuthor(me: CurrentMember | null): boolean`, used by `requirePostAuthor()` and `createPostAction`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_blog/access.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import type { CurrentMember } from "@bdas/members";

import { canAuthor } from "./access";

function memberWithStatus(status: "pending" | "active" | "inactive" | "alumnus"): CurrentMember {
  return {
    user: { id: "usr_1", email: "a@bdas.de", status: "active", roles: [], sessionId: "sess_1" },
    member: {
      id: "mem_1",
      userId: "usr_1",
      firstName: "Ada",
      lastName: "Lovelace",
      primaryGroupId: null,
      status,
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants: [],
  };
}

describe("canAuthor", () => {
  it("allows an active member", () => {
    expect(canAuthor(memberWithStatus("active"))).toBe(true);
  });

  it("allows an alumnus", () => {
    expect(canAuthor(memberWithStatus("alumnus"))).toBe(true);
  });

  it("rejects a pending member", () => {
    expect(canAuthor(memberWithStatus("pending"))).toBe(false);
  });

  it("rejects an inactive member", () => {
    expect(canAuthor(memberWithStatus("inactive"))).toBe(false);
  });

  it("rejects a signed-out visitor", () => {
    expect(canAuthor(null)).toBe(false);
  });

  it("rejects a signed-in user with no member profile yet", () => {
    const me: CurrentMember = {
      user: { id: "usr_2", email: "b@bdas.de", status: "active", roles: [], sessionId: "sess_2" },
      member: null,
      grants: [],
    };
    expect(canAuthor(me)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test _blog/access.test.ts`
Expected: FAIL — `canAuthor` is not exported from `./access`.

- [ ] **Step 3: Update `access.ts`**

Modify `apps/web/app/_blog/access.ts` — replace the `requirePostAuthor` function (and the comment above it) with:

```typescript
/** Eligible to author a post: an active member or an alumnus. Pending (not yet
 *  confirmed by a Local Board) and inactive accounts cannot (ADR 0030). */
export function canAuthor(me: CurrentMember | null): boolean {
  return me !== null && (me.member?.status === "active" || me.member?.status === "alumnus");
}

/** Any eligible (active member or alumnus) user may author a post. Otherwise → login/blog. */
export async function requirePostAuthor(): Promise<CurrentMember> {
  const me = await loadBlogMe();
  if (!me) redirect("/anmelden");
  if (!canAuthor(me)) redirect("/blog");
  return me;
}
```

- [ ] **Step 4: Update `createPostAction`**

Modify `apps/web/app/blog/actions.ts` — two changes:

1. Update the import line to add `canAuthor`:

```typescript
import { blogViewer, canAuthor, loadBlogMe } from "../_blog/access";
```

2. Replace the body of `createPostAction`:

```typescript
/** Create a post. Any eligible (active member or alumnus) user may author one. */
export async function createPostAction(_prev: PostFormState, fd: FormData): Promise<PostFormState> {
  if (!isFlagOn("blog")) return { error: "Nicht verfügbar." };
  const me = await loadBlogMe();
  if (!me) return { error: "Anmeldung erforderlich." };
  if (!canAuthor(me)) {
    return { error: "Nur aktive Mitglieder oder Alumni dürfen Beiträge veröffentlichen." };
  }

  let slug: string;
  try {
    const post = await createPost(getDb(), fieldsFromForm(fd), me.user.id);
    slug = post.slug;
  } catch (err) {
    return appErr(err);
  }

  revalidatePath("/blog");
  redirect(`/blog/${slug}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test _blog/access.test.ts`
Expected: all 6 PASS.

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 6: Write ADR 0030**

Create `docs/decisions/0030-blog-authoring-rights.md`:

```markdown
# ADR 0030: Blog authoring rights are "active member or alumnus"

**Status:** Accepted
**Date:** 2026-07-26

## Context

`docs/bdas-platform-spec.md` §4 lists "make posts in blog" as a right of
the Local Board role (inherited by Federal Board), not a general Member
right. The blog module's approved design
(`docs/superpowers/specs/2026-07-22-blog-module-design.md`) deliberately
built a social-feed-style module instead, where any signed-in member may
author and the board moderates after publish. That divergence from the
spec's role table was never recorded as a decision.

A related gap surfaced during the 2026-07-26 filtering/permissions review:
`requirePostAuthor()` checked only "is signed in", not member status — a
`pending` (not yet confirmed by a Local Board) or `inactive` account could
author a post.

## Decision

Blog posting rights are: member status `active` or `alumnus`. `pending`
and `inactive` accounts cannot author. This is enforced centrally in
`apps/web/app/_blog/access.ts`'s `canAuthor()`, used by both the
`/blog/neu` page guard and `createPostAction`.

This explicitly supersedes the platform spec §4 role table's "Local
Board" listing for blog posting, for this module only — other modules'
role rights are unaffected.

## Consequences

- Any active member or alumnus can post without a board role — matches the
  social-feed intent of the 2026-07-22 design.
- Abuse is mitigated by rate-limiting, member reporting, and post-publish
  moderation (author or federal board), not by pre-restricting who may
  author — see `docs/superpowers/specs/2026-07-26-blog-filtering-permissions-design.md`.
- A `pending` member cannot post before a Local Board confirms them; an
  `inactive` (removed) member cannot post at all.
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_blog/access.ts apps/web/app/_blog/access.test.ts apps/web/app/blog/actions.ts docs/decisions/0030-blog-authoring-rights.md
git commit -m "feat(blog): restrict authoring to active members and alumni (ADR 0030)"
```

---

### Task 7: Category field in the post form + display on feed/single page

**Files:**

- Modify: `apps/web/app/_blog/PostForm.tsx`
- Modify: `apps/web/app/blog/actions.ts`
- Modify: `apps/web/app/blog/[slug]/bearbeiten/page.tsx`
- Modify: `apps/web/app/blog/page.tsx`
- Modify: `apps/web/app/blog/[slug]/page.tsx`

**Interfaces:**

- Consumes: `PostCategory`, `CATEGORY_LABELS` (Task 5's `index.ts` export).
- Produces: category selectable on create/edit; category label shown on feed cards and the single-post header.

- [ ] **Step 1: Update `PostForm.tsx`**

Modify `apps/web/app/_blog/PostForm.tsx` — full new contents:

```typescript
"use client";

import { useFormState, useFormStatus } from "react-dom";

import { CATEGORY_LABELS, type PostCategory, type PostVisibility, type TiptapDoc } from "@bdas/blog";
import { Alert, Button, Field, Form, Input } from "@bdas/design-system";

import { createPostAction, updatePostAction, type PostFormState } from "../blog/actions";
import { PostEditor } from "./PostEditor";

const SELECT_CLASS =
  "block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2.5 " +
  "text-base text-bdas-ink focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20";

const initialState: PostFormState = {};
const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as PostCategory[];

/**
 * One form for both "new post" and "edit post". Kept deliberately minimal —
 * title, a rich body, a category, and a visibility choice — so publishing is
 * quick. When `post` is given it edits in place (hidden postId +
 * updatePostAction); the slug never changes.
 */
export function PostForm({
  post,
}: {
  post?: {
    id: string;
    title: string;
    content: TiptapDoc;
    visibility: PostVisibility;
    category: PostCategory;
  };
}) {
  const editing = post !== undefined;
  const [state, action] = useFormState(editing ? updatePostAction : createPostAction, initialState);
  const err = (k: string) => (state.fields?.[k] ? { error: state.fields[k] } : {});

  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {editing ? <input type="hidden" name="postId" value={post.id} /> : null}

      <Field label="Titel" htmlFor="title" {...err("title")}>
        <Input id="title" name="title" required defaultValue={post?.title ?? ""} maxLength={160} />
      </Field>

      <Field label="Beitrag" htmlFor="content" {...err("content")}>
        <PostEditor name="content" defaultDoc={post?.content ?? null} />
      </Field>

      <Field label="Kategorie" htmlFor="category" {...err("category")}>
        <select
          id="category"
          name="category"
          defaultValue={post?.category ?? "sonstiges"}
          className={SELECT_CLASS}
        >
          {CATEGORY_KEYS.map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABELS[key]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Sichtbarkeit" htmlFor="visibility" {...err("visibility")}>
        <select
          id="visibility"
          name="visibility"
          defaultValue={post?.visibility ?? "public"}
          className={SELECT_CLASS}
        >
          <option value="public">Öffentlich — für alle sichtbar</option>
          <option value="members">Nur Mitglieder</option>
          <option value="board">Nur Vorstände</option>
        </select>
      </Field>

      <SubmitButton editing={editing} />
    </Form>
  );
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert…" : editing ? "Änderungen speichern" : "Veröffentlichen"}
    </Button>
  );
}
```

- [ ] **Step 2: Wire `category` into the Server Action's field extraction**

Modify `apps/web/app/blog/actions.ts` — replace `fieldsFromForm`:

```typescript
function fieldsFromForm(fd: FormData) {
  return {
    title: s(fd, "title"),
    content: jsonOpt(fd, "content"),
    visibility: s(fd, "visibility") || "public",
    category: s(fd, "category") || "sonstiges",
  };
}
```

- [ ] **Step 3: Pass `category` from the edit page**

Modify `apps/web/app/blog/[slug]/bearbeiten/page.tsx` — in the `<PostForm post={{ ... }} />` call, add `category: post.category`:

```typescript
        <PostForm
          post={{
            id: post.id,
            title: post.title,
            content: post.content,
            visibility: post.visibility,
            category: post.category,
          }}
        />
```

- [ ] **Step 4: Show the category on the feed**

Modify `apps/web/app/blog/page.tsx` — two changes:

1. Add `CATEGORY_LABELS` to the `@bdas/blog` import:

```typescript
import { CATEGORY_LABELS, listPosts, renderPostContentHtml } from "@bdas/blog";
```

2. In the feed card's meta line, add the category before the visibility label:

```typescript
                      <span className="text-sm text-bdas-ink-muted">
                        {formatDate(p.createdAt)} · {CATEGORY_LABELS[p.category]}
                        {p.visibility !== "public" ? ` · ${VISIBILITY_LABEL[p.visibility]}` : ""}
                      </span>
```

(Replaces the existing two-line `<span>` body.)

- [ ] **Step 5: Show the category on the single-post page**

Modify `apps/web/app/blog/[slug]/page.tsx` — two changes:

1. Add `CATEGORY_LABELS` to the `@bdas/blog` import:

```typescript
import { CATEGORY_LABELS, getPostBySlug, renderPostContentHtml } from "@bdas/blog";
```

2. In the header, add the category before the visibility label:

```typescript
        <p className="text-sm text-bdas-ink-muted">
          {formatDate(post.createdAt)} · {CATEGORY_LABELS[post.category]}
          {post.visibility !== "public" ? ` · ${VISIBILITY_LABEL[post.visibility]}` : ""}
        </p>
```

- [ ] **Step 6: Manual verification**

Run: `pnpm --filter web typecheck`
Expected: no errors.

Run the dev server (`pnpm --filter web dev`, with `BDAS_FLAG_BLOG=true` set), sign in, go to `/blog/neu`, confirm the "Kategorie" select renders with all 6 German labels, publish a post, and confirm the category label shows on both the feed card and the single-post page.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_blog/PostForm.tsx apps/web/app/blog/actions.ts apps/web/app/blog/[slug]/bearbeiten/page.tsx apps/web/app/blog/page.tsx apps/web/app/blog/[slug]/page.tsx
git commit -m "feat(blog): category field in the post form, shown on feed and single-post page"
```

---

### Task 8: Category + time filter bar on the feed

**Files:**

- Create: `apps/web/app/_blog/filters.ts`
- Create: `apps/web/app/_blog/filters.test.ts`
- Create: `apps/web/app/_blog/BlogFilterBar.tsx`
- Modify: `apps/web/app/blog/page.tsx`

**Interfaces:**

- Consumes: `PostCategory`, `CATEGORY_LABELS` (`@bdas/blog`); `listPosts`'s `filters` param (Task 3).
- Produces: `resolveSince`, `buildBlogHref`, `parseCategory`, `parseZeitraum`, `CATEGORY_CHIPS`, `SINCE_OPTIONS`, `type SinceKey`; `<BlogFilterBar>`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_blog/filters.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildBlogHref,
  CATEGORY_CHIPS,
  parseCategory,
  parseZeitraum,
  resolveSince,
  SINCE_OPTIONS,
} from "./filters";

describe("CATEGORY_CHIPS / SINCE_OPTIONS", () => {
  it("has 6 category chips and 3 since options with German labels", () => {
    expect(CATEGORY_CHIPS).toHaveLength(6);
    expect(CATEGORY_CHIPS.map((c) => c.key)).toContain("verbandsintern");
    expect(SINCE_OPTIONS).toEqual([
      { key: "7d", label: "Letzte 7 Tage" },
      { key: "30d", label: "Letzte 30 Tage" },
      { key: "jahr", label: "Dieses Jahr" },
    ]);
  });
});

describe("parseCategory", () => {
  it("accepts a valid category", () => {
    expect(parseCategory("gruppenleben")).toBe("gruppenleben");
  });
  it("rejects an unknown value", () => {
    expect(parseCategory("unsinn")).toBeUndefined();
  });
  it("passes through undefined", () => {
    expect(parseCategory(undefined)).toBeUndefined();
  });
});

describe("parseZeitraum", () => {
  it("accepts the three valid keys", () => {
    expect(parseZeitraum("7d")).toBe("7d");
    expect(parseZeitraum("30d")).toBe("30d");
    expect(parseZeitraum("jahr")).toBe("jahr");
  });
  it("rejects anything else", () => {
    expect(parseZeitraum("90d")).toBeUndefined();
    expect(parseZeitraum(undefined)).toBeUndefined();
  });
});

describe("resolveSince", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for 'alle' (no filter)", () => {
    expect(resolveSince(undefined)).toBeUndefined();
  });
  it("resolves 7d to 7 days before now", () => {
    expect(resolveSince("7d")).toEqual(new Date("2026-07-19T12:00:00Z"));
  });
  it("resolves 30d to 30 days before now", () => {
    expect(resolveSince("30d")).toEqual(new Date("2026-06-26T12:00:00Z"));
  });
  it("resolves jahr to January 1st of the current year", () => {
    expect(resolveSince("jahr")).toEqual(new Date(2026, 0, 1));
  });
});

describe("buildBlogHref", () => {
  it("returns /blog with no filters", () => {
    expect(buildBlogHref(undefined, undefined)).toBe("/blog");
  });
  it("includes kategorie and zeitraum when set", () => {
    expect(buildBlogHref("gruppenleben", "30d")).toBe("/blog?kategorie=gruppenleben&zeitraum=30d");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test _blog/filters.test.ts`
Expected: FAIL — `./filters` does not exist yet.

- [ ] **Step 3: Write `filters.ts`**

Create `apps/web/app/_blog/filters.ts`:

```typescript
/**
 * Server-driven blog feed filtering (spec 2026-07-26) — URL search params in,
 * `<Link>` hrefs out, mirroring apps/web/app/events/event-filter.ts exactly
 * (shareable URLs, no client JS).
 */
import { CATEGORY_LABELS, type PostCategory } from "@bdas/blog";

export type CategoryChip = { readonly key: PostCategory; readonly label: string };

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as PostCategory[];

export const CATEGORY_CHIPS: ReadonlyArray<CategoryChip> = CATEGORY_KEYS.map((key) => ({
  key,
  label: CATEGORY_LABELS[key],
}));

export type SinceKey = "7d" | "30d" | "jahr";

const SINCE_LABEL: Record<SinceKey, string> = {
  "7d": "Letzte 7 Tage",
  "30d": "Letzte 30 Tage",
  jahr: "Dieses Jahr",
};

export const SINCE_OPTIONS: ReadonlyArray<{ readonly key: SinceKey; readonly label: string }> = (
  Object.keys(SINCE_LABEL) as SinceKey[]
).map((key) => ({ key, label: SINCE_LABEL[key] }));

/** Resolve a `zeitraum` URL value to a cutoff Date, or undefined for "alle". */
export function resolveSince(zeitraum: SinceKey | undefined): Date | undefined {
  const now = Date.now();
  switch (zeitraum) {
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "jahr":
      return new Date(new Date().getFullYear(), 0, 1);
    default:
      return undefined;
  }
}

/** Build the /blog href for a given category + time selection. */
export function buildBlogHref(
  category: PostCategory | undefined,
  zeitraum: SinceKey | undefined,
): string {
  const params = new URLSearchParams();
  if (category) params.set("kategorie", category);
  if (zeitraum) params.set("zeitraum", zeitraum);
  const q = params.toString();
  return q ? `/blog?${q}` : "/blog";
}

/** Parse the `kategorie` search param into a valid PostCategory, or undefined. */
export function parseCategory(value: string | undefined): PostCategory | undefined {
  return value && (CATEGORY_KEYS as string[]).includes(value) ? (value as PostCategory) : undefined;
}

/** Parse the `zeitraum` search param into a valid SinceKey, or undefined. */
export function parseZeitraum(value: string | undefined): SinceKey | undefined {
  return value === "7d" || value === "30d" || value === "jahr" ? value : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test _blog/filters.test.ts`
Expected: all PASS.

- [ ] **Step 5: Write `BlogFilterBar.tsx`**

Create `apps/web/app/_blog/BlogFilterBar.tsx`:

```typescript
import Link from "next/link";

import type { PostCategory } from "@bdas/blog";
import { cx } from "@bdas/design-system";

import { buildBlogHref, CATEGORY_CHIPS, SINCE_OPTIONS, type SinceKey } from "./filters";

// Mirrors core/design-system FilterChip's token styling; rendered as a <Link>
// so filtering stays server-driven (shareable URLs, no client JS) — same
// pattern as apps/web/app/events/EventFilterBar.tsx.
const CHIP =
  "inline-flex items-center rounded-bdas-pill border px-3 py-1 text-bdas-pill transition-colors duration-bdas-quick ease-bdas";
const ON = "border-bdas-strong bg-bdas-red text-white";
const OFF = "border-bdas-soft bg-bdas-surface text-bdas-ink hover:bg-bdas-overlay-hover";

export function BlogFilterBar({
  category,
  zeitraum,
}: {
  category: PostCategory | undefined;
  zeitraum: SinceKey | undefined;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildBlogHref(undefined, zeitraum)}
          aria-current={!category ? "true" : undefined}
          className={cx(CHIP, !category ? ON : OFF)}
        >
          Alle Kategorien
        </Link>
        {CATEGORY_CHIPS.map((c) => (
          <Link
            key={c.key}
            href={buildBlogHref(c.key, zeitraum)}
            aria-current={category === c.key ? "true" : undefined}
            className={cx(CHIP, category === c.key ? ON : OFF)}
          >
            {c.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildBlogHref(category, undefined)}
          aria-current={!zeitraum ? "true" : undefined}
          className={cx(CHIP, !zeitraum ? ON : OFF)}
        >
          Alle
        </Link>
        {SINCE_OPTIONS.map((opt) => (
          <Link
            key={opt.key}
            href={buildBlogHref(category, opt.key)}
            aria-current={zeitraum === opt.key ? "true" : undefined}
            className={cx(CHIP, zeitraum === opt.key ? ON : OFF)}
          >
            {opt.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire the filter bar into `blog/page.tsx`**

Modify `apps/web/app/blog/page.tsx` — full new contents:

```typescript
import Link from "next/link";

import { CATEGORY_LABELS, listPosts, renderPostContentHtml } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { Alert, Button, Card } from "@bdas/design-system";

import { requireBlogFlag } from "../_blog/flag";
import { InitialsAvatar } from "../_blog/InitialsAvatar";
import { loadBlogViewer, resolveAuthors } from "../_blog/access";
import { BlogFilterBar } from "../_blog/BlogFilterBar";
import { parseCategory, parseZeitraum, resolveSince } from "../_blog/filters";
import { formatDate } from "../../lib/format";

export const metadata = { title: "Blog" };

const VISIBILITY_LABEL: Record<string, string> = {
  public: "Öffentlich",
  members: "Nur Mitglieder",
  board: "Nur Vorstände",
};

export default async function BlogFeedPage({
  searchParams,
}: {
  searchParams: { kategorie?: string; zeitraum?: string };
}) {
  requireBlogFlag();

  const category = parseCategory(searchParams.kategorie);
  const zeitraum = parseZeitraum(searchParams.zeitraum);
  const since = resolveSince(zeitraum);

  const db = getDb();
  const { me, viewer } = await loadBlogViewer();
  const posts = await listPosts(db, viewer, { category, since });
  const authors = await resolveAuthors(posts.map((p) => p.createdBy));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold text-bdas-ink">Blog</h1>
          <p className="text-bdas-ink-body">Beiträge aus dem BDAS.</p>
        </div>
        {me ? (
          <Link href="/blog/neu">
            <Button>Neuer Beitrag</Button>
          </Link>
        ) : null}
      </header>

      <BlogFilterBar category={category} zeitraum={zeitraum} />

      {posts.length === 0 ? (
        <Alert variant="info" title="Keine Beiträge gefunden">
          Für diese Auswahl gibt es aktuell keine Beiträge.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-6">
          {posts.map((p) => {
            const author = authors.get(p.createdBy);
            const html = renderPostContentHtml(p.content);
            return (
              <li key={p.id}>
                <Card className="p-6">
                  <div className="flex items-center gap-3">
                    <InitialsAvatar initials={author?.initials ?? "?"} />
                    <div className="flex flex-col">
                      <span className="font-semibold text-bdas-ink">
                        {author?.name ?? "BDAS-Mitglied"}
                      </span>
                      <span className="text-sm text-bdas-ink-muted">
                        {formatDate(p.createdAt)} · {CATEGORY_LABELS[p.category]}
                        {p.visibility !== "public" ? ` · ${VISIBILITY_LABEL[p.visibility]}` : ""}
                      </span>
                    </div>
                  </div>

                  <Link href={`/blog/${p.slug}`} className="mt-4 block focus:outline-none">
                    <h2 className="text-xl font-semibold text-bdas-ink hover:text-bdas-red">
                      {p.title}
                    </h2>
                  </Link>

                  <div
                    className="prose mt-2 max-w-none text-bdas-ink-body"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />

                  <Link
                    href={`/blog/${p.slug}`}
                    className="mt-4 inline-block text-sm text-bdas-red hover:underline"
                  >
                    Beitrag öffnen
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
```

(Note: the empty-state copy changed from "Noch keine Beiträge" to "Keine Beiträge gefunden" — accurate for both the true-empty and filtered-empty cases.)

- [ ] **Step 7: Manual verification**

Run: `pnpm --filter web typecheck`
Expected: no errors.

Start the dev server, visit `/blog`, click a category chip and a time chip, confirm the URL updates (`?kategorie=...&zeitraum=...`), the feed narrows, and reloading the URL directly preserves the filter (server-driven).

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/_blog/filters.ts apps/web/app/_blog/filters.test.ts apps/web/app/_blog/BlogFilterBar.tsx apps/web/app/blog/page.tsx
git commit -m "feat(blog): category and time-range filter bar on the feed"
```

---

### Task 9: Report control on the single-post page

**Files:**

- Create: `apps/web/app/_blog/ReportPostButton.tsx`
- Modify: `apps/web/app/blog/actions.ts`
- Modify: `apps/web/app/blog/[slug]/page.tsx`

**Interfaces:**

- Consumes: `reportPost` (`@bdas/blog`, Task 5).
- Produces: `reportPostAction`, `ReportFormState`; `<ReportPostButton postId={...} />`.

- [ ] **Step 1: Add `reportPostAction` to `blog/actions.ts`**

Modify `apps/web/app/blog/actions.ts`:

1. Extend the `@bdas/blog` import line:

```typescript
import {
  canModeratePost,
  createPost,
  deletePost,
  getPostById,
  reportPost,
  updatePost,
} from "@bdas/blog";
```

2. Add a new exported type and function, placed after the existing `deletePostAction` function (end of file):

```typescript
export type ReportFormState = { readonly error?: string; readonly success?: boolean };

/** Report a post for board review. Any signed-in viewer except the author. */
export async function reportPostAction(
  _prev: ReportFormState,
  fd: FormData,
): Promise<ReportFormState> {
  if (!isFlagOn("blog")) return { error: "Nicht verfügbar." };
  const me = await loadBlogMe();
  if (!me) return { error: "Anmeldung erforderlich." };

  const postId = s(fd, "postId");
  const reason = s(fd, "reason");
  try {
    await reportPost(getDb(), postId, me.user.id, reason || null);
  } catch (err) {
    return appErr(err);
  }

  return { success: true };
}
```

- [ ] **Step 2: Write `ReportPostButton.tsx`**

Create `apps/web/app/_blog/ReportPostButton.tsx`:

```typescript
"use client";

import { useFormState, useFormStatus } from "react-dom";

import { reportPostAction, type ReportFormState } from "../blog/actions";

const initialState: ReportFormState = {};

const TEXTAREA_CLASS =
  "block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2 " +
  "text-sm text-bdas-ink focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20";

/** Member-facing report control: a collapsed disclosure with an optional reason. */
export function ReportPostButton({ postId }: { postId: string }) {
  const [state, action] = useFormState(reportPostAction, initialState);

  if (state.success) {
    return <p className="text-sm text-bdas-ink-muted">Danke, die Meldung ist eingegangen.</p>;
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-bdas-ink-muted hover:text-bdas-red">
        Beitrag melden
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="postId" value={postId} />
        <textarea name="reason" maxLength={300} placeholder="Grund (optional)" className={TEXTAREA_CLASS} />
        <SubmitButton />
        {state.error ? <span className="text-bdas-red">{state.error}</span> : null}
      </form>
    </details>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="self-start text-bdas-red hover:underline">
      {pending ? "Wird gesendet…" : "Melden"}
    </button>
  );
}
```

- [ ] **Step 3: Mount it on the single-post page**

Modify `apps/web/app/blog/[slug]/page.tsx`:

1. Add the import:

```typescript
import { ReportPostButton } from "../../_blog/ReportPostButton";
```

2. Add the control right before the `<CommentsPlaceholder ... />` line, hidden for the author and for signed-out visitors:

```typescript
      {me && me.user.id !== post.createdBy ? <ReportPostButton postId={post.id} /> : null}

      {/* Comments are member-only; guests never see this region (requirement 5). */}
      <CommentsPlaceholder canSeeComments={viewer.isMember} />
```

- [ ] **Step 4: Manual verification**

Run: `pnpm --filter web typecheck`
Expected: no errors.

Start the dev server. As member A, publish a post. As member B, view it — confirm "Beitrag melden" appears, expand it, submit a reason, confirm "Danke, die Meldung ist eingegangen." replaces the control. As member A (the author) viewing their own post, confirm no report control renders. As a signed-out visitor viewing a public post, confirm no report control renders.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_blog/ReportPostButton.tsx apps/web/app/blog/actions.ts apps/web/app/blog/[slug]/page.tsx
git commit -m "feat(blog): member-facing report control on the single-post page"
```

---

### Task 10: Federal-board report moderation queue

**Files:**

- Create: `apps/web/app/blog/meldungen/page.tsx`
- Create: `apps/web/app/_blog/DismissReportButton.tsx`
- Modify: `apps/web/app/blog/actions.ts`

**Interfaces:**

- Consumes: `listOpenReports`, `dismissReport` (`@bdas/blog`, Task 5); `requireFederalBoard` (`@bdas/members`); `DeletePostButton` (existing).
- Produces: `dismissReportAction`; `/blog/meldungen` page.

- [ ] **Step 1: Add `dismissReportAction` to `blog/actions.ts`**

Modify `apps/web/app/blog/actions.ts`:

1. Extend the `@bdas/blog` import line (from Task 9) to add `dismissReport`:

```typescript
import {
  canModeratePost,
  createPost,
  deletePost,
  dismissReport,
  getPostById,
  reportPost,
  updatePost,
} from "@bdas/blog";
```

2. Add `requireFederalBoard` to a new import from `@bdas/members`:

```typescript
import { requireFederalBoard } from "@bdas/members";
```

3. Add the action at the end of the file:

```typescript
/** Dismiss an open report (reviewed, no action taken). Federal board only. */
export async function dismissReportAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!isFlagOn("blog")) return { error: "Nicht verfügbar." };
  const reportId = s(fd, "reportId");
  try {
    const me = await loadBlogMe();
    if (!me) throw new ForbiddenError("Anmeldung erforderlich.");
    requireFederalBoard(me);
    await dismissReport(getDb(), reportId);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  revalidatePath("/blog/meldungen");
  return {};
}
```

- [ ] **Step 2: Write `DismissReportButton.tsx`**

Create `apps/web/app/_blog/DismissReportButton.tsx`:

```typescript
"use client";

import { useFormState, useFormStatus } from "react-dom";

import { dismissReportAction, type ActionState } from "../blog/actions";

const initialState: ActionState = {};

export function DismissReportButton({ reportId }: { reportId: string }) {
  const [state, action] = useFormState(dismissReportAction, initialState);
  return (
    <form action={action}>
      <input type="hidden" name="reportId" value={reportId} />
      <SubmitButton />
      {state.error ? <span className="ml-2 text-bdas-red">{state.error}</span> : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="text-bdas-ink-muted hover:underline">
      {pending ? "Wird verworfen…" : "Meldung verwerfen"}
    </button>
  );
}
```

- [ ] **Step 3: Write the moderation queue page**

Create `apps/web/app/blog/meldungen/page.tsx`:

```typescript
import { redirect } from "next/navigation";

import { listOpenReports } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { requireFederalBoard } from "@bdas/members";

import { requireBlogFlag } from "../../_blog/flag";
import { loadBlogMe } from "../../_blog/access";
import { DeletePostButton } from "../../_blog/DeletePostButton";
import { DismissReportButton } from "../../_blog/DismissReportButton";
import { formatDate } from "../../../lib/format";

export const metadata = { title: "Gemeldete Beiträge" };

export default async function ReportedPostsPage() {
  requireBlogFlag();

  const me = await loadBlogMe();
  if (!me) redirect("/anmelden");
  requireFederalBoard(me);

  const db = getDb();
  const reports = await listOpenReports(db);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Gemeldete Beiträge</h1>

      {reports.length === 0 ? (
        <Alert variant="info" title="Keine offenen Meldungen">
          Aktuell liegen keine Meldungen zur Prüfung vor.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-4">
          {reports.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-2 p-6">
                <a
                  href={`/blog/${r.postSlug}`}
                  className="font-semibold text-bdas-ink hover:text-bdas-red"
                >
                  {r.postTitle}
                </a>
                <p className="text-sm text-bdas-ink-muted">
                  Gemeldet am {formatDate(r.createdAt)}
                  {r.reason ? ` · Grund: ${r.reason}` : ""}
                </p>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <DeletePostButton postId={r.postId} />
                  <DismissReportButton reportId={r.id} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `pnpm --filter web typecheck`
Expected: no errors.

Start the dev server. Report a post as one member (Task 9's flow). Visit `/blog/meldungen` as a non-federal member — confirm the app's error boundary renders (ForbiddenError propagates, matching `apps/web/app/admin/gruppen/neu/page.tsx`'s existing convention). Visit `/blog/meldungen` as federal board — confirm the report appears with title, date, reason, and both action buttons. Click "Meldung verwerfen" — confirm it disappears from the list. Report another post and click "Löschen" via `DeletePostButton` — confirm the post is soft-deleted and the report list clears (since `listOpenReports` excludes deleted posts).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/blog/meldungen/page.tsx apps/web/app/_blog/DismissReportButton.tsx apps/web/app/blog/actions.ts
git commit -m "feat(blog): federal-board report moderation queue at /blog/meldungen"
```

---

### Task 11: Notify the federal board by email when a post is reported

**Files:**

- Modify: `modules/notifications/src/types.ts`
- Modify: `modules/notifications/src/services/send.ts`
- Modify: `modules/notifications/src/templates.ts`
- Modify: `modules/notifications/src/subscribers.ts`
- Modify: `modules/notifications/package.json`
- Create: `modules/notifications/src/subscribers.blog.test.ts`

**Interfaces:**

- Consumes: `PostReported` event, `getPostById` (`@bdas/blog`, Task 5); `listBoardRecipientsForGroup(db, null)` (`@bdas/members`, already resolves to the federal board).
- Produces: `blog_post_reported` template; a new subscriber wired into `registerNotificationSubscribers`.

- [ ] **Step 1: Add the `@bdas/blog` dependency**

Modify `modules/notifications/package.json` — add to `dependencies` (alphabetically, after `@bdas/db`):

```json
    "@bdas/blog": "workspace:*",
```

- [ ] **Step 2: Extend `types.ts`**

Modify `modules/notifications/src/types.ts`:

1. Add `"blog_post_reported"` to `TransactionalTemplate`:

```typescript
export type TransactionalTemplate =
  | "event_registration_confirmed"
  | "event_waitlisted"
  | "event_deregistration_confirmed"
  | "event_waitlist_promoted"
  | "event_changed"
  | "event_cancelled"
  | "event_organizer_message"
  | "event_organizer_granted"
  | "event_organizer_revoked"
  | "member_application_received"
  | "blog_post_reported";
```

2. Add three fields to `TemplateData` (before the closing `};`):

```typescript
  /** `blog_post_reported`: the reported post's title. */
  readonly postTitle?: string | undefined;
  /** `blog_post_reported`: absolute URL to the reported post, if a site URL is configured. */
  readonly postUrl?: string | undefined;
  /** `blog_post_reported`: the reporter's optional free-text reason. */
  readonly reportReason?: string | undefined;
```

- [ ] **Step 3: Extend `send.ts`**

Modify `modules/notifications/src/services/send.ts`:

1. Add the same three fields to the `Extra` type:

```typescript
type Extra = {
  readonly eventTitle?: string | undefined;
  readonly eventId?: string | undefined;
  readonly eventUrl?: string | undefined;
  readonly changes?: ReadonlyArray<EventChangeKind> | undefined;
  readonly subject?: string | undefined;
  readonly messageBody?: string | undefined;
  readonly groupName?: string | undefined;
  readonly applicantName?: string | undefined;
  readonly postTitle?: string | undefined;
  readonly postUrl?: string | undefined;
  readonly reportReason?: string | undefined;
};
```

2. Pass them through in `sendToRecipient`'s `data` construction:

```typescript
const data: TemplateData = {
  firstName: to.firstName,
  eventTitle: extra.eventTitle ?? "",
  eventUrl: extra.eventUrl,
  changes: extra.changes,
  subject: extra.subject,
  messageBody: extra.messageBody,
  groupName: extra.groupName,
  applicantName: extra.applicantName,
  postTitle: extra.postTitle,
  postUrl: extra.postUrl,
  reportReason: extra.reportReason,
};
```

- [ ] **Step 4: Extend `templates.ts`**

Modify `modules/notifications/src/templates.ts`:

1. Extend the top destructure in `render`:

```typescript
const { firstName, eventTitle, eventUrl, postTitle, postUrl, reportReason } = data;
```

2. Add a new `case` in the `switch`, right after the existing `case "member_application_received":` block (before the closing `}` of the switch):

```typescript
    case "blog_post_reported":
      return body(
        "BDAS — Beitrag gemeldet",
        firstName,
        `der Beitrag „${postTitle ?? "ein Beitrag"}“ wurde gemeldet${
          reportReason ? ` (Grund: ${reportReason})` : ""
        }. Bitte prüfe ihn im Blog-Bereich.`,
        postUrl ? { label: "Zum Beitrag:", url: postUrl } : undefined,
      );
```

- [ ] **Step 5: Extend `subscribers.ts`**

Modify `modules/notifications/src/subscribers.ts`:

1. Add the import:

```typescript
import { getPostById, type PostReported } from "@bdas/blog";
```

2. Add a new entry to the `subs = [ ... ]` array (after the existing `ProfileCompleted` subscription, before the closing `];`):

```typescript
    getEventBus().subscribe<PostReported>(
      "blog.post.reported",
      safe<PostReported>(async (e) => {
        const post = await getPostById(db, e.postId);
        const recipients = await listBoardRecipientsForGroup(db, null); // null → federal board
        for (const memberId of recipients) {
          await sendTransactional(db, "blog_post_reported", memberId, {
            postTitle: post?.title ?? "ein Beitrag",
            postUrl:
              post && opts.siteUrl
                ? `${opts.siteUrl.replace(/\/$/, "")}/blog/${post.slug}`
                : undefined,
            reportReason: e.reason ?? undefined,
          });
        }
      }),
    ),
```

- [ ] **Step 6: Write the failing test**

Create `modules/notifications/src/subscribers.blog.test.ts`:

```typescript
/**
 * `blog.post.reported` → federal board notification, integration test against
 * a real Postgres schema. Mirrors subscribers.profile.test.ts's setup.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";
import type { PostReported } from "@bdas/blog";

import { setNotifier, type OutboundEmail } from "./notifier";
import { setRecipientResolver } from "./resolver";
import { registerNotificationSubscribers, unregisterNotificationSubscribers } from "./subscribers";
import type { RecipientContact } from "./types";

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

describeIfDb("notifications: blog.post.reported → federal board notification", () => {
  let t: TestDb;
  let sent: OutboundEmail[];

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0002_role_grants.sql"],
      ["..", "..", "blog", "migrations", "0001_init.sql"],
      ["..", "..", "blog", "migrations", "0002_categories_reports_softdelete.sql"],
    ]) {
      const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
      await t.client.unsafe(sql);
    }

    sent = [];
    setNotifier({
      async send(email): Promise<void> {
        sent.push(email);
      },
    });
    setRecipientResolver({
      async resolve(): Promise<RecipientContact | null> {
        return { email: "board@example.org", firstName: "Vorstand" };
      },
    });
  });

  afterEach(async () => {
    unregisterNotificationSubscribers();
    resetEventBus();
    await t.cleanup();
  });

  async function seedFederalBoard(): Promise<void> {
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES ('usr_board', 'board@example.org', 'board@example.org', 'active')`;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_board', 'usr_board', 'Bo', 'Board', NULL, 'active')`;
    await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
      VALUES ('mrg_board', 'mem_board', 'federal_board', NULL, 'usr_seed')`;
  }

  async function seedPost(): Promise<void> {
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES ('usr_author', 'author@example.org', 'author@example.org', 'active')`;
    await t.client`
      INSERT INTO posts (id, slug, title, content, created_by)
      VALUES ('post_1', 'testbeitrag', 'Testbeitrag', '{"type":"doc"}', 'usr_author')`;
  }

  it("emails the federal board when a post is reported", async () => {
    await seedFederalBoard();
    await seedPost();

    registerNotificationSubscribers(t.db, { siteUrl: "https://dashboard.bdas.de" });
    await getEventBus().publish<PostReported>({
      type: "blog.post.reported",
      postId: "post_1",
      reporterId: "usr_reporter",
      reason: "Wirkt wie Spam",
      at: new Date(),
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe("BDAS — Beitrag gemeldet");
    expect(sent[0]?.text).toContain("Testbeitrag");
    expect(sent[0]?.text).toContain("Wirkt wie Spam");
    expect(sent[0]?.text).toContain("https://dashboard.bdas.de/blog/testbeitrag");
  });
});
```

- [ ] **Step 7: Run tests**

Run: `pnpm install` (picks up the new `@bdas/blog` workspace dependency), then `pnpm --filter @bdas/notifications test subscribers.blog.test.ts`
Expected: PASS (or SKIP if Postgres is unreachable).

Run: `pnpm --filter @bdas/notifications test` and `pnpm --filter @bdas/notifications typecheck`
Expected: full suite green, no type errors (this also exercises the existing `templates.test.ts` — confirm it doesn't assert an exhaustive `TransactionalTemplate` list that would now be stale; if it does, add a case there too).

- [ ] **Step 8: Commit**

```bash
git add modules/notifications/package.json modules/notifications/src/types.ts modules/notifications/src/services/send.ts modules/notifications/src/templates.ts modules/notifications/src/subscribers.ts modules/notifications/src/subscribers.blog.test.ts pnpm-lock.yaml
git commit -m "feat(notifications): email the federal board when a blog post is reported"
```

---

### Task 12: E2E test extensions

**Files:**

- Modify: `e2e/blog.e2e.ts`

**Interfaces:**

- Consumes: everything built in Tasks 1–11.

- [ ] **Step 1: Add category-filter and moderation-queue coverage**

Modify `e2e/blog.e2e.ts` — extend the `writePost` helper to optionally set a category, and add two new tests inside `test.describe("blog", ...)`.

Replace the `writePost` helper:

```typescript
/** Fill the post form (title + body + category + visibility) and publish; returns the slug. */
async function writePost(
  page: Page,
  opts: {
    title: string;
    body: string;
    category?:
      | "verbandsintern"
      | "gruppenleben"
      | "veranstaltungsrueckblick"
      | "politik_positionen"
      | "karriere_weiterbildung"
      | "sonstiges";
    visibility?: "public" | "members" | "board";
  },
): Promise<string> {
  await page.goto("/blog/neu");
  await page.getByLabel("Titel").fill(opts.title);

  // Type into the real Tiptap editor; onUpdate fills the hidden `content` input.
  const editor = page.locator('.ProseMirror[contenteditable="true"]');
  await editor.click();
  await editor.pressSequentially(opts.body);

  if (opts.category && opts.category !== "sonstiges") {
    await page.locator("#category").selectOption(opts.category);
  }
  if (opts.visibility && opts.visibility !== "public") {
    await page.locator("#visibility").selectOption(opts.visibility);
  }

  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  // The create action redirects to /blog/<slug>; the post's own <h1> is the title.
  await expect(page.getByRole("heading", { level: 1, name: opts.title })).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop()!;
}
```

Add these tests at the end of `test.describe("blog", ...)`, before the closing `});`:

```typescript
test("category filter narrows the feed", async ({ page }) => {
  await registerVerifyLogin(page, { email: uniqueEmail("blog-category") });

  const groupTitle = `Gruppenleben ${Date.now()}`;
  await writePost(page, {
    title: groupTitle,
    body: "Bericht aus der Gruppe.",
    category: "gruppenleben",
  });

  const careerTitle = `Karriere ${Date.now()}`;
  await writePost(page, {
    title: careerTitle,
    body: "Ein Karrieretipp.",
    category: "karriere_weiterbildung",
  });

  await page.goto("/blog?kategorie=gruppenleben");
  await expect(page.getByRole("heading", { name: groupTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: careerTitle })).toHaveCount(0);
});

test("a reported post appears in the federal board's queue; a non-board member is forbidden", async ({
  page,
}) => {
  await registerVerifyLogin(page, { email: uniqueEmail("blog-reported-author") });
  const title = `Gemeldet ${Date.now()}`;
  await writePost(page, { title, body: "Fragwürdiger Inhalt." });

  await logout(page);
  await registerVerifyLogin(page, { email: uniqueEmail("blog-reporter") });
  await page.goto("/blog");
  await page.getByRole("heading", { name: title }).click();
  await page.getByText("Beitrag melden").click();
  await page.getByPlaceholder("Grund (optional)").fill("Testmeldung");
  await page.getByRole("button", { name: "Melden" }).click();
  await expect(page.getByText("Danke, die Meldung ist eingegangen.")).toBeVisible();

  // A non-board member is forbidden from the moderation queue.
  await page.goto("/blog/meldungen");
  await expect(page.getByRole("heading", { name: "Gemeldete Beiträge" })).toHaveCount(0);
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `BDAS_FLAG_BLOG=true pnpm --filter web e2e blog.e2e.ts` (or the repo's documented e2e command if different — check `package.json`'s `e2e` script)
Expected: all tests PASS. (The federal-board side of the moderation queue — an actual `federal_board` grant — has no self-service UI in this repo to acquire via e2e flows, so this plan does not attempt to seed a federal-board e2e user; the "forbidden for non-board" half is covered here, and the "board sees the report" half is covered by Task 11's integration test plus Task 10's manual verification.)

- [ ] **Step 3: Commit**

```bash
git add e2e/blog.e2e.ts
git commit -m "test(blog): e2e coverage for category filtering and the report flow"
```

---

### Task 13: Update `modules/blog/README.md`

**Files:**

- Modify: `modules/blog/README.md`

- [ ] **Step 1: Update the README**

Replace the full contents of `modules/blog/README.md`:

```markdown
# @bdas/blog

Member-authored blog posts with a fast, social-feed-style posting flow,
per-post visibility, categories, and time-based filtering.

## Public surface (`src/index.ts`)

- **Services** — `createPost`, `updatePost`, `deletePost` (soft-delete),
  `listPosts` (with optional `category`/`since` filters), `getPostBySlug`,
  `getPostById`, `reportPost`, `listOpenReports`, `dismissReport`, plus
  `PostInput` (zod) and `rowToPost`.
- **Rendering** — `renderPostContentHtml(doc)` turns a post's Tiptap JSON into
  sanitized HTML (server-side; the editor never ships to visitors). `plainTextToDoc`.
- **Visibility rules (central, reusable)** — `Viewer`, `ANON`,
  `visibleLevelsFor`, `canViewPost`, `canModeratePost`.
- **Categories** — `PostCategory`, `CATEGORY_LABELS` (German display labels).
- **Slug** — `slugifyTitle`.
- **Types / events** — `Post`, `PostSummary`, `PostVisibility`, `PostReport`,
  `PostReportStatus`, `TiptapDoc`, `BlogEvent` and its members (including
  `PostReported`).

## Owned tables

- `posts` — id, unique `slug`, `title`, `content` (Tiptap JSON, `jsonb`),
  `visibility`, `category`, `deleted_at` (soft-delete marker), `created_by`
  (auth user id, no FK — matches events), timestamps.
- `post_reports` — id, `post_id` (FK → posts, cascade), `reporter_id`, `reason`,
  `status` (`open`/`dismissed`), `created_at`.
- Migrations: [`migrations/0001_init.sql`](migrations/0001_init.sql),
  [`migrations/0002_categories_reports_softdelete.sql`](migrations/0002_categories_reports_softdelete.sql).

No other module reads or writes these tables (rule 1).

## Visibility (spec requirement 1)

Every read path runs through `visibility.ts` — feed SQL filter, single-post
fetch, and the app's page guards — so the rule is enforced **server-side**, never
in the UI alone.

| Level     | German UI label | Who may see it                      |
| --------- | --------------- | ----------------------------------- |
| `public`  | Öffentlich      | everyone, incl. signed-out visitors |
| `members` | Nur Mitglieder  | signed-in active members            |
| `board`   | Nur Vorstände   | **federal board only**              |

The author always sees their own post regardless of level.

## Categories and filtering (spec 2026-07-26)

A post has exactly one fixed category, chosen at authoring time:

| Key                        | German label             |
| -------------------------- | ------------------------ |
| `verbandsintern`           | Verbandsintern           |
| `gruppenleben`             | Gruppenleben             |
| `veranstaltungsrueckblick` | Veranstaltungsrückblick  |
| `politik_positionen`       | Politik & Positionen     |
| `karriere_weiterbildung`   | Karriere & Weiterbildung |
| `sonstiges`                | Sonstiges                |

The feed (`/blog`) can be filtered by category and by a relative time range
(7 days / 30 days / this year) via URL search params (`?kategorie=&zeitraum=`),
mirroring the events module's filter-bar pattern — server-driven, shareable
URLs, no client JS.

## Rights

- **Create** — an **active member or alumnus** (ADR 0030 — narrower than a
  plain "any signed-in user"; `pending`/`inactive` accounts cannot). Gated at
  the app layer (`requirePostAuthor`/`canAuthor`), since it needs no post
  context. This deliberately diverges from `docs/bdas-platform-spec.md` §4's
  role table, which lists blog posting as a Local Board right — see ADR 0030.
- **Edit / delete** — the author, or federal board (moderation) —
  `canModeratePost`. Delete is a soft-delete (`deleted_at`); there is no
  restore UI.
- **Report** — any signed-in member who can view the post, except its own
  author. Rate-limited to 10 reports/24h per reporter.

## Abuse protection

- **Rate limiting** — `createPost` rejects a 4th post within an hour from the
  same author (`RateLimitError`); `reportPost` rejects an 11th report within
  24h from the same reporter. Both count the module's own rows — no separate
  rate-limit table.
- **Reporting** — `reportPost` records a `post_reports` row and emits
  `blog.post.reported`; `@bdas/notifications` subscribes and emails the
  federal board. `listOpenReports`/`dismissReport` back the moderation queue
  at `/blog/meldungen` (federal board only).
- **Soft-delete** — `deletePost` sets `deleted_at` instead of removing the
  row. Every read path excludes it; there is no restore surface.

## Comments

Not built. The single-post page mounts `CommentsPlaceholder`, which renders
nothing for signed-out/external visitors — the decided visibility rule (spec
requirement 5) is in place so a future comments module drops in behind the same
`canSeeComments` gate.

## App integration

- Feed `/blog` (filterable), single post `/blog/[slug]`, create `/blog/neu`,
  edit `/blog/[slug]/bearbeiten`, report queue `/blog/meldungen`, image upload
  `POST /api/blog/upload-url`.
- Inline images use the public `blog-media` Supabase bucket
  (`@bdas/storage` `getBlogMediaStorage` / `blogMediaPublicUrl`).
- The feed shows a generated initials avatar — the members module stores no
  profile photo. The single view shows the author by name only.

## Feature flag

`BDAS_FLAG_BLOG` — off by default (rule 6).

## Tests

`pnpm --filter @bdas/blog test`. Pure logic (slug, content render/sanitize,
visibility) runs anywhere; the integration suites (`index.test.ts`,
`schema.test.ts`) need a reachable Postgres (`DATABASE_URL`) and skip
otherwise.
```

- [ ] **Step 2: Commit**

```bash
git add modules/blog/README.md
git commit -m "docs(blog): update README for categories, filtering, and abuse protection"
```

---

## Final verification (after all tasks)

- [ ] Run: `pnpm -r typecheck` — expect no errors across the workspace.
- [ ] Run: `pnpm --filter @bdas/blog test && pnpm --filter @bdas/notifications test` — expect all green.
- [ ] Run: `pnpm --filter web build` — expect a successful production build (catches any server/client component boundary issues in the new files).
- [ ] Run: `BDAS_FLAG_BLOG=true pnpm --filter web e2e blog.e2e.ts` — expect all 5 tests green.
- [ ] Confirm `docs/decisions/0030-blog-authoring-rights.md` and both new migrations are committed.
