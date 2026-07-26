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
- **Best-effort, not a hard guarantee** — both limiters do a `SELECT count(*)`
  followed by a separate `INSERT`, with no transaction or lock tying them
  together. A concurrent burst from the same author/reporter can each read a
  stale count and all succeed, slipping past the limit. This is spam
  friction, not a security boundary — don't rely on it to bound abuse under
  concurrent load.
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
