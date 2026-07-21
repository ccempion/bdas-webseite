# Handoff — de-staling `feat/blog-module` onto `main`

**Status: WIP. This commit is a resolved merge of `main` into `feat/blog-module`, but it does NOT typecheck/build yet.** One dependency-pinning step remains (see "Remaining blocker"). Do not merge to `main` until that is done and `pnpm -r typecheck` + `pnpm --filter web build` are green.

## Why this branch exists

`feat/blog-module` was ~49 commits behind `main` (merge-base at PR #73). This commit merges current `origin/main` in and resolves every conflict, so the blog module sits on top of the current platform (events/projects/content modules, brand loader, etc.).

## Pristine snapshot

The exact pre-merge state is preserved on **`feat/blog-module-original`** (commit `867d5fe`), pushed to origin. Use it to diff against this work or to start over. `git merge --abort` equivalents: `git reset --hard feat/blog-module-original`.

## What was resolved (all done, correct)

- **`core/storage/src/index.ts`** — kept **both** the blog-media block (`getBlogMediaStorage` / `blogMediaPublicUrl`) and main's content-media block.
- **`apps/web/package.json`** — kept **both** `@bdas/blog` and `@bdas/content` workspace deps.
- **`.env.example`** — kept both `SUPABASE_BLOG_MEDIA_BUCKET` and `SUPABASE_CONTENT_MEDIA_BUCKET`; removed a duplicate `BDAS_FLAG_BLOG` line.
- **`core/feature-flags/src/index.ts`** — removed a duplicate `"blog"` entry from `FLAGS` (it was listed twice, a leftover from an earlier sloppy merge on the branch).
- `infra/migrations/src/manifest.ts` (blog + content both registered) and the feature-flags map auto-merged cleanly.

## Remaining blocker — Tiptap `@tiptap/core` v2 vs v3

Merging `main` drags blog's Tiptap packages (all v2: `@tiptap/extension-{image,link,youtube}`, `starter-kit`, `html`) onto **`@tiptap/core@3.27.4`**, because `main` runs a deliberate dual v2/v3 Tiptap setup (v3 arrives via `@puckeditor/core`). That breaks the **blog module typecheck**:

```
modules/blog/src/content.ts — Image.extend()/generateHTML type mismatch
  (v2 extension types vs core@3 types)
```

**This is a type-level problem only — runtime is fine (`pnpm --filter @bdas/blog test` → 25/25 pass).**

`main` keeps these packages on **`core@2.27.2`** via its committed lockfile. This branch's auto-merged lockfile drifted them to `core@3.27.4`. The fix is at the **lockfile** level: pin blog's Tiptap packages back to `@tiptap/core@2.27.2` (matching `main`). Once core is unified on v2, the typecheck error disappears at its root — **no code change to `content.ts` is needed.**

### Why it wasn't finished here

The `pnpm.overrides` block in the root `package.json` (the `@tiptap/...@2.27.2>@tiptap/core: "2.27.2"` entries) is **inert** in the environment this was done in — pnpm's fast-path refused to re-resolve, and clean regens drifted *everything* (including the v2 `@tiptap/react` editors) onto `core@3`, which is worse. This needs a normal dev machine / pnpm setup where resolution actually reconciles.

### To finish (on a working pnpm environment)

1. Make the lockfile pin blog's Tiptap packages to `@tiptap/core@2.27.2` — e.g. fix the override selector so it applies, or a clean `pnpm install` that dedupes to v2, then confirm:
   ```
   grep -E "starter-kit@2.27.2\(@tiptap/core@|extension-youtube@2.27.2\(@tiptap/core@" pnpm-lock.yaml
   # both should read (@tiptap/core@2.27.2(...)), like image/link/html already do
   ```
2. `pnpm -r typecheck` and `pnpm --filter web build` must both pass.
3. Also confirm the client editors still work (the v2 `@tiptap/react` blog + content editors) — untested against any core drift.
4. Delete this file, then the branch is ready for a normal `/review` + merge to `main`.

## Also still outstanding for the blog module (separate from the merge)

- No blog **E2E acceptance test** (every other user-facing module has one; CI has the "E2E acceptance §23" gate).
- **Comments** are deliberately not built (placeholder + visibility gate in place).
- Integration tests in `modules/blog/src/index.test.ts` need a reachable Postgres (skip otherwise).
- Go-live: apply `modules/blog/migrations/0001_init.sql` to prod + provision the public `blog-media` Supabase bucket + flip `BDAS_FLAG_BLOG`.
