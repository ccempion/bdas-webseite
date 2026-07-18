# Editable Legal + BDAJ Pages (Puck) — Design

**Date:** 2026-07-18
**Status:** Approved (product owner requested; legal-fallback decision confirmed)
**Scope:** Wire three existing placeholder pages — BDAJ, Impressum, Datenschutz — to the Puck content editor established in ADR 0023. No module, schema, or new-flag change. Federal board only may edit.

---

## 1. Context and decisions

ADR 0023 shipped a generic board-editable content system (the `content` module + Puck in `apps/web`) with the Bundessprecher\*innenrat (BSR) page as the first page. The ADR anticipated that further placeholder pages "waiting on board-authored content" — Kurzportrait, Verbandsstruktur, BDAJ — would become editable "without new code."

This slice makes three of them editable:

- `/ueber-uns/bdaj` — Bund der Alevitischen Jugendlichen
- `/impressum` — Impressum (§ 5 DDG / § 18 MStV)
- `/datenschutz` — Datenschutzerklärung (DSGVO)

Decisions:

- **Reuse the ADR 0023 recipe verbatim:** a public render `page.tsx` + a `/bearbeiten` editor route per page, both gating edit on the existing `federal_board` grant. "Only federal board may edit" therefore needs no new code — it is already enforced in the editor route (`isFederalBoard`) and in the `savePage` service (`federal_board`).
- **Legal pages are always reachable — never flag-gated on render.** Impressum and Datenschutz must not 404. This is a deliberate, narrow exception to CLAUDE.md §3 and is recorded in **ADR 0024**. The `content` flag gates only the editing capability, not the page's existence.
- **Static text is the fallback.** When the `content` flag is off or no document is authored yet, each page renders its current static German copy (not the BSR "Inhalte folgen in Kürze." placeholder). This preserves the current legal text and the BDAJ bdaj.de link, and guarantees no blank/legal-exposure state. No DB seed; the board's first save replaces the fallback.
- **BDAJ keeps its `public_shell` gate** (public-shell page, not legally required); its editor route additionally requires `public_shell`, mirroring BSR.

## 2. Goals and non-goals

**Goals**

- BDAJ, Impressum, Datenschutz editable in-browser by federal board via Puck.
- Legal pages never 404 and never go blank.
- No regression in the currently-visible content of any of the three pages.

**Non-goals**

- No changes to the `content` module, its schema, the `[...slug]` API route, or the upload route (all already slug-generic).
- No navigation/footer changes (paths are unchanged).
- No DB seeding or data migration.
- No drafts/versioning (unchanged from ADR 0023: save = live).

## 3. Routes

Six route files under `apps/web/app`:

| Slug             | Render route              | Editor route                         | Render gate             |
| ---------------- | ------------------------- | ------------------------------------ | ----------------------- |
| `ueber-uns/bdaj` | `ueber-uns/bdaj/page.tsx` | `ueber-uns/bdaj/bearbeiten/page.tsx` | `public_shell`          |
| `impressum`      | `impressum/page.tsx`      | `impressum/bearbeiten/page.tsx`      | none (always reachable) |
| `datenschutz`    | `datenschutz/page.tsx`    | `datenschutz/bearbeiten/page.tsx`    | none (always reachable) |

**Render route shape** (all three):

```
const contentOn = isFlagOn("content");
const page = contentOn ? await getPage(getDb(), SLUG) : null;
const me   = contentOn ? await loadCurrentMember() : null;
const canEdit = me !== null && isFederalBoard(me.grants);
// header with h1 + "Seite bearbeiten" link when canEdit
// body: <Render> when page exists, else the static fallback
```

BDAJ additionally calls `requirePublicShellFlag()` at the top.

**Editor route shape** (all three): `notFound()` unless the required flags are on _and_ the caller is federal board; then render `<PuckEditor slug initialData>`. Legal editors gate on `content`; the BDAJ editor gates on `public_shell` && `content`.

## 4. Security posture

- Editing authorization is enforced twice: server-side in the editor route (`isFederalBoard`) and inside `savePage` (`federal_board`, rejects with `ForbiddenError`). The public `[...slug]` PUT route already delegates to `savePage`, so a hand-crafted request from a non-board user is rejected regardless of route gating.
- Editor routes return `notFound()` (not `403`) to non-board users — no existence leak (spec §6), matching BSR.
- Slugs `ueber-uns/bdaj`, `impressum`, `datenschutz` all satisfy the module's `SLUG_RE`.

## 5. Testing

- Extend `e2e/content-pages.e2e.ts` with a parametrized set over all four editable pages (BSR + the three new): (a) a visitor sees the page heading and **no** edit button; (b) anonymous `/…/bearbeiten` is a 404; (c) a logged-in federal-board user reaches the Puck editor from every page (single registration, loops the pages).
- `savePage` federal-board authorization is already covered by the `content` module unit tests — unchanged.

## 6. Rollout

- Ships behind the existing `content` flag (off in production). Legal pages render their static fallback until the flag is on and the board authors content.
- No migration to apply; no env change.
- When the flag is turned on in production, the board authors the reviewed Impressum/Datenschutz wording in-browser, satisfying the "replace before launch" placeholders without a code change.
