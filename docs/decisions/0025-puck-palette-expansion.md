# ADR 0025 — Puck editor palette expansion

- **Status:** Accepted
- **Date:** 2026-07-18
- **Supersedes:** —
- **Superseded by:** —

## Context

ADR 0023 shipped a deliberately small three-block palette (Überschrift, Absatz,
Personen-Raster) and explicitly excluded rich text ("no raw-HTML block, ever;
text renders React-escaped"). In use the board found it too weak: no inline
formatting, no images/buttons/callouts, no multi-column layout.

## Decision

- Expand the single shared `puckConfig` (apps/web) with Fließtext (rich text),
  Bild, Button, Zitat, Trenner, Abstand and Spalten blocks. Because the config
  is shared by the editor and the renderer across all four content pages, the
  expansion applies everywhere with no per-page wiring.
- **Rich text keeps ADR 0023's no-raw-HTML guarantee.** The editor is a Tiptap
  WYSIWYG restricted to an allow-set (bold, italic, link, bullet/numbered
  lists); its ProseMirror JSON is stored in the Puck document and rendered by a
  small typed renderer that emits an allow-list of React elements. No HTML
  string is stored or injected; no `dangerouslySetInnerHTML`, no `sanitize-html`
  (the events module's approach — deliberately not reused, to avoid loosening
  the promise). Links are validated (`safeHref`) and get `rel="noopener
noreferrer"` when external.
- No `content` module, schema, migration, or feature-flag change (the stored-doc
  schema already validates props opaquely and permits column zones).
- The legacy Absatz block is retained unchanged for backward compatibility.

## Consequences

- The palette is no longer "deliberately small"; every block is maintenance, but
  each is small, token-styled, and independently tested.
- The content and events modules keep separate rich-text pipelines (content:
  JSON→React allow-list; events: JSON→sanitized HTML). Consolidating into a
  shared `core/` package is deferred until a third consumer appears (YAGNI).
