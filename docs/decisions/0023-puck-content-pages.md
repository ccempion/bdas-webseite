# ADR 0023 — Puck for board-editable content pages

- **Status:** Accepted
- **Date:** 2026-07-14
- **Supersedes:** —
- **Superseded by:** —

## Context

The federation wants the Bundessprecher\*innenrat page (photo, BSR role,
university, degree programme per member) editable by the board in the
browser — no developer round-trip. More placeholder pages (Kurzportrait,
Verbandsstruktur, BDAJ) are waiting on board-authored content and would
benefit from the same mechanism. The pinned stack (CLAUDE.md §2) has no
visual editor; adding one is a new dependency and needs an ADR.

## Decision

- **Editor:** Puck (`@puckeditor/core`, MIT — formerly published as
  `@measured/puck`), pinned `^0.22`. A React visual editor with a JSON
  document model and a `<Render>` component; auth is deliberately ours
  (`federal_board` via `@bdas/members`).
- **Boundary:** Puck is a dependency of `apps/web` only. The new `content`
  module stores documents opaquely — it validates a structural zod schema of
  Puck's `Data` shape and never imports Puck. Storage (`content_pages`),
  save-authorization, and the `content.page.saved` event live in the module.
- **Coupling accepted:** stored documents are Puck-format JSON. A move away
  from Puck means migrating documents (or re-authoring the few pages).
  Accepted: pages are few, content is short-lived, and the alternative
  (an own block format) is speculative abstraction.
- **Save = live.** No drafts/versions until real usage demands them.
- **Editor language:** Puck's chrome is English; block and field labels are
  German. Accepted for a board-only surface — the German-strings requirement
  (spec §22) targets member/public surfaces.
- **Imagery:** public `content-media` bucket via `core/storage`, exact
  analogue of `event-media` (ADR 0012 pattern), signed uploads minted only
  after the federal-board check.

## Consequences

- New editable pages need: a row-slug decision, a five-line Server Component
  route, and (if navigable) a nav entry — no schema or module change.
- Puck upgrades ride `^0.22`; major upgrades re-check the `Data` zod schema
  against Puck's changelog.
- Orphaned uploaded images are tolerated (no sweeper); revisit if the bucket
  grows noticeably.
- **Owner setup:** create the public `content-media` bucket in Supabase and
  set `SUPABASE_CONTENT_MEDIA_BUCKET` if the name differs.
