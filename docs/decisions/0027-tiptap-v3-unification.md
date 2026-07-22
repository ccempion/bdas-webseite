# ADR 0027 — Unify Tiptap on v3 across the app

- **Status:** Accepted
- **Date:** 2026-07-22
- **Supersedes:** —
- **Superseded by:** —

## Context

The blog module (`@bdas/blog`) is a new Tiptap consumer: it renders post
bodies server-side (`content.ts` → `generateHTML`) and ships a client editor
(`apps/web/app/_blog/PostEditor.tsx`). De-staling `feat/blog-module` onto
current `main` forced a lockfile reconcile, which surfaced a latent dependency
condition.

`main` runs **two `@tiptap/core` majors side by side**: the app's own editors
(events, blog) were written against **v2**, while `@puckeditor/core` (ADR 0023)
depends on **v3**. `main` kept the app's Tiptap on `core@2` only as a **frozen
lockfile artifact** — the `pnpm.overrides` that were meant to pin it are
**inert under pnpm v11** (the override syntax is silently ignored). That pin
therefore held only because nothing forced pnpm to re-resolve.

Adding `@bdas/blog` forces exactly that re-resolve. pnpm then collapses the
app's Tiptap subtree onto the **highest major present (`@tiptap/core@3.27.4`,
from Puck)**. There is no lockfile state that keeps blog on the graph *and*
holds the app editors on core@2 without a working override — the frozen v2
artifact cannot survive any Tiptap-consuming addition.

Two ways forward:

1. **Make `pnpm.overrides` actually pin `core@2`** — a pnpm-version / override-
   syntax fix, restoring the dual-major arrangement.
2. **Accept the v3 unification** — let every app editor resolve to `core@3`.

## Decision

Accept the **v3 unification** (option 2).

- All app editors (blog, events) and the server renderers now resolve against
  `@tiptap/core@3`. The Tiptap extension packages the app depends on
  (`starter-kit`, `extension-image`, `extension-link`, `extension-youtube`,
  `@tiptap/html`, `@tiptap/react`) are structurally compatible with either
  core; the mismatch is **nominal (type-level) only**, not runtime.
- Bridge the nominal mismatches with **local casts** at the boundary sites,
  each commented as a v2/v3-core bridge:
  - `modules/blog/src/content.ts`, `modules/events/src/content.ts` — cast the
    `doc` and `EXTENSIONS` args of `generateHTML` to that function's own
    parameter types.
  - `apps/web/app/_blog/PostEditor.tsx`,
    `apps/web/app/_content/RichTextField.tsx`,
    `apps/web/app/admin/events/_editor/RichTextEditor.tsx` — cast the
    `useEditor` `extensions` array `as Extensions`.
- **Do not** re-introduce a `core@2` override. The dual-major arrangement was
  never real (the override was inert); pinning it now would be new work to
  preserve an accident.

## Consequences

- **Runtime is unaffected.** Server render is proven by unit tests
  (`modules/blog/src/content.test.ts`, events content tests) and by the §23
  E2E acceptance suite, which authors a post through the real editor and
  asserts the rendered output. The three client editors (blog, content, events)
  were additionally exercised interactively on the merged branch.
- **The casts are load-bearing until the ecosystem converges.** When the app's
  Tiptap extension packages publish releases that are all typed against
  `core@3` (or the repo drops Puck), the casts can be removed. Each is tagged
  in-code so they are greppable (`@tiptap/core majors`).
- **`pnpm.overrides` for Tiptap are removed / left inert intentionally.** A
  future contributor must not "fix" the pin back to core@2 expecting the old
  arrangement — that path is closed by this ADR.
- **Upgrade posture:** Tiptap majors now move together. A future `core@4` bump
  re-checks all five cast sites and both `generateHTML` renderers.

## Alternatives considered

- **Pin `core@2` via working overrides (option 1).** Rejected: it spends
  effort to reconstruct a dual-major setup that only ever existed as a frozen
  artifact, keeps the app on an older Tiptap, and leaves Puck on core@3 anyway
  (so the app still ships two majors). The unification is simpler and forward-
  looking.
- **Drop Puck / roll our own editor.** Out of scope; ADR 0023 owns that
  decision and content pages depend on it.
