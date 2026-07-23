# Blog Module — Member-Authored Posts — Design

**Date:** 2026-07-22
**Status:** Approved (built on `feat/blog-module`; de-staled onto current main)
**Scope:** New `modules/blog` (posts table, services, migration, flag, events) + the public blog surface in `apps/web` (feed, single post, author editor). Tiptap unified on v3 across the app — see ADR 0027.

---

## 1. Context and decisions

The federation wants a lightweight blog where members share news, reports and
thoughts — closer to a social feed than a CMS. Any signed-in member may author
a post; the board moderates. Posts have an audience (public / members / board).

Decisions:

- **Any signed-in member may author.** Authoring needs a login only, no member
  profile and no board role. Editing and deleting are restricted to the author
  or the federal board (moderation).
- **Three visibility levels**, enforced **server-side** on every read path
  (feed SQL filter + single-post fetch + app-layer guards), never in the UI
  alone: `public` (everyone incl. signed-out), `members` (active members),
  `board` ("Nur Vorstände", federal board only). The author always sees their
  own post regardless of level.
- **Rich bodies via Tiptap**, stored as ProseMirror JSON and rendered to
  **sanitised** HTML server-side so the editor never ships to visitors. Posts
  are authored by ordinary members, so sanitisation is a real XSS boundary.
- **Save = live.** No drafts/versions. Slug is derived from the title with a
  short random suffix and is **immutable** after publish (stable share URLs).
- **Comments deliberately deferred** — a placeholder region, member-gated, no
  storage. Built when the federation asks.
- **Tiptap on v3.** Adding a new Tiptap consumer collapses the app onto
  `@tiptap/core@3` (Puck's major); accepted with nominal casts — **ADR 0027**.

## 2. Goals and non-goals

**In scope:** `blog` module (posts table, services, migration, flag, typed
events) · server-side sanitised render of Tiptap JSON · public feed + single
post pages · author editor (create/edit/delete) with visibility select ·
central visibility + moderation rules reused by every read path · image upload
to a public `blog-media` bucket via `core/storage` · §23 E2E acceptance test ·
ADR 0027 (Tiptap v3).

**Explicitly out of scope:**

- Comments (placeholder only), reactions, tags/categories, search
- Drafts, version history, scheduled publishing, concurrent-edit protection
- Editing another member's post by anyone below federal board
- A raw-HTML / arbitrary-embed block (structural XSS exclusion — see §6)
- Per-group blogs or group-scoped visibility (only public/members/board)

## 3. `blog` module

New module `modules/blog`, owning one table.

### `posts`

| Column       | Type          | Notes                                                   |
| ------------ | ------------- | ------------------------------------------------------- |
| `id`         | `text` PK     | `post_…` (`@bdas/id`)                                   |
| `slug`       | `text` UNIQUE | readable base + 6-char random suffix; immutable         |
| `title`      | `text`        | 3–160 chars                                             |
| `content`    | `jsonb`       | Tiptap/ProseMirror doc                                  |
| `visibility` | `text`        | `CHECK IN ('public','members','board')`, default public |
| `created_by` | `text`        | auth user id, **no FK** (matches events)                |
| `created_at` | `timestamptz` | default now(); feed order                               |
| `updated_at` | `timestamptz` | default now()                                           |

Indexes on `created_at` (feed), `visibility`, `created_by`. Migration
`modules/blog/migrations/0001_init.sql`, declared in the manifest **after
members** (`created_by` is a plain auth-user id, no cross-module FK).

### Public surface (`index.ts`)

- **Services** — `createPost`, `updatePost`, `deletePost`, `listPosts`,
  `getPostBySlug`, `getPostById`, `rowToPost`, `PostInput` (zod).
- **Rendering** — `renderPostContentHtml` (Tiptap JSON → sanitised HTML),
  `plainTextToDoc`.
- **Visibility rules** — `ANON`, `Viewer`, `visibleLevelsFor`, `canViewPost`,
  `canModeratePost` (pure functions, no auth/db imports).
- **Slug** — `slugifyTitle`.
- **Types / events** — `Post`, `PostSummary`, `PostVisibility`, `TiptapDoc`;
  `PostPublished`, `PostUpdated`, `PostDeleted` (via `core/events`).

Services are **authorization-agnostic** (CLAUDE.md §1 rule 2) — the app layer
authorizes, keeping `blog` free of an `auth`/`members` dependency, same as
`events` / `projects`.

## 4. App surface (`apps/web`)

- `/blog` — feed (visibility-filtered, newest first, full body inline).
- `/blog/[slug]` — single post; sanitised HTML; author byline; moderation
  controls when `canModerate`; member-gated comments placeholder.
- `/blog/neu` — new-post editor (any signed-in member).
- `/blog/[slug]/bearbeiten` — edit (author/federal only).
- `apps/web/app/_blog/access.ts` — central identity → `Viewer` mapping and
  author-display resolution (the one place role/rights logic lives).
- `apps/web/app/api/blog/upload-url` — signed image upload to `blog-media`.

All routes and Server Actions are gated by `requireBlogFlag()` /
`isFlagOn("blog")`.

## 5. Authorization model

- **Create:** signed-in member (`loadBlogMe()` non-null).
- **Read:** `canViewPost(viewer, post)` — public everyone, members active
  member, board federal board; author sees own. The feed applies the same rule
  as a SQL `visibility IN (…) OR created_by = me`.
- **Edit / delete:** `canModeratePost(viewer, post)` — author or federal board,
  asserted at the action layer (`assertModerable`) **and** re-checked on the
  edit page.

## 6. Security — XSS boundary

`renderPostContentHtml` runs `generateHTML` over an allow-listed extension set,
then `sanitize-html` with an explicit tag/attribute allow-list, HTTPS-only
image and iframe schemes, a **YouTube-only iframe host allow-list**, and an
`exclusiveFilter` dropping any iframe whose `src` is not a YouTube embed URL.
No raw-HTML block exists in the editor (structural exclusion). Covered by
`content.test.ts`.

## 7. Testing

- Unit: `slug`, `visibility`, `content` (sanitisation), `index` (DB-backed
  service integration) — 32 tests.
- §23 E2E (`e2e/blog.e2e.ts`): a member authors a public post → feed + single
  page render it; a members-only post is hidden from anonymous visitors (feed
  absence + no content on the share link); the author sees moderation controls
  and can edit, a different member cannot. Requires `BDAS_FLAG_BLOG=true`
  (added to the CI e2e job and `playwright.config` webServer env).

## 8. Go-live (owner steps)

1. Apply `modules/blog/migrations/0001_init.sql` to prod (migrations are not
   auto-applied on deploy) and record it in `_bdas_migrations`.
2. Provision the public `blog-media` Supabase bucket (type/size enforced),
   analogous to `event-media` / `content-media`.
3. Flip `BDAS_FLAG_BLOG=true`.
