# ADR 0028 — Pin the Tiptap family to one exact version

- **Status:** Accepted
- **Date:** 2026-07-25
- **Supersedes:** — **Amends:** [ADR 0027](0027-tiptap-v3-unification.md)

## Context

ADR 0027 accepted the v3 unification and bridged the remaining type mismatches
with five local casts, describing them as "load-bearing until the ecosystem
converges" — removable once the app's Tiptap packages are all typed against
`core@3`. That convergence is available now: every package the app uses
publishes a v3 release.

0027 also observed that `pnpm.overrides` are "inert under pnpm v11" but did not
say why or what replaces them. Under pnpm 11 those settings moved out of
`package.json` into `pnpm-workspace.yaml` — the same relocation the repo already
follows for `allowBuilds`. Declaring them in `package.json` is silently ignored,
which is why the original 14 Tiptap overrides never took effect.

Two further facts force an exact pin rather than a range:

- Tiptap releases its family in lockstep and **peer-pins exact versions**
  (`@tiptap/html@3.27.4` requires exactly `@tiptap/core@3.27.4`).
- Tiptap's own inter-package deps use caret ranges, so a plain `pnpm install`
  drifts leaf extensions onto a newer patch than `core`, producing unmet peers.

## Decision

1. **Declare Tiptap at an exact version, not a range.** `apps/web`,
   `@bdas/blog` and `@bdas/events-module` pin `3.27.4` — the version
   `@puckeditor/core` already resolves, so app and Puck share one copy.
2. **Pin the whole family via `overrides` in `pnpm-workspace.yaml`.** This
   covers the transitive extensions Puck pulls, which no direct dependency
   controls. Verify by asserting `overrides:` appears in `pnpm-lock.yaml` — its
   absence means the block is being ignored again.
3. **Remove all five casts from ADR 0027.** They bridged two `core` majors;
   with one major there is nothing to bridge. The two `generateHTML` call sites
   keep a _different_, narrower cast (`doc as JSONContent`) because `TiptapDoc`
   is deliberately loose so the module's public surface does not leak Tiptap's
   types (rule 8) — that is a module-boundary choice, not a version bridge.
4. **`@tiptap/extension-link` is no longer a direct dependency.** StarterKit v3
   bundles it; it is configured through `StarterKit.configure({ link: … })`.
   Adding it separately would register the extension twice.
5. **Underline stays disabled.** StarterKit v3 also bundles Underline, which v2
   did not. A version migration must not silently widen what authors can
   produce, so every StarterKit call passes `underline: false`. Enabling it is a
   product decision; the blog sanitize allow-list already permits `<u>`.

## Consequences

- One `@tiptap/*` version in the tree — verified by lockfile analysis (0
  packages at more than one version, down from 19) and by the build (48
  disambiguated Tiptap vendor chunks reduced to none, as webpack no longer needs
  them).
- **Upgrading Tiptap is now a deliberate, atomic act:** bump the three
  workspace manifests _and_ the `pnpm-workspace.yaml` override block together.
  Bumping only the manifests reintroduces the skew.
- `@bdas/blog` and `@bdas/events-module` gain `happy-dom` (~8.3 MB, server
  only): `@tiptap/html` v3 dropped its bundled `zeed-dom` in favour of a hard
  `happy-dom` peer. If server bundle size becomes a concern,
  `@tiptap/static-renderer` renders without a DOM and has no dependencies, at
  the cost of rewriting both `renderHtml` functions and re-reviewing the XSS
  boundary.
