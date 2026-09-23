# Konto-Löschung — PR5: Blog-Modul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `blog` its purge/export contribution to the account-deletion sweep: `deleteContentByAuthor(db, userId)` (hard-deletes every post the member authored — cascading its comments and reports from any author/reporter — plus the member's own comments and reports left on other, still-existing posts) and `exportForUser(db, userId)` (Art. 15, the member's own posts and comments). No orchestrator wiring, no cron, no UI — those are PR3/PR8 territory (already built / not yet built).

**Architecture:** `blog` owns `posts`/`post_comments`/`post_reports` (Rule 1). Unlike `files`/`notifications` (PR2/PR4), this module needs **no `MemberIdResolver`**: `posts.created_by`, `post_comments.author_id`, and `post_reports.reporter_id` are already plain auth-user ids with no FK — `deleteContentByAuthor`/`exportForUser` operate directly on the `userId` the orchestrator holds, the same identity the module's own `createPost`/`addComment`/`reportPost` already take today. Half of this PR already exists: `deleteCommentsByAuthor(db, authorId)` (hard-delete, real DELETE not soft-delete) was built and tested during the original comments feature (ADR 0033) specifically as "the erasure seam for account deletion... this is the function it will call" (`services/comments.ts`) — this PR wires it into the module's actual erasure entry point rather than rebuilding it. `post_comments.post_id` and `post_reports.post_id` are both `REFERENCES posts(id) ON DELETE CASCADE` (`migrations/0002`, `0003`), so hard-deleting a post's row already removes every comment and report on it, from any author — the DB does the fan-out; this PR does not need to enumerate and delete those rows itself.

**Scope decision — `post_reports` (confirmed with the user, see below):** the design spec's §2 decision 3 only names "Beiträge + Kommentare" for blog; it doesn't mention `post_reports`. Reports **against** the departing member's own posts are already handled for free (FK cascade when the post is deleted). The gap is reports the member filed **against other people's still-existing posts** — `reporter_id` + a free-text `reason`, both personal data, with no pre-built erasure seam (unlike comments). Confirmed with the user 2026-09-23: hard-delete these too, consistent with "hart löschen, nicht anonymisieren." This PR adds `deleteReportsByReporter(db, reporterId)` to `services/report.ts`, the same shape as the existing `deleteCommentsByAuthor`.

**Export scope:** `exportForUser` returns `{ posts: Post[], comments: Comment[] }`, reusing the module's own already-public `Post`/`Comment` types and their existing row-mappers (`rowToPost`, and `rowToComment` once exported — see Task 2) rather than inventing new export-specific types. Includes rows regardless of moderation soft-delete state (`deletedAt` set or not) — the row still exists, so it's still the member's data; only a hard delete (this PR's other function) actually removes it. No `post_reports` in the export: the spec's export list (§6) doesn't name it for blog either, and unlike posts/comments a report isn't the member's own expression so much as a moderation signal about someone else's content — flagging this as a deliberate scope line, not a silent omission, same as PR4's files-export scope note.

**No events, no MemberIdResolver, no bootstrap wiring:** matches design spec §2 decision 1 (orchestrator calls modules directly, not via events) and this module's existing precedent — nothing subscribes to `blog.post.deleted` today, and `deleteCommentsByAuthor` (already built) never published one either. This is also why PR5 has no "Task 4: wire boot" step the way PR4's files module did — there is no resolver to wire.

**Tech Stack:** TypeScript, Drizzle ORM (raw SQL migrations are authoritative; `schema.ts` mirrors them — no new migration in this PR, the FK cascades already exist), Vitest + real Postgres (Docker) for integration tests, `@bdas/errors`, `@bdas/events` (unused by the new code, but present in sibling files), `@bdas/id`.

**Spec:** `docs/superpowers/specs/2026-09-22-account-deletion-design.md` — this plan implements the `blog`-owned half of §5 step 2 (`blog.deleteContentByAuthor`) and the `blog` slice of §6 (`exportForUser`), extended per the confirmed `post_reports` scope decision above.

## Global Constraints

- Rule 1 (CLAUDE.md §1): `modules/blog/src/**` never imports `@bdas/members` or `@bdas/auth` — it already doesn't (see `services/manage.ts`'s own header comment: "This keeps `blog` free of an `auth`/`members` dependency"), and this PR must not change that. `userId` arrives as a plain parameter from the caller, exactly like `createPost`/`addComment`/`reportPost` already do.
- Rule 5: integration tests run against real Postgres (Docker), never mocked. Use `describeIfDb`, matching every other test file in this module. No fake/mock storage or resolver is needed here (unlike PR4) — there is nothing to fake.
- Rule 8: only symbols re-exported from `modules/blog/src/index.ts` are public.
- Test-file placement follows this module's existing (not `files`'/`notifications`') convention: test files sit flat in `modules/blog/src/` (e.g. `comments.test.ts` tests `services/comments.ts`), not alongside their service file in `services/`. This PR's new test file is `modules/blog/src/gdpr.test.ts`, testing `services/gdpr.ts`. `deleteReportsByReporter`'s test goes in the existing `index.test.ts`, matching where `report.ts`'s other functions (`reportPost`, `listOpenReports`, `dismissReport`) are already tested — not a new file.
- `deleteContentByAuthor` and `exportForUser` are idempotent / safe on an unresolvable-or-already-gone user: unlike `files`/`notifications`, there's no resolver step that can fail to resolve (blog operates on the raw `userId` directly), so idempotency here just means "a second call finds nothing left to delete and does nothing" — no special no-op branch needs writing, it falls out of `DELETE ... WHERE` matching zero rows.
- Per user memory: run `pnpm format` before every commit.
- This PR does not touch the orchestrator, the cron sweep, or any route (PR8, not yet built). `deleteContentByAuthor`/`exportForUser` are built and exported but not called from anywhere yet — same "foundation only" shape PR4 used for `files`.
- `/security-review` runs on this PR before it's considered done, per explicit user instruction — this PR hard-deletes data and, as a necessary consequence of deleting a member's own post, removes other members' comments/reports on that post too. The review must specifically verify the blast radius is exactly "posts this user authored" — never a post authored by someone else.

---

### Task 1: `deleteReportsByReporter`

**Files:**

- Modify: `modules/blog/src/services/report.ts`
- Test: `modules/blog/src/index.test.ts` (report.ts's other functions are already tested there, not in a separate file)

**Interfaces:**

- Consumes: `postReports` from `../schema`; `eq` from `drizzle-orm` (already imported in this file).
- Produces: `deleteReportsByReporter(db: Db, reporterId: string): Promise<number>` — count of rows removed, matching `deleteCommentsByAuthor`'s return shape exactly.

- [ ] **Step 1: Write the failing test**

Add to `modules/blog/src/index.test.ts`, inside `describeIfDb("blog integration", ...)`, after the `"countOpenReports zählt..."` test (the last one in the file):

```ts
  it("deleteReportsByReporter hard-deletes every report filed by that reporter", async () => {
    const p1 = await createPost(t.db, { title: "Ziel 1", content: doc("x") }, "usr_author");
    const p2 = await createPost(t.db, { title: "Ziel 2", content: doc("x") }, "usr_author");
    await reportPost(t.db, p1.id, "usr_reporter", "Grund A");
    await reportPost(t.db, p2.id, "usr_reporter", "Grund B");
    await reportPost(t.db, p1.id, "usr_other", "Grund C");

    const removed = await deleteReportsByReporter(t.db, "usr_reporter");
    expect(removed).toBe(2);

    const remaining = await listOpenReports(t.db);
    expect(remaining.map((r) => r.reporterId)).toEqual(["usr_other"]);
  });

  it("deleteReportsByReporter also removes already-dismissed reports", async () => {
    const p = await createPost(t.db, { title: "Ziel", content: doc("x") }, "usr_author");
    await reportPost(t.db, p.id, "usr_reporter", "Grund");
    const [report] = await listOpenReports(t.db);
    await dismissReport(t.db, report!.id);

    expect(await deleteReportsByReporter(t.db, "usr_reporter")).toBe(1);

    const [row] = await t.client`select count(*)::int as n from post_reports where reporter_id = 'usr_reporter'`;
    expect(row?.["n"]).toBe(0);
  });

  it("deleteReportsByReporter is a no-op for a reporter with nothing filed", async () => {
    expect(await deleteReportsByReporter(t.db, "usr_nobody")).toBe(0);
  });
```

Add `deleteReportsByReporter` to the existing import line:

```ts
import { countOpenReports, deleteReportsByReporter, dismissReport, listOpenReports, reportPost } from "./services/report";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/blog test index`
Expected: FAIL — `deleteReportsByReporter` is not exported from `./services/report`.

- [ ] **Step 3: Implement `deleteReportsByReporter`**

Add to `modules/blog/src/services/report.ts`, after `dismissReport`:

```ts
/**
 * Erasure seam for account deletion (spec §5, blog scope extended to
 * reports 2026-09-23). A HARD delete, including already-dismissed reports:
 * a report's `reason` is personal data the reporter wrote, so retaining it
 * would defeat the point. Only removes reports THIS user filed — reports
 * against their own posts already cascade away when `deleteContentByAuthor`
 * removes the post itself (`post_reports.post_id` is `ON DELETE CASCADE`).
 * Returns the number of rows removed.
 */
export async function deleteReportsByReporter(db: Db, reporterId: string): Promise<number> {
  const removed = await db
    .delete(postReports)
    .where(eq(postReports.reporterId, reporterId))
    .returning({ id: postReports.id });
  return removed.length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/blog test index`
Expected: PASS. If the DB is unreachable, start it first: `pnpm db:up`.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @bdas/blog typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add modules/blog/src/services/report.ts modules/blog/src/index.test.ts
git commit -m "feat(blog): add deleteReportsByReporter (DSGVO Art. 17 purge step)

Hard-deletes reports the user filed against other members' still-existing
posts. Reports against the user's own posts already cascade away via
post_reports.post_id ON DELETE CASCADE when deleteContentByAuthor (next
commit) removes the post itself. Confirmed scope: the design spec's blog
decision only named posts+comments; reports were an open gap, resolved
2026-09-23 to hard-delete, consistent with the DSB's 'hart löschen, nicht
anonymisieren' stance for this module.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `exportForUser` + `deleteContentByAuthor`

**Files:**

- Modify: `modules/blog/src/services/comments.ts` (export the existing private `rowToComment`)
- Create: `modules/blog/src/services/gdpr.ts`
- Create: `modules/blog/src/gdpr.test.ts`

**Interfaces:**

- Consumes: `posts`, `postComments` from `../schema`; `Post`, `Comment` from `../types`; `rowToPost` from `./manage` (already exported); `rowToComment` (newly exported this task), `deleteCommentsByAuthor` from `./comments`; `deleteReportsByReporter` from `./report` (Task 1).
- Produces:
  - `type BlogExport = { readonly posts: readonly Post[]; readonly comments: readonly Comment[] }`
  - `exportForUser(db: Db, userId: string): Promise<BlogExport>`
  - `deleteContentByAuthor(db: Db, userId: string): Promise<void>`

This is one TDD cycle covering both functions together — they share the same file, the same "no resolver needed" rationale, and `deleteContentByAuthor`'s own tests need to seed exactly the same cross-author fixtures `exportForUser`'s tests do.

- [ ] **Step 1: Export `rowToComment`**

In `modules/blog/src/services/comments.ts`, change:

```ts
function rowToComment(r: Row): Comment {
```

to:

```ts
export function rowToComment(r: Row): Comment {
```

(`Row` and `Comment` are already imported/defined in that file — no other change needed here.)

- [ ] **Step 2: Write the failing test file**

Create `modules/blog/src/gdpr.test.ts`:

```ts
/**
 * Integration tests for this module's GDPR functions (exportForUser,
 * deleteContentByAuthor) against a real Postgres schema. Skips when
 * DATABASE_URL is unreachable, matching every other test file in this
 * module. No cross-module migrations needed — posts/comments/reports key by
 * plain user ids, no FK (matches index.test.ts's own note).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";

import { plainTextToDoc } from "./content";
import { addComment, deleteComment } from "./services/comments";
import { deleteContentByAuthor, exportForUser } from "./services/gdpr";
import { createPost, deletePost } from "./services/manage";
import { dismissReport, listOpenReports, reportPost } from "./services/report";
import { type Viewer } from "./visibility";

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

const doc = (text: string) => plainTextToDoc(text);
const other: Viewer = { userId: "usr_other", isMember: true, isFederal: false };
const departing: Viewer = { userId: "usr_departing", isMember: true, isFederal: false };

describeIfDb("blog GDPR functions", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of ["0001_init.sql", "0002_categories_reports_softdelete.sql", "0003_comments.sql"]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
  });

  afterEach(async () => {
    await t.cleanup();
  });

  describe("exportForUser", () => {
    it("returns every post and comment authored by the user, regardless of moderation soft-delete", async () => {
      const p1 = await createPost(t.db, { title: "Erster", content: doc("a") }, "usr_departing");
      const p2 = await createPost(t.db, { title: "Zweiter", content: doc("b") }, "usr_departing");
      await deletePost(t.db, p2.id); // moderation soft-delete — still their data
      const otherPost = await createPost(t.db, { title: "Fremd", content: doc("c") }, "usr_other");
      const c1 = await addComment(t.db, otherPost.id, departing, "eigener Kommentar");
      await addComment(t.db, otherPost.id, other, "fremder Kommentar");

      const result = await exportForUser(t.db, "usr_departing");

      expect(result.posts.map((p) => p.id).sort()).toEqual([p1.id, p2.id].sort());
      expect(result.comments.map((c) => c.id)).toEqual([c1.id]);
    });

    it("returns empty arrays for a user with no posts or comments", async () => {
      const result = await exportForUser(t.db, "usr_nobody");
      expect(result).toEqual({ posts: [], comments: [] });
    });
  });

  describe("deleteContentByAuthor", () => {
    it("hard-deletes every post the user authored", async () => {
      const p = await createPost(t.db, { title: "Weg", content: doc("x") }, "usr_departing");

      await deleteContentByAuthor(t.db, "usr_departing");

      const [row] = await t.client`select count(*)::int as n from posts where id = ${p.id}`;
      expect(row?.["n"]).toBe(0);
    });

    it("cascades away comments and reports from ANY author on the user's own deleted post", async () => {
      const p = await createPost(t.db, { title: "Wird gelöscht", content: doc("x") }, "usr_departing");
      await addComment(t.db, p.id, other, "fremder Kommentar auf meinem Post");
      await reportPost(t.db, p.id, "usr_flagger", "Meldung auf meinem Post");

      await deleteContentByAuthor(t.db, "usr_departing");

      const [commentRow] = await t.client`select count(*)::int as n from post_comments where post_id = ${p.id}`;
      expect(commentRow?.["n"]).toBe(0);
      const [reportRow] = await t.client`select count(*)::int as n from post_reports where post_id = ${p.id}`;
      expect(reportRow?.["n"]).toBe(0);
    });

    it("removes the user's own comments and reports on OTHER, still-existing posts", async () => {
      const otherPost = await createPost(t.db, { title: "Fremd", content: doc("x") }, "usr_other");
      await addComment(t.db, otherPost.id, departing, "mein Kommentar");
      await reportPost(t.db, otherPost.id, "usr_departing", "meine Meldung");

      await deleteContentByAuthor(t.db, "usr_departing");

      const [commentRow] = await t.client`select count(*)::int as n from post_comments where author_id = 'usr_departing'`;
      expect(commentRow?.["n"]).toBe(0);
      const [reportRow] = await t.client`select count(*)::int as n from post_reports where reporter_id = 'usr_departing'`;
      expect(reportRow?.["n"]).toBe(0);
      // the post itself, authored by someone else, must survive
      const [postRow] = await t.client`select count(*)::int as n from posts where id = ${otherPost.id}`;
      expect(postRow?.["n"]).toBe(1);
    });

    it("never touches a post, comment, or report belonging to someone else", async () => {
      const otherPost = await createPost(t.db, { title: "Bleibt", content: doc("x") }, "usr_other");
      const otherComment = await addComment(t.db, otherPost.id, other, "bleibt auch");
      await reportPost(t.db, otherPost.id, "usr_flagger", "bleibt ebenfalls");

      await deleteContentByAuthor(t.db, "usr_departing"); // usr_departing has nothing at all here

      const [postRow] = await t.client`select count(*)::int as n from posts where id = ${otherPost.id}`;
      expect(postRow?.["n"]).toBe(1);
      const [commentRow] = await t.client`select count(*)::int as n from post_comments where id = ${otherComment.id}`;
      expect(commentRow?.["n"]).toBe(1);
      const [reportRow] = await t.client`select count(*)::int as n from post_reports where reporter_id = 'usr_flagger'`;
      expect(reportRow?.["n"]).toBe(1);
    });

    it("also removes already soft-deleted posts and dismissed reports the user owns", async () => {
      const p = await createPost(t.db, { title: "Schon weg", content: doc("x") }, "usr_departing");
      await deletePost(t.db, p.id); // moderation soft-delete first
      const otherPost = await createPost(t.db, { title: "Fremd", content: doc("x") }, "usr_other");
      await reportPost(t.db, otherPost.id, "usr_departing", "wird verworfen");
      const [report] = await listOpenReports(t.db);
      await dismissReport(t.db, report!.id);

      await deleteContentByAuthor(t.db, "usr_departing");

      const [postRow] = await t.client`select count(*)::int as n from posts where id = ${p.id}`;
      expect(postRow?.["n"]).toBe(0);
      const [reportRow] = await t.client`select count(*)::int as n from post_reports where reporter_id = 'usr_departing'`;
      expect(reportRow?.["n"]).toBe(0);
    });

    it("is idempotent: a second call after everything is gone is a clean no-op", async () => {
      const p = await createPost(t.db, { title: "Weg", content: doc("x") }, "usr_departing");
      await addComment(t.db, p.id, departing, "eigener Kommentar auf eigenem Post");

      await deleteContentByAuthor(t.db, "usr_departing");
      await expect(deleteContentByAuthor(t.db, "usr_departing")).resolves.toBeUndefined();
    });

    it("is a no-op for a user with no posts, comments, or reports", async () => {
      await expect(deleteContentByAuthor(t.db, "usr_nobody")).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @bdas/blog test gdpr`
Expected: FAIL — `./services/gdpr` does not exist.

- [ ] **Step 4: Write `gdpr.ts`**

Create `modules/blog/src/services/gdpr.ts`:

```ts
/**
 * This module's GDPR self-service contributions (Art. 15 export, Art. 17
 * purge) for the account-deletion feature. `posts.created_by`,
 * `post_comments.author_id`, and `post_reports.reporter_id` are already
 * plain auth-user ids with no FK (see schema.ts) — unlike `files`/
 * `notifications`, this module needs no MemberIdResolver: it operates
 * directly on the identity the orchestrator holds, the same one
 * createPost/addComment/reportPost already take today.
 *
 * Own posts are hard-deleted (not soft-deleted like the moderation path in
 * manage.ts) — post_comments.post_id and post_reports.post_id are both
 * ON DELETE CASCADE, so removing the post row already removes every comment
 * and report on it, from any author, per design spec §2 decision 3 ("eigene
 * Beiträge samt deren Kommentaren, die kaskadieren"). The user's own
 * comments and reports left on OTHER, still-existing posts are removed
 * separately, via this module's existing erasure seams.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { postComments, posts } from "../schema";
import type { Comment, Post } from "../types";
import { deleteCommentsByAuthor, rowToComment } from "./comments";
import { rowToPost } from "./manage";
import { deleteReportsByReporter } from "./report";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type BlogExport = {
  readonly posts: readonly Post[];
  readonly comments: readonly Comment[];
};

/**
 * Art. 15 — this module's slice of a user's full data export: every post
 * they authored and every comment they wrote, regardless of moderation
 * soft-delete state (the row still exists, so it is still their data — a
 * hard delete, not this function, is what actually removes it).
 */
export async function exportForUser(db: Db, userId: string): Promise<BlogExport> {
  const postRows = await db.select().from(posts).where(eq(posts.createdBy, userId));
  const commentRows = await db
    .select()
    .from(postComments)
    .where(eq(postComments.authorId, userId));
  return {
    posts: postRows.map(rowToPost),
    comments: commentRows.map(rowToComment),
  };
}

/**
 * Art. 17 purge step, run by the account-deletion orchestrator (a later
 * PR). Hard-deletes every post this user authored — cascading its comments
 * and reports, from any author/reporter — then removes this user's own
 * comments and reports left on other, still-existing posts. No event is
 * published: this module's deletion sweep is a direct orchestrator call,
 * not an event-reactive side effect (design spec §2 decision 1), and
 * nothing subscribes to blog.post.deleted today.
 */
export async function deleteContentByAuthor(db: Db, userId: string): Promise<void> {
  await db.delete(posts).where(eq(posts.createdBy, userId));
  await deleteCommentsByAuthor(db, userId);
  await deleteReportsByReporter(db, userId);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @bdas/blog test gdpr`
Expected: PASS (all cases). If the DB is unreachable: `pnpm db:up`.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm --filter @bdas/blog typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add modules/blog/src/services/comments.ts modules/blog/src/services/gdpr.ts modules/blog/src/gdpr.test.ts
git commit -m "feat(blog): add exportForUser/deleteContentByAuthor (DSGVO Art. 15/17)

deleteContentByAuthor hard-deletes every post the user authored (cascading
its comments and reports from any author, per the FK) then removes the
user's own comments/reports left on other, still-existing posts via the
module's existing erasure seams (deleteCommentsByAuthor,
deleteReportsByReporter). exportForUser returns the user's own posts and
comments, reusing the module's existing Post/Comment types and row-mappers.
No MemberIdResolver needed — this module already keys everything by the
plain auth user id.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Public exports + full verification

**Files:**

- Modify: `modules/blog/src/index.ts`

**Interfaces:**

- Produces: `deleteContentByAuthor`, `exportForUser`, `type BlogExport`, `deleteReportsByReporter` — all now part of `@bdas/blog`'s public surface (Rule 8).

- [ ] **Step 1: Add the service exports**

In `modules/blog/src/index.ts`, change the comments export line:

```ts
export {
  addComment,
  listComments,
  deleteComment,
  countCommentsByPost,
  deleteCommentsByAuthor,
} from "./services/comments";
```

to add nothing here (unchanged) — instead add two new lines right after it:

```ts
export { deleteContentByAuthor, exportForUser, type BlogExport } from "./services/gdpr";
```

And change the report export line:

```ts
export { reportPost, listOpenReports, countOpenReports, dismissReport } from "./services/report";
```

to:

```ts
export {
  reportPost,
  listOpenReports,
  countOpenReports,
  dismissReport,
  deleteReportsByReporter,
} from "./services/report";
```

- [ ] **Step 2: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: no errors (confirms nothing outside `blog` broke and the new exports resolve).

- [ ] **Step 3: Run the full test suite**

Run: `pnpm db:up && pnpm test`
Expected: all suites pass, including the new `gdpr.test.ts` and the extended `index.test.ts`.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add modules/blog/src/index.ts
git commit -m "feat(blog): export account-deletion purge/export surface

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Self-Review

- **Spec coverage:** implements the `blog`-owned half of design spec §5 step 2 (`deleteContentByAuthor`, including the confirmed `post_reports` scope extension) and the `blog` slice of §6 (`exportForUser`). Orchestrator wiring, cron, and any UI are out of scope by design (PR8 not yet built, PR3 already built and unrelated). ✓
- **Placeholder scan:** none — every step has full code, no TBD/TODO. ✓
- **Type consistency:** `BlogExport` (Task 2) matches between `gdpr.ts` and its re-export in `index.ts` (Task 3). `deleteContentByAuthor`/`exportForUser`/`deleteReportsByReporter` signatures match across their defining file, test imports, and `index.ts`. `rowToComment`'s newly-exported signature (`Row => Comment`) is used identically in `gdpr.ts` and matches its existing internal usage in `comments.ts`. No name collisions with existing exports. ✓
- **Rule 1 boundary:** confirmed no file in `modules/blog/src/**` imports `@bdas/members`/`@bdas/auth` — this PR adds none. ✓
- **Blast-radius safety (the property the user specifically asked to verify):** `deleteContentByAuthor`'s test suite includes a dedicated case ("never touches a post, comment, or report belonging to someone else") plus a case verifying that deleting the user's own post correctly cascades ALL comments/reports on it (including from other authors — this is intended, approved behavior per design spec decision 3, not a bug) while a case with the same shape on a post NOT authored by the departing user leaves everything on that post fully intact. The distinction the review must verify is exactly "own post → full cascade is correct" vs. "someone else's post → nothing touched, ever." ✓
- **Scope:** no orchestrator, no cron route, no other module touched, no MemberIdResolver/bootstrap wiring built (none needed) — matches "PR5: Blog" in the confirmed PR sequence (PR1 auth, PR2 notifications, PR3 deletion UI, PR4 files, **PR5 blog**, PR6 events, PR7 export completion, PR8 orchestrator/cron). ✓

Plan complete and saved to `docs/superpowers/plans/2026-09-23-account-deletion-pr5-blog.md`.

Per your instruction: **Subagent-Driven** execution (superpowers:subagent-driven-development) with **`/security-review`** run on the branch before it's considered done, given this PR hard-deletes data and, as an intended consequence of deleting a member's own post, removes other members' comments/reports on it too.

Ready to start Task 1?
