# Puck Editor Palette Expansion — Design

**Date:** 2026-07-18
**Status:** Approved (brainstormed with product owner)
**Scope:** Expand the shared Puck block palette used by all board-editable content pages (BSR, BDAJ, Impressum, Datenschutz) with rich text, more content blocks, and column layout. `apps/web` only — no `content` module, schema, or new-flag change.

---

## 1. Context and decisions

ADR 0023 shipped a deliberately small three-block palette (Überschrift, Absatz, Personen-Raster). In use it feels too weak: no inline text formatting, no images/buttons/callouts, no multi-column layout. The board wants a richer, shared "kit."

The entire palette is the `components` map in `apps/web/app/_content/puck-config.tsx`, imported by **both** the editor (`PuckEditor`) and the public renderer (`<Render>`), and used by all four pages. Adding a block there lights it up everywhere at once — the "same kit for every colleague" requirement is already structurally guaranteed and needs no new wiring.

Decisions made during brainstorming:

- **Expand the one shared config.** No per-page palettes. One `puckConfig` remains the single source of truth.
- **Rich text via Approach A (keep the strict safety guarantee).** The content editor stores **no raw HTML** today (ADR 0023: text renders React-escaped — the structural XSS exclusion). Approach A preserves that: the editor is a Tiptap WYSIWYG toolbar, but formatting is stored as **structured ProseMirror JSON** and rendered by a **small, typed renderer** that maps a fixed allow-set of nodes/marks to React elements. No HTML string is ever stored or injected; no `dangerouslySetInnerHTML`; no `sanitize-html`. (Approach B — the events module's Tiptap→sanitized-HTML path — was rejected because it loosens the "no HTML ever" promise and would need an ADR reversal.)
- **Reuse existing Tiptap packages.** `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link` are already repo dependencies (used by the events editor). No new runtime dependency.
- **The stored-document schema needs no change.** `PuckDataSchema` validates props as `z.record(z.unknown())` with `.passthrough()` and already permits `zones`, so rich-text values, new block props, and column drop-zones all validate as-is.
- **Guardrails unchanged:** design tokens only (no ad-hoc hex/radius/shadow/spacing — CLAUDE.md §7); links forced to `rel="noopener noreferrer"`; hrefs validated to `http(s)`/relative; board-only signed upload; 512 KB document cap.
- **A short ADR 0025** records the palette expansion and the typed-renderer safety approach (extends, does not reverse, ADR 0023).

## 2. Goals and non-goals

**Goals**

- A richer shared palette: rich text, image, button, callout, divider/spacer, columns.
- Inline formatting (bold, italic, links, bullet & numbered lists) that upholds the no-raw-HTML safety property.
- Every new block available in every colleague's editor on every content page, with identical public rendering.
- No regression to already-saved documents.

**Non-goals**

- No raw-HTML / embed-arbitrary-markup block, ever.
- No `content` module, schema, migration, or feature-flag change.
- No change to the events module or its rich-text pipeline (kept separate; consolidation into a shared `core/` package is deferred until a third consumer appears — YAGNI).
- No drafts/versioning (unchanged: save = live).

## 3. Rich text (Approach A)

**Editor field** — a custom Puck field wrapping a Tiptap editor configured to a **fixed extension set**: paragraph, text, **bold**, _italic_, link, bullet list, numbered list, hard break. StarterKit's other nodes (heading, blockquote, code, code block, horizontal rule, strike) are **disabled** — headings, quotes, and dividers are their own Puck blocks, so Fließtext stays a focused inline-formatting surface. Toolbar buttons: bold, italic, link (add/edit/remove), bullet list, numbered list.

**Storage** — the field value is the Tiptap/ProseMirror document JSON, stored inside the Puck document like any other prop.

**Renderer** — a small typed function `renderRichText(doc)` in `apps/web/app/_content/` that walks the JSON and emits React elements for **only** the allow-set:

| Node / mark                               | Renders as                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `paragraph`                               | `<p class="…tokens">`                                                                       |
| `text`                                    | escaped string (React default)                                                              |
| mark `bold`                               | `<strong>`                                                                                  |
| mark `italic`                             | `<em>`                                                                                      |
| mark `link`                               | `<a rel="noopener noreferrer">` (external → `target="_blank"`); href re-validated at render |
| `bulletList` / `orderedList` / `listItem` | `<ul>` / `<ol>` / `<li>`                                                                    |
| `hardBreak`                               | `<br />`                                                                                    |

Unknown node or mark types are **ignored** (their text children still render as plain text). Because the editor cannot produce nodes outside the enabled set and the renderer allow-lists on top of that, the safety property is defence-in-depth: no path yields raw HTML.

## 4. Block palette

Final `puckConfig.components`. German labels; token-only styling.

| Block                                     | Fields                                                                                                 | Render                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **Überschrift** _(exists, unchanged)_     | text; ebene (h2/h3)                                                                                    | `<h2>`/`<h3>`                                                                        |
| **Fließtext** _(new, rich)_               | inhalt (rich-text field, §3)                                                                           | `renderRichText(inhalt)`                                                             |
| **Bild** _(new)_                          | bild (signed upload — generalized `FotoField`); altText (required, a11y); breite (select: voll / halb) | `<figure><img><figcaption>`                                                          |
| **Button** _(new)_                        | label; href (validated); variante (primär/sekundär)                                                    | token-styled `<a>`; external → `rel`+`target`                                        |
| **Zitat** _(new)_                         | text (textarea); quelle (optional)                                                                     | accent-bordered callout (BDAS accordion idiom: left border + halo, `rounded-bdas`)   |
| **Trenner** _(new)_                       | —                                                                                                      | token-styled `<hr>`                                                                  |
| **Abstand** _(new)_                       | höhe (select: klein / mittel / groß — token spacing)                                                   | spacer `<div>`                                                                       |
| **Spalten** _(new)_                       | anzahl (select: 2 / 3)                                                                                 | responsive grid of N Puck `<DropZone>`s; stacks on mobile; each zone holds any block |
| **Personen-Raster** _(exists, unchanged)_ | personen[] (foto, name, rolle, uni, studiengang)                                                       | BSR grid                                                                             |

**Backward compatibility:** the legacy **Absatz** block (plain `{text}`) is retained as a **renderer-only** entry (kept out of the palette via Puck `categories`) so any already-saved Absatz content still displays. New pages use Fließtext.

**Palette organisation:** Puck `categories` group the sidebar — e.g. _Text_ (Überschrift, Fließtext, Zitat), _Medien_ (Bild, Button), _Layout_ (Spalten, Trenner, Abstand), _BDAS_ (Personen-Raster) — and hide the legacy Absatz.

## 5. Where the code lives

All in `apps/web/app/_content/` (the content Puck layer — ADR 0023 keeps Puck an `apps/web`-only concern):

- `puck-config.tsx` — extended `components` map + `categories`.
- `RichTextField.tsx` — client Tiptap editor custom field (+ toolbar).
- `rich-text.tsx` — the typed `renderRichText` renderer (server-safe).
- `BildField.tsx` — generalized from the current `FotoField` (same signed-upload flow), consumed by both Bild and Personen-Raster.
- `href.ts` — shared href validator (`http`/`https`/relative only) for Button and link marks.

No files outside `apps/web/app/_content/` change except the shared classes/tokens already exported by `@bdas/design-system`.

## 6. Security posture

- **No raw HTML** anywhere: rich text is structured JSON → allow-listed React elements; there is no HTML string and no `dangerouslySetInnerHTML` in the content layer.
- **Links:** every anchor (Button + link mark) runs through `href.ts` (reject `javascript:`, `data:`, etc.); external links get `rel="noopener noreferrer"`.
- **Uploads:** unchanged — signed, board-only, type/size-capped `content-media` bucket.
- **Authoring authz:** unchanged — federal-board-only in the editor route and in `savePage`.
- **Document cap:** unchanged 512 KB.
- **Images:** `altText` required (keeps the Lighthouse ≥90 a11y gate green).

## 7. Testing

- **Unit (vitest, no DB):** `renderRichText` — each supported node/mark renders correctly; unknown nodes/marks are dropped safely; link marks get `rel` and reject unsafe schemes. `href.ts` — accepts http/https/relative, rejects `javascript:`/`data:`/malformed.
- **Component sanity:** `puck-config` snapshot/shape test extended to assert the new components exist and legacy Absatz still renders.
- **E2E (`e2e/content-pages.e2e.ts`):** extend the federal-board flow to add a Fließtext block (bold a word) and a Button, publish, then assert the visitor sees the formatted text and the button link. Keep it to one round-trip; existing gating tests unchanged.

## 8. Rollout

- Ships behind the existing `content` flag (off in production) — no new flag.
- No schema, module, or migration change; no new runtime dependency.
- ADR 0025 committed with the change.
- One PR on a branch, extending the shared palette; on merge it applies to all four pages at once.
