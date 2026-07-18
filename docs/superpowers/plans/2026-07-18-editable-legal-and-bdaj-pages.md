# Editable Legal + BDAJ Pages (Puck) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the BDAJ, Impressum, and Datenschutz pages board-editable via the Puck content editor (ADR 0023), reusing the existing `content` module and Puck integration. Only `federal_board` may edit.

**Architecture:** Six route files in `apps/web/app` following the BSR two-route pattern (public `page.tsx` rendering via `<Render>` + a `/bearbeiten` editor route rendering `<PuckEditor>`). No `content` module, schema, API-route, or new-flag change. Legal pages (Impressum, Datenschutz) are never flag-gated on render and fall back to their current static German text; BDAJ keeps its `public_shell` gate and its static fallback.

**Tech Stack:** TypeScript, Next.js 14 App Router, `@puckeditor/core` ^0.22, `@bdas/content`, `@bdas/feature-flags`, `@bdas/members`, Tailwind + `@bdas/design-system` tokens, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-18-editable-legal-and-bdaj-pages-design.md`
**ADR:** `docs/decisions/0024-editable-legal-and-bdaj-pages.md`

## Global Constraints

- Reuse only the `content` module's public surface (`getPage`, `savePage` via the PUT route) — no new exports, no schema touch.
- `@puckeditor/core` stays a dependency of `apps/web` only.
- Editing authorization is `federal_board`, enforced in the editor route **and** already in `savePage`. Add no new auth code.
- Legal pages must never 404 or go blank: no `notFound()` on the render side; static fallback when unauthored.
- Styling only via design tokens (reuse the BSR page's edit-button classes verbatim).
- All user-facing copy German; Puck chrome stays English (ADR 0023).
- Slugs: `ueber-uns/bdaj`, `impressum`, `datenschutz` (all valid per the module `SLUG_RE`).
- Commits end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: BDAJ render + editor routes

**Files:**

- Modify: `apps/web/app/ueber-uns/bdaj/page.tsx`
- Create: `apps/web/app/ueber-uns/bdaj/bearbeiten/page.tsx`

- [x] **Step 1: Render route.** Keep `requirePublicShellFlag()`. Load `getPage`/`loadCurrentMember` only when `content` is on. Show a "Seite bearbeiten" link (BSR classes) when `isFederalBoard`. Render `<Render config={puckConfig} data>` when a document exists, else the current static BDAJ copy (paragraph + bdaj.de link).
- [x] **Step 2: Editor route.** `notFound()` unless `public_shell` && `content` && `isFederalBoard`; then `<PuckEditor slug="ueber-uns/bdaj" initialData>` with an empty-doc default. `robots: { index: false }`. Import depth `../../../_content`, `../../../_dashboard`.

### Task 2: Impressum render + editor routes

**Files:**

- Modify: `apps/web/app/impressum/page.tsx`
- Create: `apps/web/app/impressum/bearbeiten/page.tsx`

- [x] **Step 1: Render route.** No flag gate that 404s. `page = isFlagOn("content") ? getPage(...) : null`. Edit link when `content` && `isFederalBoard`. `<Render>` when authored, else the current static Impressum fallback (§ 5 DDG / § 18 MStV placeholder). Import depth `../_content`, `../_dashboard`.
- [x] **Step 2: Editor route.** `notFound()` unless `content` && `isFederalBoard`; then `<PuckEditor slug="impressum" initialData>`. Import depth `../../_content`, `../../_dashboard`.

### Task 3: Datenschutz render + editor routes

**Files:**

- Modify: `apps/web/app/datenschutz/page.tsx`
- Create: `apps/web/app/datenschutz/bearbeiten/page.tsx`

- [x] **Step 1: Render route.** Same shape as Impressum. Static fallback = the current Datenschutz copy (cookies + OpenStreetMap DSGVO disclosures). Preserve German typographic quotes exactly.
- [x] **Step 2: Editor route.** `notFound()` unless `content` && `isFederalBoard`; then `<PuckEditor slug="datenschutz" initialData>`.

### Task 4: E2E coverage

**Files:**

- Modify: `e2e/content-pages.e2e.ts`

- [x] Parametrize over the four editable pages (BSR + the three new). Per page: visitor sees the `<h1>` and no edit button; anonymous `/…/bearbeiten` is a 404. One federal-board test registers once and loops all four pages, reaching the Puck editor (open the collapsed menu bar, assert "Publish" visible).

### Task 5: ADR + docs + verification

- [x] Write ADR 0024 (records the legal-page flag-gating exception to CLAUDE.md §3).
- [x] Write this plan and the design spec.
- [x] Verify: `pnpm --filter @bdas/web typecheck`, `eslint` on the changed paths, `prettier --check`. Full E2E runs in CI (needs Postgres + `BDAS_FLAG_CONTENT`/`BDAS_FLAG_PUBLIC_SHELL` + federal allowlist).
