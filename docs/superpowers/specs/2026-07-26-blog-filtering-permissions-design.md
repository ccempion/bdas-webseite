# Blog Module — Filtering, Permissions & Abuse Protection — Design

**Date:** 2026-07-26
**Status:** Proposed
**Scope:** Extends the existing `modules/blog` + `apps/web/app/blog` + `apps/web/app/_blog` (see `docs/superpowers/specs/2026-07-22-blog-module-design.md`) with post categories, time-based filtering, tightened author eligibility, and abuse-protection mechanisms (rate-limiting, reporting, soft-delete). No new module, no new feature flag — everything stays behind the existing `blog` flag.

---

## 1. Context and decisions

Review of the shipped blog module raised three points: filterability, who may post and how abuse is prevented, and open design questions for the team. This spec resolves the first two and lists the third.

**Clarified during brainstorming — not a bug, but confirmed direction:**

- Authoring already is (and stays) "any signed-in member", not Bundesvorstand-only as the review note suggested — that note was a misunderstanding of the current code. The real question was whether that's *safe enough*, which this spec addresses via rate-limiting, reporting, and soft-delete.
- A genuine gap was found and is closed here: `requirePostAuthor()` currently checks only "is logged in", not member status — a `pending` (not yet confirmed by a Local Board) or `inactive` account could author a post today. This spec restricts authoring to member status `active` or `alumnus`.
- The platform spec (`docs/bdas-platform-spec.md` §4) lists "make posts in blog" as a **Local Board** right, not a general Member right. The already-approved blog design deliberately diverged from that (any member, social-feed style). That divergence was never recorded as an ADR — this spec closes that documentation gap with ADR 0030.

Decisions:

- **Categories**: a fixed 6-value enum (not free-form tags), one category per post, chosen at authoring time.
- **Time filter**: relative ranges (Alle / 7 Tage / 30 Tage / Dieses Jahr), not a date-range picker — matches the feed's social-scroll character and needs no new UI primitive.
- **Filtering is server-driven** via URL search params and `<Link>` chips, mirroring `apps/web/app/events/EventFilterBar.tsx` + `event-filter.ts` exactly (shareable URLs, no client JS, same `FilterChip` token styling).
- **Author eligibility**: `member.status` must be `active` or `alumnus`. `pending` and `inactive` cannot author.
- **Abuse protection**: rate-limiting on post creation and on reporting, a report/flag function (post-publish moderation signal to the federal board, both by email and a persisted queue), and soft-delete (marker only, no restore UI — an operator can still restore via direct DB access in an emergency, but no product surface for it).
- **No change to visibility levels, categories are not visibility-gated** — any eligible author may pick any category regardless of role (rejected the "category gated by role" alternative to keep the model simple).

## 2. Goals and non-goals

**In scope:** `category` + `deleted_at` columns on `posts`; new `post_reports` table; category + time filters on the feed; tightened `requirePostAuthor`; rate-limiting on create and report; report UI + federal-board moderation queue; one new notification subscriber; ADR 0030.

**Explicitly out of scope:**

- Admin-editable/dynamic categories (fixed enum, code-level change to extend)
- Auto-hiding posts after N reports (always a manual board decision)
- A "Papierkorb" restore UI for soft-deleted posts
- Feed pagination/excerpts (still full-body inline, unchanged from the original design's deferred list)
- Group-scoped ("local-only") visibility — still just public/members/board
- Comments — still deferred, unaffected by this spec

## 3. `modules/blog` changes

### Schema — migration `modules/blog/migrations/0002_categories_reports_softdelete.sql`

`posts` gains:

| Column       | Type            | Notes                                                                                                                                                     |
| ------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category`   | `text`          | `NOT NULL DEFAULT 'sonstiges'`, `CHECK IN ('verbandsintern','gruppenleben','veranstaltungsrueckblick','politik_positionen','karriere_weiterbildung','sonstiges')`, indexed |
| `deleted_at` | `timestamptz`   | `NULL`; partial index `WHERE deleted_at IS NULL`                                                                                                          |

`deletePost` sets `deleted_at = now()` instead of issuing a hard `DELETE`. Every existing read path (`services/list.ts`, `services/get.ts`) adds `deletedAt IS NULL` to its query. The public `Post`/`PostSummary` types are unchanged — soft-deleted rows never reach `rowToPost`.

New table `post_reports` (blog-owned, per rule 1):

| Column        | Type          | Notes                                              |
| ------------- | ------------- | --------------------------------------------------- |
| `id`          | `text` PK     | `report_…`                                          |
| `post_id`     | `text`        | `REFERENCES posts(id) ON DELETE CASCADE`             |
| `reporter_id` | `text`        | auth user id, no FK (matches `created_by` elsewhere) |
| `reason`      | `text`        | nullable, ≤300 chars, free text                      |
| `status`      | `text`        | `CHECK IN ('open','dismissed')`, default `'open'`    |
| `created_at`  | `timestamptz` | default now()                                        |

Indexes on `status` and `post_id`. Manifest needs no change — `infra/migrations/src/manifest.ts` already declares `"blog"` as a module entry; files run in lexical filename order within it.

### Types (`src/types.ts`)

- `PostCategory` union type (the 6 enum values) + `CATEGORY_LABELS: Record<PostCategory, string>` (German display labels), both re-exported from `index.ts`.

### Services

- `services/list.ts` — `listPosts(db, viewer, filters?: { category?: PostCategory; since?: Date })`. The category/time filters AND onto the existing visibility `WHERE` (visibility rules are untouched).
- `services/manage.ts`:
  - `PostInput` zod schema gains `category: z.enum([...]).default("sonstiges")`.
  - `createPost` counts the author's own `posts` rows created within the last hour (excluding nothing — all attempts count) before inserting; throws the existing `RateLimitError` (`@bdas/errors`) past **3 posts/hour**.
  - `deletePost` becomes an `UPDATE ... SET deleted_at = now()`.
- `services/get.ts` — both `getPostBySlug` and `getPostById` add `deletedAt IS NULL`; a soft-deleted post is treated as fully gone (404) for every caller, including moderation — this is deliberate per the "marker only" decision.
- New `services/report.ts`:
  - `reportPost(db, postId, reporterId, reason)` — loads the post (404 if gone/deleted), rejects `reporterId === post.createdBy` (`ValidationError`, no self-reporting), counts the reporter's own `post_reports` rows in the last 24h and throws `RateLimitError` past **10 reports/day**, inserts the report row, publishes `blog.post.reported`.
  - `listOpenReports(db)` — open reports joined to post title/slug/author, filtered to posts where `deletedAt IS NULL` (a report against an already-deleted post is moot and excluded rather than surfaced as a dead "delete" action).
  - `dismissReport(db, reportId)` — sets `status = 'dismissed'`.

Services remain authorization-agnostic — no auth/members import — consistent with the rest of the module.

### Events (`src/events.ts`)

New `PostReported = { type: "blog.post.reported"; postId: string; reporterId: string; reason: string | null; at: Date }`, added to the `BlogEvent` union.

## 4. App surface (`apps/web`)

- **`_blog/access.ts`**: `canAuthor(me: CurrentMember | null): boolean` — `me !== null && (me.member?.status === "active" || me.member?.status === "alumnus")`. Used by both `requirePostAuthor()` (page guard → `redirect`) and `createPostAction` (Server Action → `ForbiddenError` with message "Nur aktive Mitglieder oder Alumni dürfen Beiträge veröffentlichen.") — the single place this check lives, matching the module's existing convention for centralizing rights logic.
- **`_blog/filters.ts`** (new, mirrors `apps/web/app/events/event-filter.ts`) — `CATEGORY_CHIPS`, `SINCE_OPTIONS` (`alle` default / `7d` / `30d` / `jahr`), `buildHref`/`toggleHref` helpers building `?kategorie=&zeitraum=` query strings.
- **`_blog/BlogFilterBar.tsx`** (new, mirrors `EventFilterBar.tsx`) — server-rendered `<Link>` chips using the shared `FilterChip` token styling; rendered above the feed in `blog/page.tsx`. `blog/page.tsx` reads `searchParams`, resolves `since` to a `Date` cutoff, and passes both filters into `listPosts`.
- **`PostForm.tsx`** — one more `<select name="category" required>` field next to the existing `visibility` select, using `CATEGORY_LABELS` for German option text. Default `sonstiges`.
- **Report control** — on `/blog/[slug]`, a `<details>` disclosure (the canonical CLAUDE.md §7 pattern) titled "Beitrag melden", containing an optional reason textarea and a submit button wired to a new `reportPostAction` Server Action. Hidden when the viewer is the author or is signed out (`loadBlogMe() === null` or `me.user.id === post.createdBy`).
- **`/blog/meldungen`** (new page) — gated by `requireFederalBoard` (already exported from `@bdas/members`); lists `listOpenReports`, each row offering "Beitrag löschen" (delegates to the existing `deletePostAction`/`assertModerable` path) and "Meldung verwerfen" (`dismissReportAction` → `dismissReport`).
- **`blog/actions.ts`** — add `reportPostAction`, `dismissReportAction`, both flag-gated (`isFlagOn("blog")`) and error-mapped through the existing `appErr()` helper (already generic over `AppError`, so `RateLimitError`/`ValidationError`/`ForbiddenError` all surface correctly with no new plumbing).

## 5. Notifications

`modules/notifications/src/subscribers.ts` gets one more subscription:

```
getEventBus().subscribe<PostReported>("blog.post.reported", safe(async (e) => {
  const recipients = await listBoardRecipientsForGroup(db, null); // null → federal board (existing fallback path)
  for (const memberId of recipients) {
    await sendTransactional(db, "blog_post_reported", memberId, { postId: e.postId, reason: e.reason });
  }
}));
```

`listBoardRecipientsForGroup(db, null)` already resolves to the federal board (its existing no-local-board fallback) — no new `@bdas/members` export needed. One new template case, `blog_post_reported`, added to `modules/notifications/src/templates.ts` following the existing `member_application_received` pattern. This is the "email" half of the report delivery; the `post_reports` table (§3) is the persisted half, surfaced on `/blog/meldungen`.

## 6. Authorization summary (delta from the existing model)

- **Create:** signed-in member with `status ∈ {active, alumnus}` (was: any signed-in user — gap closed).
- **Read / Edit / Delete:** unchanged (`canViewPost` / `canModeratePost`).
- **Report:** any signed-in member who can view the post and isn't its author, rate-limited.
- **Dismiss report / view report queue:** federal board only (`requireFederalBoard`).

## 7. Testing

- Unit (`modules/blog`): category validation + default, rate-limit threshold and window behavior on `createPost`, soft-delete exclusion from `listPosts`/`getPostBySlug`/`getPostById`, report create/list/dismiss, self-report rejection, `listOpenReports` excluding reports on already-soft-deleted posts.
- E2E (`e2e/blog.e2e.ts`, extended): category filter narrows the feed to matching posts; a non-board member is redirected/forbidden at `/blog/meldungen`; a reported post's report appears in the federal board's queue.

## 8. ADR

`docs/decisions/0030-blog-authoring-rights.md` — records that blog posting rights are "active member or alumnus" (module-level decision, implemented in `_blog/access.ts`), explicitly diverging from `docs/bdas-platform-spec.md` §4's role table (which lists it as a Local Board right), per the 2026-07-22 blog design and confirmed again in this 2026-07-26 review.

## 9. Open questions for the federation (not decided here)

- Should the category enum become admin-editable later, or stay a fixed, code-level set?
- Should posts auto-hide after N open reports instead of always requiring manual board review?
- Is "full body inline, no pagination" in the feed still acceptable once category/time filtering increases usage, or does pagination need to be pulled forward?
- Do local groups eventually want a group-scoped ("local-only") visibility level, beyond today's public/members/board?
