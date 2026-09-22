# Blog Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Boxes are checked for work delivered on `feat/blog-module`; unchecked boxes are outstanding.

**Goal:** A lightweight member-authored blog: any signed-in member publishes rich-text posts with a public / members / board audience; the board moderates; content is rendered server-side and sanitised.

**Architecture:** New `modules/blog` owns a `posts` table with authorization-agnostic services (`createPost`/`updatePost`/`deletePost`/`listPosts`/`getPostBySlug`/`getPostById`) and pure visibility rules (`canViewPost`/`canModeratePost`) reused by every read path. `apps/web` provides the feed, single-post, and author-editor surfaces, mapping the session principal to a `Viewer` in `_blog/access.ts` and gating every route behind the `blog` flag. Bodies are Tiptap JSON rendered to sanitised HTML server-side (a real XSS boundary). Images upload to a public `blog-media` Supabase bucket via `core/storage`.

**Tech Stack:** TypeScript, Next.js 14 App Router, Drizzle ORM, PostgreSQL (Docker for tests), zod, Tiptap (`@tiptap/*`, core v3 — ADR 0027), `sanitize-html`, Supabase storage, Tailwind + `@bdas/design-system` tokens, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-22-blog-module-design.md`
**ADR:** `docs/decisions/0027-tiptap-v3-unification.md`

## Global Constraints

- Module rules (CLAUDE.md §1): only `modules/blog` touches `posts`; public surface is `modules/blog/src/index.ts`; migration in `modules/blog/migrations/` registered in `infra/migrations/src/manifest.ts` (after `members`); feature flag `blog` gates every route and Server Action.
- `@tiptap/*` client packages are dependencies of **`apps/web`**; the module depends only on the server-render packages (`@tiptap/html` + extensions) and `sanitize-html`.
- Services carry **no** auth/db-of-another-module import — authorization lives at the app layer (`assertModerable`), same convention as `events` / `projects`.
- All user-facing copy is German. Styling only via design tokens — no inline hex/radius/shadow/duration.
- Module tests run against real Postgres (`docker compose up -d` first).
- Save = live; no drafts. Slug immutable after publish.

---

### Task 1: `modules/blog` scaffold, schema, migration, flag — `[x]`

- [x] `package.json`, `tsconfig.json`, `README.md`
- [x] `migrations/0001_init.sql` (`posts`, visibility CHECK, indexes) + manifest entry after `members`
- [x] `src/schema.ts` (Drizzle table), `src/types.ts` (`Post`, `PostSummary`, `PostVisibility`, `TiptapDoc`)
- [x] Register `"blog"` in `core/feature-flags`

### Task 2: Visibility + slug rules (pure, unit-tested) — `[x]`

- [x] `src/visibility.ts` — `Viewer`, `ANON`, `visibleLevelsFor`, `canViewPost`, `canModeratePost`
- [x] `src/slug.ts` — `slugifyTitle` (umlaut transliteration) + `buildSlug` (base + random suffix)
- [x] `visibility.test.ts` (13), `slug.test.ts` (6)

### Task 3: Services — `[x]`

- [x] `services/manage.ts` — `createPost`/`updatePost`/`deletePost`, `PostInput` zod, `rowToPost`; emit `blog.post.*` events
- [x] `services/list.ts` — feed with SQL visibility filter + author-sees-own
- [x] `services/get.ts` — `getPostBySlug` (visibility-filtered → null), `getPostById` (unfiltered, post-authorization)
- [x] `index.test.ts` — DB-backed integration (7)

### Task 4: Server-side sanitised render — `[x]`

- [x] `src/content.ts` — `renderPostContentHtml` (`generateHTML` → `sanitize-html` allow-list, YouTube-only iframe host filter), `plainTextToDoc`
- [x] `content.test.ts` (6), incl. XSS-injection cases

### Task 5: App surface (`apps/web`) — `[x]`

- [x] `_blog/access.ts` — principal → `Viewer`, author-display resolution, `requirePostAuthor`, `canModerate`
- [x] `_blog/flag.ts` — `requireBlogFlag`
- [x] `blog/page.tsx` (feed), `blog/[slug]/page.tsx` (single), `blog/neu`, `blog/[slug]/bearbeiten`
- [x] `_blog/PostForm.tsx` + `PostEditor.tsx` (Tiptap client editor → hidden JSON input)
- [x] `blog/actions.ts` — flag- and authz-gated create/update/delete Server Actions
- [x] `api/blog/upload-url` — signed `blog-media` upload
- [x] `CommentsPlaceholder` (member-gated, no storage)

### Task 6: Tiptap v3 unification — `[x]`

- [x] Accept `@tiptap/core@3` app-wide; bridge nominal mismatches with casts at the five boundary sites (ADR 0027)
- [x] Lockfile reconciled so the blog importer is present; `pnpm -r typecheck` + `pnpm --filter web build` green

### Task 7: §23 E2E acceptance — `[x]`

- [x] `e2e/blog.e2e.ts` — author→feed/page render; members-post hidden from anonymous; author-only moderation
- [x] `BDAS_FLAG_BLOG=true` added to the CI e2e job env and `playwright.config` webServer env
- [x] Suite green locally (3/3)

### Task 8: Go-live (owner) — `[ ]`

- [ ] Apply `0001_init.sql` to prod (rcfvs…) + insert `_bdas_migrations` row
- [ ] Provision public `blog-media` Supabase bucket (type/size enforced); verify a live signed-PUT upload once
- [ ] Flip `BDAS_FLAG_BLOG=true` in production

## Deferred (separate work, not this PR)

- Comments (storage + UI), reactions, tags, search
- Feed excerpts / pagination (feed currently renders full bodies inline)
- Graceful slug-collision handling (currently relies on the random suffix + UNIQUE guard)
