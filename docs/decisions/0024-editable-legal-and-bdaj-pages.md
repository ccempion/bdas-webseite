# ADR 0024 — Wire Impressum, Datenschutz, and BDAJ to the Puck content editor

- **Status:** Accepted
- **Date:** 2026-07-18
- **Supersedes:** —
- **Superseded by:** —

## Context

ADR 0023 established Puck for board-editable content pages and stated that a
new editable page needs only "a row-slug decision, a five-line Server Component
route, and (if navigable) a nav entry — no schema or module change." Three
existing placeholder pages are waiting on board-authored content and should
become editable: BDAJ (`/ueber-uns/bdaj`), Impressum (`/impressum`), and
Datenschutz (`/datenschutz`).

Two of these are different from the BSR page in one important way: the Impressum
(§ 5 DDG / § 18 MStV) and the Datenschutzerklärung (DSGVO) are **legally
required and must always be reachable**. The BSR render route calls
`notFound()` when the `content` flag is off — acceptable for an "Über uns" page,
but a 404 (or blank page) on a legal notice is a legal exposure.

## Decision

- **Convert the three static pages to the ADR 0023 pattern:** a public render
  `page.tsx` plus a `/bearbeiten` editor route each, at slugs `ueber-uns/bdaj`,
  `impressum`, and `datenschutz`. Editing stays federal-board-only, enforced in
  both the editor route (`isFederalBoard`) and the `savePage` service
  (`federal_board` grant) — no new authorization code.
- **Legal pages are never flag-gated on the render side.** This is a deliberate,
  narrow exception to CLAUDE.md §3 ("feature flag gates every new module at the
  route layer"). Impressum and Datenschutz always render; when the `content`
  flag is off or no document has been authored, they fall back to their existing
  static German text rather than `notFound()`. The flag gates the _editing
  capability_, not the page's existence.
- **BDAJ keeps its `public_shell` gate** (it is a public-shell page, not legally
  required) and likewise falls back to its current static copy — chosen over the
  BSR generic "Inhalte folgen in Kürze." fallback so the existing bdaj.de link
  is not lost.
- **Fallback lives in the component, not the database.** No seed, no data
  migration; the board's first save replaces the fallback with authored content.
  Consistent with ADR 0023's "save = live, no seeding."
- **Editor routes remain flag-gated** (`content`, plus `public_shell` for BDAJ)
  so the editing surface stays off in production until the module is
  acceptance-complete.

## Consequences

- The `content` module now backs legally-required surfaces. Turning the
  `content` flag on in production exposes the in-browser editor; until then the
  static fallbacks serve. Once the board authors the reviewed legal wording, it
  lives in the DB as Puck JSON — the "replace before launch" placeholders are
  satisfied by authoring, not by a code change.
- The flag-gating exception is intentionally small: only the two legal pages,
  only on the render side. Any future non-legal content page should follow the
  BSR pattern (flag-gated render, generic fallback).
- No schema, module, or new-flag change, exactly as ADR 0023 predicted. The
  change is six route files plus extended E2E coverage.
