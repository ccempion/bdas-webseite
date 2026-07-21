# Handoff — de-staling `feat/blog-module` onto `main`

**Status: builds green.** `pnpm -r typecheck` and `pnpm --filter web build` pass; blog + events render tests pass. One thing still to eyeball: the client Tiptap editors in a browser (see "Tiptap decision").

## Why this branch exists

`feat/blog-module` was ~49 commits behind `main` (merge-base at PR #73). This merges current `origin/main` in and resolves every conflict, so the blog module sits on top of the current platform.

## Pristine snapshot

The exact pre-merge state is preserved on **`feat/blog-module-original`** (commit `867d5fe`), pushed to origin. To start over: `git reset --hard feat/blog-module-original`.

## Conflicts resolved

- **`core/storage/src/index.ts`** — kept both the blog-media and content-media blocks.
- **`apps/web/package.json`** — kept both `@bdas/blog` and `@bdas/content`.
- **`.env.example`** — kept both media buckets; removed a duplicate `BDAS_FLAG_BLOG`.
- **`core/feature-flags/src/index.ts`** — removed a duplicate `"blog"` from `FLAGS`.
- migration manifest + feature-flags map auto-merged.

## Tiptap decision — unified on v3 (with nominal casts)

`main` runs two `@tiptap/core` majors side by side: the app's editors on **v2**, `@puckeditor/core` on **v3**. `main`'s core@2 pin is a frozen lockfile artifact — its `pnpm.overrides` are inert in pnpm v11, so **any** reconcile that adds a new Tiptap consumer (blog) collapses the app's Tiptap onto v3 (the highest core, from Puck). Rather than fight that, this branch **accepts the v3 unification** and bridges the resulting nominal type mismatches with casts (runtime is unaffected — the extension objects are structurally compatible; blog/events render tests prove it):

- `modules/blog/src/content.ts`, `modules/events/src/content.ts` — cast `EXTENSIONS` in `generateHTML`.
- `apps/web/app/_blog/PostEditor.tsx`, `apps/web/app/_content/RichTextField.tsx`, `apps/web/app/admin/events/_editor/RichTextEditor.tsx` — cast the `useEditor` `extensions` array `as Extensions`.

**Still to verify:** the three client editors (blog, content, events) in a real browser on the v3 core. The build compiles them and server-render is proven; the interactive editing path is not unit-tested. If any editor misbehaves, the alternative is getting the `pnpm.overrides` to actually pin core@2 (a pnpm-version/syntax fix) instead of this v3 unification.

## To actually test blog on a Vercel preview

The build is green, but the blog pages need two runtime prerequisites:

1. `BDAS_FLAG_BLOG=true` on the preview (routes 404 with the flag off).
2. Apply `modules/blog/migrations/0001_init.sql` to the DB the preview uses (else `/blog` 500s — no `posts` table).

## Outstanding for the blog module (separate from the merge)

- No blog **E2E acceptance test** (every other user-facing module has one; CI gates on "E2E acceptance §23").
- **Comments** deliberately not built (placeholder + visibility gate in place).
- `modules/blog/src/index.test.ts` integration tests need a reachable Postgres.
- Go-live: apply the migration to prod + provision the public `blog-media` Supabase bucket + flip `BDAS_FLAG_BLOG`.
