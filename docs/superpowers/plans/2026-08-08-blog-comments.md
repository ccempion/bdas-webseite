# Blog Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let active members and alumni write short plain-text comments under a blog post, delete their own, and see a comment count on the feed.

**Architecture:** A `post_comments` table owned by `@bdas/blog` (rule 1 — comments are a property of posts, and blog owns posts). Pure permission rules go in the module's existing `visibility.ts`; all reads and writes go through `src/services/comments.ts`, exported from `index.ts`. The app layer adds two Server Actions and three components, replacing the existing `CommentsPlaceholder`. No new module, no threading, no rich text.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Components + Server Actions), Drizzle ORM on PostgreSQL, Vitest against a real Docker Postgres, Playwright for E2E, Tailwind via `@bdas/design-system` tokens.

**Spec:** `docs/superpowers/specs/2026-08-08-blog-comments-design.md`. Read it before starting; this plan implements it and does not restate its rationale.

## Global Constraints

- **Module boundary (CLAUDE.md §1 rule 1/8):** only `@bdas/blog` touches `post_comments`. Everything other packages need is re-exported from `modules/blog/src/index.ts`. No deep imports like `@bdas/blog/src/services/comments` — that is a CI failure, not a nit.
- **Migrations (rule 7):** the new migration lives at `modules/blog/migrations/0003_comments.sql`. The manifest at `infra/migrations/src/manifest.ts` already lists `"blog"`; **do not edit it**.
- **Tests ship in the same PR** (CLAUDE.md §4). No database mocks — integration tests run against real Postgres via `createTestDb`.
- **Design tokens only** (CLAUDE.md §7): no inline hex, radius, shadow, or duration. Use `text-bdas-ink`, `text-bdas-ink-body`, `text-bdas-ink-muted`, `text-bdas-red`, `border-bdas-soft`, `rounded-bdas`.
- **All user-facing copy is German.**
- **Client components use `useFormState` + `useFormStatus` from `react-dom`** — not `useActionState`. This is what every existing blog client component does.
- **Rate limit:** 20 comments per rolling 24 hours per author.
- **Body length:** 1–1000 characters after trimming.
- **Id prefix:** `createId("cmnt")`.
- **Run `npx prettier --write <files>` before every commit** — CI runs `format:check`.

---

## File Structure

**Create:**

| File                                         | Responsibility                                                 |
| -------------------------------------------- | -------------------------------------------------------------- |
| `modules/blog/migrations/0003_comments.sql`  | `post_comments` DDL — the authoritative schema                 |
| `modules/blog/src/services/comments.ts`      | All comment reads/writes; the only file that touches the table |
| `modules/blog/src/comments.test.ts`          | Integration tests for the above against real Postgres          |
| `apps/web/app/_blog/CommentsSection.tsx`     | Server component: gate, load, render list + composer           |
| `apps/web/app/_blog/CommentForm.tsx`         | Client component: textarea, counter, submit                    |
| `apps/web/app/_blog/DeleteCommentButton.tsx` | Client component: confirm + delete                             |
| `docs/decisions/0032-blog-comments.md`       | ADR recording the spec-override                                |

**Modify:**

| File                                  | Change                                           |
| ------------------------------------- | ------------------------------------------------ |
| `core/feature-flags/src/index.ts`     | Add `"blog_comments"` to `FLAGS`                 |
| `modules/blog/src/schema.ts`          | Add the `postComments` Drizzle table             |
| `modules/blog/src/types.ts`           | Add the `Comment` type                           |
| `modules/blog/src/visibility.ts`      | Add `canModerateComment`                         |
| `modules/blog/src/visibility.test.ts` | Cases for `canModerateComment`                   |
| `modules/blog/src/events.ts`          | Add `CommentCreated`, extend `BlogEvent`         |
| `modules/blog/src/index.ts`           | Re-export the new public surface                 |
| `modules/blog/src/index.test.ts:58`   | Apply `0003_comments.sql` in the test harness    |
| `modules/blog/README.md`              | Document the comments surface                    |
| `apps/web/app/_blog/flag.ts`          | Add `commentsEnabled()`                          |
| `apps/web/app/blog/actions.ts`        | Add `createCommentAction`, `deleteCommentAction` |
| `apps/web/app/blog/[slug]/page.tsx`   | Swap placeholder for `CommentsSection`           |
| `apps/web/app/blog/page.tsx`          | Render the comment count on feed cards           |
| `playwright.config.ts:70`             | `BDAS_FLAG_BLOG_COMMENTS: "true"`                |
| `e2e/blog.e2e.ts`                     | Comment E2E cases                                |

**Delete:** `apps/web/app/_blog/CommentsPlaceholder.tsx` (in Task 7, once nothing imports it).

---

## Task 1: Feature flag

**Files:**

- Modify: `core/feature-flags/src/index.ts:10-26`
- Modify: `apps/web/app/_blog/flag.ts`
- Modify: `playwright.config.ts:70`

**Interfaces:**

- Consumes: nothing.
- Produces: `isFlagOn("blog_comments")`; `commentsEnabled(): boolean` from `apps/web/app/_blog/flag.ts`.

The `blog` flag is already on in production. Without this sub-flag, merging this work turns comments on federation-wide the moment it deploys. Default is off.

- [ ] **Step 1: Add the flag to the FLAGS list**

In `core/feature-flags/src/index.ts`, add `"blog_comments"` to the `FLAGS` array, directly after `"blog"`:

```ts
export const FLAGS = [
  "auth",
  "members",
  "groups",
  "events",
  "files",
  "notifications",
  "projects",
  "blog",
  "blog_comments",
  "handover",
  "payments",
  "dashboard",
  "public_shell",
  "group_map",
  "content",
  "profile",
] as const;
```

The env var is derived as `BDAS_FLAG_` + upper-case name, so this reads `BDAS_FLAG_BLOG_COMMENTS`. No other change to that file.

- [ ] **Step 2: Add the app-layer helper**

Append to `apps/web/app/_blog/flag.ts`:

```ts
/**
 * Comments ride the blog module but ship behind their own flag: `blog` is
 * already on in production, so without this a merge would switch comments on
 * federation-wide (ADR 0032). Unlike `requireBlogFlag`, this returns a boolean
 * — a post page still renders fine with the comments region absent.
 */
export function commentsEnabled(): boolean {
  return isFlagOn("blog") && isFlagOn("blog_comments");
}
```

- [ ] **Step 3: Turn the flag on for E2E**

In `playwright.config.ts`, add after line 69 (`BDAS_FLAG_BLOG: "true",`):

```ts
      BDAS_FLAG_BLOG_COMMENTS: "true",
```

- [ ] **Step 4: Verify the workspace still typechecks**

Run: `pnpm --filter @bdas/feature-flags typecheck && pnpm --filter @bdas/feature-flags test`
Expected: PASS. (The flags test does not enumerate `FLAGS`, so adding an entry breaks nothing.)

- [ ] **Step 5: Commit**

```bash
npx prettier --write core/feature-flags/src/index.ts apps/web/app/_blog/flag.ts playwright.config.ts
git add core/feature-flags/src/index.ts apps/web/app/_blog/flag.ts playwright.config.ts
git commit -m "feat(blog): add blog_comments feature flag"
```

---

## Task 2: Schema, types, and migration

**Files:**

- Create: `modules/blog/migrations/0003_comments.sql`
- Modify: `modules/blog/src/schema.ts`
- Modify: `modules/blog/src/types.ts`
- Modify: `modules/blog/src/index.test.ts:58`

**Interfaces:**

- Consumes: nothing.
- Produces: table `post_comments`; `postComments` Drizzle table and `PostCommentRow` from `./schema`; `Comment` type from `./types`.

- [ ] **Step 1: Write the migration**

Create `modules/blog/migrations/0003_comments.sql`:

```sql
-- Blog module — member comments on posts (spec 2026-08-08, ADR 0032).
-- Flat (no threading), plain text, member-and-alumni only. `deleted_at` is the
-- moderation soft delete, matching posts; erasure on account deletion is a
-- hard DELETE instead (see deleteCommentsByAuthor).

CREATE TABLE post_comments (
  id          text PRIMARY KEY,
  post_id     text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id   text NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT post_comments_body_length CHECK (char_length(body) BETWEEN 1 AND 1000)
);

CREATE INDEX post_comments_post_idx   ON post_comments(post_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX post_comments_author_idx ON post_comments(author_id, created_at);
```

- [ ] **Step 2: Add the Drizzle table**

Append to `modules/blog/src/schema.ts`:

```ts
// A member's comment on a post (spec 2026-08-08). Blog-owned per rule 1.
export const postComments = pgTable(
  "post_comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    // Auth user id of the commenter. Plain id, no FK (matches posts.createdBy).
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Moderation soft delete. Every read path filters it out.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    postIdx: index("post_comments_post_idx").on(t.postId, t.createdAt),
    authorIdx: index("post_comments_author_idx").on(t.authorId, t.createdAt),
  }),
);

export type PostCommentRow = typeof postComments.$inferSelect;
```

No import changes needed — `index`, `pgTable`, `text`, `timestamp` are already imported at the top of the file.

- [ ] **Step 3: Add the domain type**

Append to `modules/blog/src/types.ts`:

```ts
/** One member's comment on a post. Flat — comments never reference each other. */
export type Comment = {
  readonly id: string;
  readonly postId: string;
  /** Auth user id of the commenter (no FK, matches `Post.createdBy`). */
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: Date;
};
```

- [ ] **Step 4: Apply the migration in the test harness**

In `modules/blog/src/index.test.ts`, line 58, extend the migration list:

```ts
    for (const file of [
      "0001_init.sql",
      "0002_categories_reports_softdelete.sql",
      "0003_comments.sql",
    ]) {
```

- [ ] **Step 5: Verify existing tests still pass against the new schema**

Run: `pnpm db:up && pnpm --filter @bdas/blog test`
Expected: PASS — the existing blog suite is unaffected, but the new table now exists in every test schema.

- [ ] **Step 6: Commit**

```bash
npx prettier --write modules/blog/src/schema.ts modules/blog/src/types.ts modules/blog/src/index.test.ts
git add modules/blog/migrations/0003_comments.sql modules/blog/src/schema.ts modules/blog/src/types.ts modules/blog/src/index.test.ts
git commit -m "feat(blog): post_comments table, type, and migration"
```

---

## Task 3: Moderation rule (`canModerateComment`)

**Files:**

- Modify: `modules/blog/src/visibility.ts`
- Test: `modules/blog/src/visibility.test.ts`

**Interfaces:**

- Consumes: `Viewer` from `./visibility`.
- Produces: `canModerateComment(v: Viewer, c: { readonly authorId: string }): boolean`.

This is a pure function with no database access, so it gets plain unit tests — no Postgres needed.

- [ ] **Step 1: Write the failing tests**

The file is a series of top-level `describe` blocks (`visibleLevelsFor`, `canViewPost`, `canModeratePost`). Append a fourth at the end of `modules/blog/src/visibility.test.ts`:

```ts
describe("canModerateComment", () => {
  const author: Viewer = { userId: "usr_a", isMember: true, isFederal: false };
  const other: Viewer = { userId: "usr_b", isMember: true, isFederal: false };
  const federal: Viewer = { userId: "usr_f", isMember: true, isFederal: true };
  const comment = { authorId: "usr_a" };

  it("lets the comment's author delete it", () => {
    expect(canModerateComment(author, comment)).toBe(true);
  });

  it("lets the federal board delete anyone's comment", () => {
    expect(canModerateComment(federal, comment)).toBe(true);
  });

  it("does not let another member delete it", () => {
    expect(canModerateComment(other, comment)).toBe(false);
  });

  it("does not let an anonymous viewer delete it", () => {
    expect(canModerateComment(ANON, comment)).toBe(false);
  });

  it("does not let a signed-out viewer match a comment with an empty author id", () => {
    expect(canModerateComment(ANON, { authorId: "" })).toBe(false);
  });
});
```

Add `canModerateComment` to the file's existing import from `./visibility`. `ANON` and `Viewer` are already imported there.

The last case guards a real footgun: `ANON.userId` is `null`, and a `null === ""` comparison must not accidentally pass.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/blog test -- visibility`
Expected: FAIL — `canModerateComment is not a function` / TypeScript error `has no exported member 'canModerateComment'`.

- [ ] **Step 3: Implement**

Append to `modules/blog/src/visibility.ts`:

```ts
/**
 * Whether the viewer may delete this comment: its own author, or federal board
 * (moderation). Post authors deliberately may NOT delete comments on their own
 * post — see ADR 0032. Writing a comment requires member status the `Viewer`
 * does not carry, so eligibility is checked at the app layer instead.
 */
export function canModerateComment(v: Viewer, c: { readonly authorId: string }): boolean {
  if (v.isFederal) return true;
  return v.userId !== null && c.authorId === v.userId;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/blog test -- visibility`
Expected: PASS, all five cases.

- [ ] **Step 5: Commit**

```bash
npx prettier --write modules/blog/src/visibility.ts modules/blog/src/visibility.test.ts
git add modules/blog/src/visibility.ts modules/blog/src/visibility.test.ts
git commit -m "feat(blog): canModerateComment rule"
```

---

## Task 4: Event type

**Files:**

- Modify: `modules/blog/src/events.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `CommentCreated` type; `BlogEvent` union now includes it.

This event has **no subscriber today** — the author-notification email is deferred (spec §8). It is added because module convention (CLAUDE.md §3) is that modules emit typed events, and the deferred notification is the known consumer. Do not add a subscriber.

- [ ] **Step 1: Add the type**

In `modules/blog/src/events.ts`, add after `PostReported`:

```ts
export type CommentCreated = {
  readonly type: "blog.comment.created";
  readonly postId: string;
  readonly commentId: string;
  readonly authorId: string;
  readonly at: Date;
};
```

and extend the union:

```ts
export type BlogEvent = PostPublished | PostUpdated | PostDeleted | PostReported | CommentCreated;
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @bdas/blog typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npx prettier --write modules/blog/src/events.ts
git add modules/blog/src/events.ts
git commit -m "feat(blog): blog.comment.created event type"
```

---

## Task 5: Comment service

**Files:**

- Create: `modules/blog/src/services/comments.ts`
- Test: `modules/blog/src/comments.test.ts`

**Interfaces:**

- Consumes: `postComments`, `posts` from `../schema`; `Comment` from `../types`; `canViewPost`, `canModerateComment`, `Viewer` from `../visibility`; `CommentCreated` from `../events`; `createId` from `@bdas/id`; `NotFoundError`, `ForbiddenError`, `ValidationError`, `RateLimitError` from `@bdas/errors`; `getEventBus` from `@bdas/events`.
- Produces:

```ts
addComment(db: Db, postId: string, viewer: Viewer, body: string): Promise<Comment>
listComments(db: Db, postId: string): Promise<Comment[]>
deleteComment(db: Db, commentId: string, viewer: Viewer): Promise<void>
countCommentsByPost(db: Db, postIds: ReadonlyArray<string>): Promise<Map<string, number>>
deleteCommentsByAuthor(db: Db, authorId: string): Promise<number>
```

This is the largest task. Write all tests first, watch them fail, then implement once.

- [ ] **Step 1: Write the failing integration tests**

Create `modules/blog/src/comments.test.ts`:

```ts
/**
 * Comment integration tests against a real Postgres schema (spec 2026-08-08).
 * Mirrors index.test.ts: skips when DATABASE_URL is unreachable; CI brings up
 * a Postgres service.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import type { BlogEvent } from "./events";
import { plainTextToDoc } from "./content";
import { createPost, deletePost } from "./services/manage";
import {
  addComment,
  countCommentsByPost,
  deleteComment,
  deleteCommentsByAuthor,
  listComments,
} from "./services/comments";
import { ANON, type Viewer } from "./visibility";

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

const author: Viewer = { userId: "usr_a", isMember: true, isFederal: false };
const member: Viewer = { userId: "usr_m", isMember: true, isFederal: false };
const federal: Viewer = { userId: "usr_f", isMember: true, isFederal: true };

describeIfDb("blog comments", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      "0001_init.sql",
      "0002_categories_reports_softdelete.sql",
      "0003_comments.sql",
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** A public post authored by usr_a. */
  async function aPost(visibility: "public" | "members" | "board" = "public") {
    return createPost(
      t.db,
      { title: "Nowruz-Fest", content: plainTextToDoc("Wir feiern."), visibility },
      "usr_a",
    );
  }

  it("addComment stores the comment and returns it", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "  Schöner Beitrag.  ");

    expect(c.id).toMatch(/^cmnt_/);
    expect(c.postId).toBe(p.id);
    expect(c.authorId).toBe("usr_m");
    expect(c.body).toBe("Schöner Beitrag.");
    expect(c.createdAt).toBeInstanceOf(Date);
  });

  it("addComment emits blog.comment.created once", async () => {
    const seen: BlogEvent[] = [];
    getEventBus().subscribe<BlogEvent>("blog.comment.created", (e) => {
      seen.push(e);
    });

    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "Danke!");

    expect(seen).toMatchObject([
      { type: "blog.comment.created", postId: p.id, commentId: c.id, authorId: "usr_m" },
    ]);
  });

  it("addComment rejects an anonymous viewer with FORBIDDEN", async () => {
    const p = await aPost();
    await expect(addComment(t.db, p.id, ANON, "Hallo")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("addComment rejects an empty or whitespace-only body with VALIDATION", async () => {
    const p = await aPost();
    await expect(addComment(t.db, p.id, member, "   ")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("addComment rejects a body over 1000 characters with VALIDATION", async () => {
    const p = await aPost();
    await expect(addComment(t.db, p.id, member, "x".repeat(1001))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("addComment accepts a body of exactly 1000 characters", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "x".repeat(1000));
    expect(c.body).toHaveLength(1000);
  });

  it("addComment 404s on a missing post", async () => {
    await expect(addComment(t.db, "post_nope", member, "Hallo")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("addComment 404s on a soft-deleted post", async () => {
    const p = await aPost();
    await deletePost(t.db, p.id);
    await expect(addComment(t.db, p.id, member, "Hallo")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("addComment 404s a board-only post for a plain member, without revealing it", async () => {
    const p = await aPost("board");
    await expect(addComment(t.db, p.id, member, "Hallo")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("addComment allows the federal board on a board-only post", async () => {
    const p = await aPost("board");
    const c = await addComment(t.db, p.id, federal, "Gesehen.");
    expect(c.authorId).toBe("usr_f");
  });

  it("addComment trips the rate limit at the 21st comment in the window", async () => {
    const p = await aPost();
    for (let i = 0; i < 20; i++) {
      await addComment(t.db, p.id, member, `Kommentar ${i}`);
    }
    await expect(addComment(t.db, p.id, member, "einer zu viel")).rejects.toMatchObject({
      code: "RATE_LIMIT",
    });
  });

  it("listComments returns oldest first and excludes deleted", async () => {
    const p = await aPost();
    const first = await addComment(t.db, p.id, member, "Erster");
    const second = await addComment(t.db, p.id, author, "Zweiter");
    const third = await addComment(t.db, p.id, federal, "Dritter");

    await deleteComment(t.db, second.id, author);

    const list = await listComments(t.db, p.id);
    expect(list.map((c) => c.id)).toEqual([first.id, third.id]);
  });

  it("listComments returns an empty list for a post with no comments", async () => {
    const p = await aPost();
    expect(await listComments(t.db, p.id)).toEqual([]);
  });

  it("deleteComment lets the comment author delete their own", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "Weg damit");
    await deleteComment(t.db, c.id, member);
    expect(await listComments(t.db, p.id)).toEqual([]);
  });

  it("deleteComment lets the federal board delete anyone's", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "Weg damit");
    await deleteComment(t.db, c.id, federal);
    expect(await listComments(t.db, p.id)).toEqual([]);
  });

  it("deleteComment rejects the post's author, who is not the comment's author", async () => {
    // `author` wrote the post but not the comment. ADR 0032: a post author may
    // not silence commenters on their own post. This is also the general
    // "some other member" case — usr_a has no special standing here.
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "Kritik");
    await expect(deleteComment(t.db, c.id, author)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await listComments(t.db, p.id)).toHaveLength(1);
  });

  it("deleteComment 404s an unknown or already-deleted comment", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "Weg");
    await deleteComment(t.db, c.id, member);

    await expect(deleteComment(t.db, c.id, member)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteComment(t.db, "cmnt_nope", member)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("countCommentsByPost counts per post, excluding deleted, omitting zero-comment posts", async () => {
    const p1 = await aPost();
    const p2 = await aPost();
    const p3 = await aPost();

    await addComment(t.db, p1.id, member, "eins");
    await addComment(t.db, p1.id, federal, "zwei");
    const gone = await addComment(t.db, p2.id, member, "drei");
    await deleteComment(t.db, gone.id, member);

    const counts = await countCommentsByPost(t.db, [p1.id, p2.id, p3.id]);
    expect(counts.get(p1.id)).toBe(2);
    expect(counts.get(p2.id)).toBeUndefined();
    expect(counts.get(p3.id)).toBeUndefined();
  });

  it("countCommentsByPost returns an empty map for an empty id list", async () => {
    expect(await countCommentsByPost(t.db, [])).toEqual(new Map());
  });

  it("deleteCommentsByAuthor hard-deletes every comment by that author", async () => {
    const p = await aPost();
    await addComment(t.db, p.id, member, "eins");
    await addComment(t.db, p.id, member, "zwei");
    await addComment(t.db, p.id, federal, "bleibt");

    const removed = await deleteCommentsByAuthor(t.db, "usr_m");
    expect(removed).toBe(2);

    const list = await listComments(t.db, p.id);
    expect(list.map((c) => c.authorId)).toEqual(["usr_f"]);

    // Hard delete: the rows are gone, not soft-deleted.
    const [row] = await t.client`
      select count(*)::int as n from post_comments where author_id = 'usr_m'
    `;
    expect(row?.["n"]).toBe(0);
  });

  it("deleteCommentsByAuthor also removes already soft-deleted comments", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "weg");
    await deleteComment(t.db, c.id, member);

    expect(await deleteCommentsByAuthor(t.db, "usr_m")).toBe(1);
  });

  it("deleting a post cascades its comments away", async () => {
    const p = await aPost();
    await addComment(t.db, p.id, member, "eins");

    // deletePost is a SOFT delete, so the rows survive but must not be listed.
    await deletePost(t.db, p.id);
    expect(await listComments(t.db, p.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm db:up && pnpm --filter @bdas/blog test -- comments`
Expected: FAIL — `Cannot find module './services/comments'`.

- [ ] **Step 3: Implement the service**

Create `modules/blog/src/services/comments.ts`:

```ts
/**
 * Member comments on a post (spec 2026-08-08, ADR 0032). Flat — comments never
 * reference each other — plain text, and visible only to members and alumni.
 *
 * Unlike `report.ts`, the write path takes a `Viewer` and applies `canViewPost`
 * here rather than trusting the caller: this is defence in depth for a write
 * path that will grow more callers over time. A post the viewer may not see
 * raises NotFoundError, never ForbiddenError — otherwise the error itself would
 * reveal that a "Nur Vorstände" post exists.
 */
import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { CommentCreated } from "../events";
import { postComments, posts } from "../schema";
import type { Comment, PostVisibility } from "../types";
import { canModerateComment, canViewPost, type Viewer } from "../visibility";

export type Db = PostgresJsDatabase<Record<string, never>>;

const RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_MAX_PER_WINDOW = 20;
const BODY_MAX_LENGTH = 1000;

type Row = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: Date;
};

function rowToComment(r: Row): Comment {
  return {
    id: r.id,
    postId: r.postId,
    authorId: r.authorId,
    body: r.body,
    createdAt: r.createdAt,
  };
}

async function assertNotRateLimited(db: Db, authorId: string): Promise<void> {
  const cutoff = new Date(Date.now() - RATE_WINDOW_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(postComments)
    .where(and(eq(postComments.authorId, authorId), gte(postComments.createdAt, cutoff)));
  if ((row?.n ?? 0) >= RATE_MAX_PER_WINDOW) {
    throw new RateLimitError("Zu viele Kommentare in kurzer Zeit. Bitte später erneut versuchen.");
  }
}

/**
 * Add a comment. The author is `viewer.userId` — deliberately not a separate
 * argument, so the two can never disagree.
 */
export async function addComment(
  db: Db,
  postId: string,
  viewer: Viewer,
  body: string,
): Promise<Comment> {
  const authorId = viewer.userId;
  if (authorId === null) throw new ForbiddenError("Anmeldung erforderlich.");

  const trimmed = body.trim();
  if (!trimmed) throw new ValidationError("Kommentar darf nicht leer sein.");
  if (trimmed.length > BODY_MAX_LENGTH) {
    throw new ValidationError("Kommentar darf höchstens 1000 Zeichen haben.");
  }

  const rows = await db
    .select({ visibility: posts.visibility, createdBy: posts.createdBy })
    .from(posts)
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
    .limit(1);
  const post = rows[0];
  if (!post) throw new NotFoundError("Beitrag nicht gefunden.");
  if (
    !canViewPost(viewer, {
      visibility: post.visibility as PostVisibility,
      createdBy: post.createdBy,
    })
  ) {
    throw new NotFoundError("Beitrag nicht gefunden.");
  }

  await assertNotRateLimited(db, authorId);

  const [inserted] = await db
    .insert(postComments)
    .values({ id: createId("cmnt"), postId, authorId, body: trimmed })
    .returning({
      id: postComments.id,
      postId: postComments.postId,
      authorId: postComments.authorId,
      body: postComments.body,
      createdAt: postComments.createdAt,
    });
  if (!inserted) throw new NotFoundError("Kommentar konnte nicht gespeichert werden.");

  const event: CommentCreated = {
    type: "blog.comment.created",
    postId,
    commentId: inserted.id,
    authorId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return rowToComment(inserted);
}

/**
 * Comments on a post, oldest first. Takes no `Viewer`: callers reach this only
 * after resolving the post through the visibility-gated `getPostBySlug`, and
 * soft-deleted posts are filtered here as a backstop.
 */
export async function listComments(db: Db, postId: string): Promise<Comment[]> {
  const rows = await db
    .select({
      id: postComments.id,
      postId: postComments.postId,
      authorId: postComments.authorId,
      body: postComments.body,
      createdAt: postComments.createdAt,
    })
    .from(postComments)
    .innerJoin(posts, eq(postComments.postId, posts.id))
    .where(
      and(eq(postComments.postId, postId), isNull(postComments.deletedAt), isNull(posts.deletedAt)),
    )
    .orderBy(asc(postComments.createdAt));
  return rows.map(rowToComment);
}

/** Soft-delete a comment. Its author, or the federal board. */
export async function deleteComment(db: Db, commentId: string, viewer: Viewer): Promise<void> {
  const rows = await db
    .select({ authorId: postComments.authorId })
    .from(postComments)
    .where(and(eq(postComments.id, commentId), isNull(postComments.deletedAt)))
    .limit(1);
  const comment = rows[0];
  if (!comment) throw new NotFoundError("Kommentar nicht gefunden.");
  if (!canModerateComment(viewer, comment)) {
    throw new ForbiddenError("Du darfst diesen Kommentar nicht löschen.");
  }

  await db
    .update(postComments)
    .set({ deletedAt: new Date() })
    .where(eq(postComments.id, commentId));
}

/**
 * Comment counts for a set of posts, for the feed. Posts with no comments are
 * absent from the map rather than present with 0 — callers use `?? 0`.
 */
export async function countCommentsByPost(
  db: Db,
  postIds: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();

  const rows = await db
    .select({ postId: postComments.postId, n: sql<number>`count(*)::int` })
    .from(postComments)
    .where(and(inArray(postComments.postId, [...postIds]), isNull(postComments.deletedAt)))
    .groupBy(postComments.postId);

  return new Map(rows.map((r) => [r.postId, r.n]));
}

/**
 * Erasure seam for account deletion (spec §5). A HARD delete, including
 * already soft-deleted rows: a comment body is personal data, so retaining it
 * would defeat the point. Returns the number of rows removed.
 *
 * Account deletion does not exist yet — this is the function it will call, so
 * that no other module ever touches `post_comments` directly (rule 1).
 */
export async function deleteCommentsByAuthor(db: Db, authorId: string): Promise<number> {
  const removed = await db
    .delete(postComments)
    .where(eq(postComments.authorId, authorId))
    .returning({ id: postComments.id });
  return removed.length;
}
```

**Why the `as PostVisibility` cast:** `posts.visibility` is a `text` column, so Drizzle types it as `string`; the CHECK constraint in `0001_init.sql` is what guarantees the narrower domain. `get.ts` and `manage.ts` already narrow the same way — open `manage.ts`'s `rowToPost` and match its form exactly rather than inventing a third one.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/blog test -- comments`
Expected: PASS, all 22 cases.

Do not delete or weaken a case to make it pass. If one fails, the implementation is wrong, not the test.

If the rate-limit test is slow, that is expected — it makes 21 sequential inserts.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter @bdas/blog typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write modules/blog/src/services/comments.ts modules/blog/src/comments.test.ts
git add modules/blog/src/services/comments.ts modules/blog/src/comments.test.ts
git commit -m "feat(blog): comment service with rate limit and erasure seam"
```

---

## Task 6: Public surface and module README

**Files:**

- Modify: `modules/blog/src/index.ts`
- Modify: `modules/blog/README.md`

**Interfaces:**

- Consumes: everything from Tasks 2–5.
- Produces: the `@bdas/blog` package exports the app layer will import in Tasks 7–9.

- [ ] **Step 1: Re-export the new surface**

In `modules/blog/src/index.ts`, add to the Services block:

```ts
export {
  addComment,
  listComments,
  deleteComment,
  countCommentsByPost,
  deleteCommentsByAuthor,
} from "./services/comments";
```

extend the visibility export line to include `canModerateComment`:

```ts
export {
  ANON,
  visibleLevelsFor,
  canViewPost,
  canModeratePost,
  canModerateComment,
  type Viewer,
} from "./visibility";
```

add `Comment` to the exported types block, and `CommentCreated` to the event types block.

- [ ] **Step 2: Verify the package compiles and nothing private leaked**

Run: `pnpm --filter @bdas/blog typecheck && pnpm lint`
Expected: PASS. The ESLint boundary rule fails the build if anything outside the module deep-imports an internal file.

- [ ] **Step 3: Document the surface in the module README**

Append to `modules/blog/README.md` (adjust the heading depth to match the file's existing sections):

```markdown
## Comments

Flat, plain-text discussion under a post (ADR 0032). Comments never reference
each other — there is no threading, and a posted comment cannot be edited.

- **Who may read and write:** active members and alumni. Eligibility is
  `canAuthor()` from the app layer (ADR 0030), reused rather than redefined, so
  posting and commenting rights cannot drift apart. Guests and `pending` /
  `inactive` accounts never see the comments region at all.
- **Who may delete:** the comment's own author, or the federal board
  (`canModerateComment`). Deliberately _not_ the post's author.
- **Limits:** 1–1000 characters after trimming; 20 comments per rolling 24
  hours per author.
- **Deletion:** `deleteComment` is a soft delete (`deleted_at`), excluded from
  every read path. `deleteCommentsByAuthor` is a hard delete — it exists as the
  seam a future account-deletion feature will call, so nothing outside this
  module ever touches `post_comments` (rule 1).
- **Events:** `blog.comment.created` is published on every add. It has no
  subscriber yet; the author-notification email is deferred.
```

- [ ] **Step 4: Commit**

```bash
npx prettier --write modules/blog/src/index.ts modules/blog/README.md
git add modules/blog/src/index.ts modules/blog/README.md
git commit -m "feat(blog): export comment surface; document it"
```

---

## Task 7: Server Actions

**Files:**

- Modify: `apps/web/app/blog/actions.ts`

**Interfaces:**

- Consumes: `addComment`, `deleteComment`, `getPostById`, `canModerateComment` from `@bdas/blog`; `commentsEnabled` from `../_blog/flag`; `blogViewer`, `canAuthor`, `loadBlogMe` from `../_blog/access`.
- Produces: `createCommentAction(prev: CommentFormState, fd: FormData): Promise<CommentFormState>`; `deleteCommentAction(prev: ActionState, fd: FormData): Promise<ActionState>`; `type CommentFormState`.

Neither action redirects — the post page re-renders in place via `revalidatePath`.

**No new eligibility tests are needed.** `describe("canAuthor")` at `apps/web/app/_blog/access.test.ts:60` already pins all five cases (active, alumnus, pending, inactive, signed-out). Reusing `canAuthor` rather than writing a parallel `canComment` is precisely what makes that existing suite cover commenting too. Do not add a duplicate describe block.

- [ ] **Step 1: Add the create action**

In `apps/web/app/blog/actions.ts`, extend the existing `@bdas/blog` import with `addComment`, `deleteComment`, and `canModerateComment`, add `import { commentsEnabled } from "../_blog/flag";`, then append:

```ts
export type CommentFormState = { readonly error?: string };

/**
 * Add a comment. Eligibility is ADR 0030's authoring rule reused verbatim —
 * active member or alumnus — so posting and commenting cannot drift apart.
 */
export async function createCommentAction(
  _prev: CommentFormState,
  fd: FormData,
): Promise<CommentFormState> {
  if (!commentsEnabled()) return { error: "Nicht verfügbar." };
  const me = await loadBlogMe();
  if (!me) return { error: "Anmeldung erforderlich." };
  if (!canAuthor(me)) {
    return { error: "Nur aktive Mitglieder oder Alumni dürfen kommentieren." };
  }

  const postId = s(fd, "postId");
  const body = s(fd, "body");

  // The post is loaded for its slug (to revalidate the right path); addComment
  // re-checks existence and visibility itself.
  const post = await getPostById(getDb(), postId);
  if (!post) return { error: "Beitrag nicht gefunden." };

  try {
    await addComment(getDb(), postId, blogViewer(me), body);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  revalidatePath(`/blog/${post.slug}`);
  revalidatePath("/blog");
  return {};
}
```

- [ ] **Step 2: Add the delete action**

Append:

```ts
export async function deleteCommentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!commentsEnabled()) return { error: "Nicht verfügbar." };
  const commentId = s(fd, "commentId");
  const slug = s(fd, "slug");

  try {
    const me = await loadBlogMe();
    if (!me) throw new ForbiddenError("Anmeldung erforderlich.");
    await deleteComment(getDb(), commentId, blogViewer(me));
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  revalidatePath(`/blog/${slug}`);
  revalidatePath("/blog");
  return {};
}
```

The permission check lives inside `deleteComment` (Task 5), so there is no `assertCommentModerable` helper — adding one would duplicate the rule in two places. `canModerateComment` is still imported by `CommentsSection` in Task 8 to decide whether to _render_ the button.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bdas/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/web/app/blog/actions.ts
git add apps/web/app/blog/actions.ts
git commit -m "feat(blog): comment server actions"
```

---

## Task 8: Comments UI

**Files:**

- Create: `apps/web/app/_blog/CommentForm.tsx`
- Create: `apps/web/app/_blog/DeleteCommentButton.tsx`
- Create: `apps/web/app/_blog/CommentsSection.tsx`
- Delete: `apps/web/app/_blog/CommentsPlaceholder.tsx`
- Modify: `apps/web/app/blog/[slug]/page.tsx`

**Interfaces:**

- Consumes: `createCommentAction`, `deleteCommentAction`, `CommentFormState`, `ActionState` from `../blog/actions`; `listComments`, `canModerateComment`, `type Comment` from `@bdas/blog`; `resolveAuthors`, `canAuthor`, `blogViewer` from `./access`; `AuthorAvatar` from `./AuthorAvatar`; `formatDate` from `../../lib/format`.
- Produces: `<CommentsSection post={post} me={me} />`.

Visual treatment is the "quiet thread" from the spec §6: one `Card flat` holds the section, comments separated by hairlines and whitespace — **not** nested cards.

- [ ] **Step 1: Write the composer**

Create `apps/web/app/_blog/CommentForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { createCommentAction, type CommentFormState } from "../blog/actions";

const initialState: CommentFormState = {};
const MAX = 1000;

const TEXTAREA_CLASS =
  "block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2 " +
  "text-sm text-bdas-ink focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20";

/** Plain-text composer. Comments are capped at 1000 characters (ADR 0032). */
export function CommentForm({ postId }: { postId: string }) {
  const [state, action] = useFormState(createCommentAction, initialState);
  const [length, setLength] = useState(0);

  return (
    <form action={action} className="mt-5 flex flex-col gap-2 border-t border-bdas-soft pt-5">
      <input type="hidden" name="postId" value={postId} />
      <label htmlFor="body" className="sr-only">
        Kommentar
      </label>
      <textarea
        id="body"
        name="body"
        rows={3}
        maxLength={MAX}
        required
        placeholder="Schreib einen Kommentar …"
        className={TEXTAREA_CLASS}
        onChange={(e) => setLength(e.target.value.length)}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-bdas-ink-muted">
          {length}/{MAX}
        </span>
        <SubmitButton />
      </div>
      {state.error ? <span className="text-sm text-bdas-red">{state.error}</span> : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-bdas bg-bdas-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Wird gesendet…" : "Kommentieren"}
    </button>
  );
}
```

`TEXTAREA_CLASS` is copied verbatim from `ReportPostButton.tsx:9-11` — keep it identical so the two inputs cannot drift apart visually.

- [ ] **Step 2: Write the delete control**

Create `apps/web/app/_blog/DeleteCommentButton.tsx`:

```tsx
"use client";

import { useFormState, useFormStatus } from "react-dom";

import { deleteCommentAction, type ActionState } from "../blog/actions";

const initialState: ActionState = {};

/** Author/board delete control for one comment. Confirms before firing. */
export function DeleteCommentButton({ commentId, slug }: { commentId: string; slug: string }) {
  const [state, action] = useFormState(deleteCommentAction, initialState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Diesen Kommentar wirklich löschen?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="slug" value={slug} />
      <DeleteButton />
      {state.error ? <span className="ml-2 text-bdas-red">{state.error}</span> : null}
    </form>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-bdas-ink-muted hover:text-bdas-red"
    >
      {pending ? "Wird gelöscht…" : "Löschen"}
    </button>
  );
}
```

- [ ] **Step 3: Write the section**

Create `apps/web/app/_blog/CommentsSection.tsx`:

```tsx
import { canModerateComment, listComments, type Post } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import type { CurrentMember } from "@bdas/members";

import { blogViewer, canAuthor, resolveAuthors } from "./access";
import { AuthorAvatar } from "./AuthorAvatar";
import { CommentForm } from "./CommentForm";
import { DeleteCommentButton } from "./DeleteCommentButton";
import { formatDate } from "../../lib/format";

/**
 * Member discussion under a post. Renders nothing at all for guests and
 * non-members — a post's share link must never expose the comments region
 * (blog spec 2026-07-26, requirement 5). Eligibility to read matches
 * eligibility to write: active member or alumnus (ADR 0030, reused by 0032).
 */
export async function CommentsSection({ post, me }: { post: Post; me: CurrentMember | null }) {
  if (!canAuthor(me)) return null;

  const comments = await listComments(getDb(), post.id);
  const authors = await resolveAuthors(
    comments.map((c) => c.authorId),
    true,
  );
  const viewer = blogViewer(me);

  return (
    <Card flat className="p-6">
      <h2 className="text-lg font-semibold text-bdas-ink">Kommentare</h2>
      <p className="mt-1 text-sm text-bdas-ink-muted">
        {comments.length === 0
          ? "Noch keine Kommentare."
          : `${comments.length} ${comments.length === 1 ? "Kommentar" : "Kommentare"}`}
      </p>

      {comments.length > 0 ? (
        <ul className="mt-4 flex flex-col">
          {comments.map((c) => {
            const author = authors.get(c.authorId);
            return (
              <li key={c.id} className="flex gap-3 border-b border-bdas-soft py-4 last:border-b-0">
                <AuthorAvatar
                  initials={author?.initials ?? "?"}
                  name={author?.name ?? "BDAS-Mitglied"}
                  photoUrl={author?.photoUrl ?? null}
                  size={36}
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-bdas-ink">
                      {author?.name ?? "BDAS-Mitglied"}
                    </span>
                    <span className="text-bdas-ink-muted">{formatDate(c.createdAt)}</span>
                    {canModerateComment(viewer, c) ? (
                      <DeleteCommentButton commentId={c.id} slug={post.slug} />
                    ) : null}
                  </p>
                  {/* Plain text: preserve the author's line breaks, never render HTML. */}
                  <p className="whitespace-pre-wrap break-words text-sm text-bdas-ink-body">
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <CommentForm postId={post.id} />
    </Card>
  );
}
```

The body is rendered as a text node — never `dangerouslySetInnerHTML`. That is what makes plain-text storage safe against cross-site scripting (XSS) with no sanitising step.

- [ ] **Step 4: Mount it on the post page**

In `apps/web/app/blog/[slug]/page.tsx`:

1. Replace the `CommentsPlaceholder` import with `import { CommentsSection } from "../../_blog/CommentsSection";`
2. Add `import { commentsEnabled } from "../../_blog/flag";`
3. Replace the final JSX block:

```tsx
{
  /* Comments are member-only; guests never see this region (requirement 5). */
}
{
  commentsEnabled() ? <CommentsSection post={post} me={me} /> : null;
}
```

- [ ] **Step 5: Delete the placeholder**

```bash
git rm apps/web/app/_blog/CommentsPlaceholder.tsx
grep -rn "CommentsPlaceholder" apps/ modules/ e2e/ --include="*.tsx" --include="*.ts"
```

Expected: no matches. If any remain, fix them before continuing.

- [ ] **Step 6: Typecheck, lint, and eyeball it**

Run: `pnpm --filter @bdas/web typecheck && pnpm lint`
Expected: PASS.

Then run the app (`pnpm dev` with `BDAS_FLAG_BLOG=true BDAS_FLAG_BLOG_COMMENTS=true`), sign in as an active member, open a post, and confirm: the region appears, a comment posts and shows immediately, the delete link appears only on your own comment, and the empty state reads "Noch keine Kommentare."

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/web/app/_blog/ apps/web/app/blog/\[slug\]/page.tsx
git add apps/web/app/_blog/ apps/web/app/blog/
git commit -m "feat(blog): comments section, composer, and delete control"
```

---

## Task 9: Comment count on the feed

**Files:**

- Modify: `apps/web/app/blog/page.tsx`

**Interfaces:**

- Consumes: `countCommentsByPost` from `@bdas/blog`; `commentsEnabled` from `../_blog/flag`.
- Produces: nothing downstream.

One grouped query for the whole page, not one per card.

- [ ] **Step 1: Load the counts**

In `apps/web/app/blog/page.tsx`, add `countCommentsByPost` to the `@bdas/blog` import and `import { commentsEnabled } from "../_blog/flag";`, then after the `resolveAuthors` call:

```tsx
const commentCounts = commentsEnabled()
  ? await countCommentsByPost(
      db,
      posts.map((p) => p.id),
    )
  : new Map<string, number>();
```

- [ ] **Step 2: Render it on each card**

Replace the "Beitrag öffnen" link block with:

```tsx
<div className="mt-auto flex items-center justify-between gap-3 pt-4">
  <Link href={`/blog/${p.slug}`} className="self-start text-sm text-bdas-red hover:underline">
    Beitrag öffnen
  </Link>
  {commentCounts.get(p.id) ? (
    <span className="text-sm text-bdas-ink-muted">
      {commentCounts.get(p.id)} {commentCounts.get(p.id) === 1 ? "Kommentar" : "Kommentare"}
    </span>
  ) : null}
</div>
```

A post with no comments shows nothing rather than "0 Kommentare".

- [ ] **Step 3: Typecheck and verify visually**

Run: `pnpm --filter @bdas/web typecheck`
Expected: PASS.

Then reload `/blog` and confirm the count appears on the post you commented on in Task 8, and is absent on the others.

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/web/app/blog/page.tsx
git add apps/web/app/blog/page.tsx
git commit -m "feat(blog): comment count on feed cards"
```

---

## Task 10: End-to-end tests

**Files:**

- Modify: `e2e/blog.e2e.ts`

**Interfaces:**

- Consumes: `writePost`, `registerVerifyLogin`, `activateMemberByEmail`, `uniqueEmail`, `logout` — all already in the file.
- Produces: nothing.

Read the top of `e2e/blog.e2e.ts` first: `registerVerifyLogin` creates a **pending** member, so any user who needs to comment must be activated with `activateMemberByEmail` afterwards.

- [ ] **Step 1: Write the E2E cases**

Add inside the existing `test.describe("blog", …)`:

```ts
test("a member comments on a post, sees it, and deletes it", async ({ page }) => {
  const email = uniqueEmail();
  await registerVerifyLogin(page, { email });
  await activateMemberByEmail(email);

  const slug = await writePost(page, {
    title: "Kommentierbarer Beitrag",
    body: "Bitte kommentieren.",
  });

  await page.goto(`/blog/${slug}`);
  await expect(page.getByRole("heading", { name: "Kommentare" })).toBeVisible();
  await expect(page.getByText("Noch keine Kommentare.")).toBeVisible();

  await page.getByPlaceholder("Schreib einen Kommentar …").fill("Sehr guter Beitrag!");
  await page.getByRole("button", { name: "Kommentieren" }).click();

  await expect(page.getByText("Sehr guter Beitrag!")).toBeVisible();
  await expect(page.getByText("1 Kommentar", { exact: true })).toBeVisible();

  // The feed shows the count too.
  await page.goto("/blog");
  await expect(page.getByText("1 Kommentar", { exact: true })).toBeVisible();

  // Delete it again — the author may remove their own comment. Scope the
  // locator to the comment's own <li>: the post page also carries a
  // post-level "Löschen" control, and an unscoped match is ambiguous.
  await page.goto(`/blog/${slug}`);
  const comment = page.getByRole("listitem").filter({ hasText: "Sehr guter Beitrag!" });
  page.once("dialog", (d) => void d.accept());
  await comment.getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByText("Sehr guter Beitrag!")).toHaveCount(0);
  await expect(page.getByText("Noch keine Kommentare.")).toBeVisible();
});

test("a signed-out visitor never sees the comments region", async ({ page }) => {
  const email = uniqueEmail();
  await registerVerifyLogin(page, { email });
  await activateMemberByEmail(email);

  const slug = await writePost(page, {
    title: "Öffentlicher Beitrag ohne Kommentare",
    body: "Für alle sichtbar.",
  });

  await logout(page);
  await page.goto(`/blog/${slug}`);

  await expect(
    page.getByRole("heading", { level: 1, name: "Öffentlicher Beitrag ohne Kommentare" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kommentare" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Schreib einen Kommentar …")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the blog E2E suite**

Run: `pnpm e2e -- blog`
Expected: PASS, including the pre-existing cases.

- [ ] **Step 3: Commit**

```bash
npx prettier --write e2e/blog.e2e.ts
git add e2e/blog.e2e.ts
git commit -m "test(blog): e2e for commenting and the guest gate"
```

---

## Task 11: ADR and full verification

**Files:**

- Create: `docs/decisions/0032-blog-comments.md`

**Interfaces:**

- Consumes: nothing.
- Produces: the decision record the whole feature depends on.

- [ ] **Step 1: Write the ADR**

Create `docs/decisions/0032-blog-comments.md`:

```markdown
# ADR 0032: Blog comments are flat, member-only, and plain text

**Status:** Accepted
**Date:** 2026-08-08

## Context

`docs/bdas-platform-spec.md` §3 lists "Internal social-network features (DMs,
feeds, comments)" as a v1 non-goal. That same list also excludes "a public
marketing/blog website" — yet the blog module shipped, under the design at
`docs/superpowers/specs/2026-07-22-blog-module-design.md` and ADR 0030. The
non-goal list predates the module-by-module decisions that followed it.

Comments were deferred rather than rejected when the blog shipped: the module
was built with a `CommentsPlaceholder` that already encodes the visibility rule
decided for them (external and signed-out visitors never see a comments
region, not even via a post's share link). The open question was when, and in
what shape — not whether.

## Decision

Blog posts carry comments, scoped deliberately narrowly:

- **Flat.** No threading, no replies. A comment never references another.
- **Plain text**, 1–1000 characters. No rich text, images, or attachments.
- **Members and alumni only**, for both reading and writing. Eligibility is
  ADR 0030's `canAuthor()` rule reused verbatim rather than redefined, so
  posting rights and commenting rights cannot drift apart.
- **Deletion by the comment's own author or the federal board.** A post's
  author may **not** delete comments on their own post — an author silencing
  critics on their own post, with no record, is not a power this platform
  grants.
- **No reporting flow for comments.** The post-level report queue is unchanged.
  A second moderation queue is not justified at this scale.
- Shipped behind `BDAS_FLAG_BLOG_COMMENTS`, off by default. The `blog` flag is
  already on in production, so without a sub-flag a merge would switch comments
  on federation-wide on deploy.

This supersedes the platform spec §3 non-goal for the blog module only. Other
modules gain nothing from it — this is not a general licence for social
features.

## Consequences

- Members can discuss posts in place instead of moving the conversation to
  WhatsApp. The spec's non-goal of "replacing WhatsApp as the day-to-day chat
  channel" is unaffected: this is discussion attached to a specific post, not a
  chat channel.
- Abuse is bounded the same way authoring is (ADR 0030): rate limiting (20 per
  24 hours), post-publish moderation, and no pre-restriction on who may write.
- **Author notification is deferred.** Nobody is emailed when their post is
  commented on. The known risk is that a comment on an older post goes unseen,
  which is the usual way a comment feature ends up feeling dead. The feed
  comment count is a partial mitigation. Revisit if discussion does not take.
- `deleteCommentsByAuthor` is exported as the seam a future account-deletion
  feature will call, so no other module ever touches `post_comments` directly.
  Account deletion itself **does not exist** in this platform and must be
  designed across posts, profile photos, files, and event registrations
  together — not smuggled in per-module.
```

- [ ] **Step 2: Run the full verification suite**

```bash
pnpm db:up
pnpm --filter @bdas/blog test
pnpm --filter @bdas/web test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm e2e -- blog
```

Expected: all PASS. Do not proceed while anything is red — fix it, then re-run the failing command and paste its real output into the PR description.

- [ ] **Step 3: Commit**

```bash
npx prettier --write docs/decisions/0032-blog-comments.md
git add docs/decisions/0032-blog-comments.md
git commit -m "docs(adr-0032): record blog comments decision"
```

---

## Post-merge: production rollout

**Not part of the PR — steps a human must perform.**

1. **Apply the migration by hand.** Vercel deploys do **not** run the migration runner. Apply `modules/blog/migrations/0003_comments.sql` to the production database and insert the tracking row into `_bdas_migrations` (id `blog/0003_comments.sql`). Skipping this breaks every post page with "relation post_comments does not exist".
2. **Check RLS.** Row-Level Security (RLS) posture for `post_comments` should match whatever the other blog tables use in the production project. If `posts` and `post_reports` have RLS enabled with policies, `post_comments` needs the same before go-live.
3. **Flip the flag.** Set `BDAS_FLAG_BLOG_COMMENTS=true` in Vercel production once the federation has ratified ADR 0032. Until then the feature is dark in production and fully testable in preview.

## Follow-ups — out of scope, each its own PR

1. **Author notification email** — subscriber on `blog.comment.created` in `@bdas/notifications`, one template, one `NotificationKind`. Separate PR because CLAUDE.md §4 is one module per PR.
2. **Account deletion / right to erasure** — spans posts, profile photos, files, and event registrations, not just comments. Needs its own ADR and phase; `deleteCommentsByAuthor` is the seam it will call.
