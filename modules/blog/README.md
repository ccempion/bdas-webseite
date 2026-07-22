# @bdas/blog

Member-authored blog posts with a fast, social-feed-style posting flow and
per-post visibility.

## Public surface (`src/index.ts`)

- **Services** — `createPost`, `updatePost`, `deletePost`, `listPosts`,
  `getPostBySlug`, `getPostById`, plus `PostInput` (zod) and `rowToPost`.
- **Rendering** — `renderPostContentHtml(doc)` turns a post's Tiptap JSON into
  sanitized HTML (server-side; the editor never ships to visitors). `plainTextToDoc`.
- **Visibility rules (central, reusable)** — `Viewer`, `ANON`,
  `visibleLevelsFor`, `canViewPost`, `canModeratePost`.
- **Slug** — `slugifyTitle`.
- **Types / events** — `Post`, `PostSummary`, `PostVisibility`, `TiptapDoc`,
  `BlogEvent` and its members.

## Owned tables

- `posts` — id, unique `slug`, `title`, `content` (Tiptap JSON, `jsonb`),
  `visibility`, `created_by` (auth user id, no FK — matches events), timestamps.
  Migration: [`migrations/0001_init.sql`](migrations/0001_init.sql).

No other module reads or writes `posts` (rule 1).

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

## Rights

- **Create** — any signed-in (registered) user. Gated at the app layer
  (`requirePostAuthor`), since it needs no post context.
- **Edit / delete** — the author, or federal board (moderation) —
  `canModeratePost`.

Authorization is **not** enforced inside the services (they take a `db` + ids),
matching the `events`/`projects` convention; the app action layer
(`apps/web/app/_blog/access.ts`) is the single place these checks live.

## Comments

Not built. The single-post page mounts `CommentsPlaceholder`, which renders
nothing for signed-out/external visitors — the decided visibility rule (spec
requirement 5) is in place so a future comments module drops in behind the same
`canSeeComments` gate.

## App integration

- Feed `/blog`, single post `/blog/[slug]`, create `/blog/neu`, edit
  `/blog/[slug]/bearbeiten`, image upload `POST /api/blog/upload-url`.
- Inline images use the public `blog-media` Supabase bucket
  (`@bdas/storage` `getBlogMediaStorage` / `blogMediaPublicUrl`).
- The feed shows a generated initials avatar — the members module stores no
  profile photo. The single view shows the author by name only.

## Feature flag

`BDAS_FLAG_BLOG` — off by default (rule 6).

## Tests

`pnpm --filter @bdas/blog test`. Pure logic (slug, content render/sanitize,
visibility) runs anywhere; the integration suite in `index.test.ts` needs a
reachable Postgres (`DATABASE_URL`) and skips otherwise.
