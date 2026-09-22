# Organigramm block — design

- **Date:** 2026-07-25
- **Status:** Approved
- **ADR:** 0028 (org chart without a chart library)

## 1. Goal

Give the board a visual organisational chart of the federation on
`/ueber-uns/verbandsstruktur`, authored in the Puck editor like every other
content page. Boxes carry a title, a subtitle, an optional logo and an optional
link — so BDAJ points at `bdaj.de`, AABF at its own site, and internal boxes at
platform pages. The chart is the page's main component; further blocks
(Fließtext, Bild, …) sit below it.

## 2. Scope

**In scope:** a new `Organigramm` block in the shared Puck palette; converting
`/ueber-uns/verbandsstruktur` from static placeholder copy to a board-editable
page; unit, component and E2E tests; ADR 0028.

**Out of scope:** enumerating Hochschulgruppen in the chart (explicitly
excluded — the chart stays at federation level, roughly 8–15 boxes over 3
levels); auto-populating any box from the `groups` module; drag-and-drop
positioning on a canvas; export to image or PDF.

## 3. Library evaluation, and why we build instead

The starting proposal was [`bumbeishvili/org-chart`](https://github.com/bumbeishvili/org-chart)
(`d3-org-chart`). It was evaluated against `@xyflow/react` (React Flow),
`react-organizational-chart`, `react-d3-tree`, and a dependency-free custom
block.

|                          | d3-org-chart         | @xyflow/react      | react-organizational-chart | react-d3-tree    |
| ------------------------ | -------------------- | ------------------ | -------------------------- | ---------------- |
| Latest npm release       | v3.1.1, **Sep 2023** | v12.11.2, Jul 2026 | v2.2.1, Apr 2023           | v3.6.6, Feb 2025 |
| Stars / weekly downloads | 1.2k / 105k          | 37.8k / 9.1M       | 194 / 91k                  | 1.2k / 325k      |
| Open issues              | 137                  | 136                | 15                         | 149              |
| First-party TS types     | no                   | yes                | yes                        | yes              |
| License                  | MIT                  | MIT                | MIT                        | MIT              |

`d3-org-chart` is popular and well built for its use case: a searchable,
zoomable directory of thousands of nodes. Four properties make it the wrong
tool for an 8–15 box public page:

1. **Its node API is a raw HTML string.** `nodeContent: d => '<div>…</div>'`,
   injected via d3's `.html()` into an SVG `<foreignObject>` — functionally
   `dangerouslySetInnerHTML`. ADR 0023 promises "no raw-HTML block, ever; text
   renders React-escaped" and ADR 0025 reaffirms it. Board-authored titles and
   hrefs would flow into that string, so the guarantee would have to be
   re-established by hand-rolled escaping instead of structurally.
2. **The page is public and crawler-indexed** (listed in `apps/web/app/sitemap.ts`).
   Content painted client-side into a `<foreignObject>` is invisible to search
   engines, to reader mode, and effectively to screen readers. On a page whose
   entire purpose is to state how the federation is organised, that is the
   content being thrown away.
3. **Dependency weight and licence.** ~42 kB minified plus six d3 sub-packages
   and `d3-flextree@2.1.2`, which is WTFPL-licensed and depends on d3-hierarchy
   **v1** — shipping a second copy of d3-hierarchy alongside v3.
4. **Scale mismatch.** Pan, zoom and expand/collapse are its selling points and
   are all liabilities at this size: a scroll trap on mobile, and content that
   no longer flows with the page.

The alternatives do not clear the bar either. React Flow is the healthiest
package and uses real React nodes, but at 57 kB gzip it is a node-_editor_
built around a client-only pan/zoom canvas — same SEO and accessibility
trade-off, more weight. `react-organizational-chart` is unreleased since April
2023 and would pull `@emotion/css` into a Tailwind codebase.
`react-d3-tree` drags in d3-hierarchy v1, uuid v8 and a forked
`react-transition-group`.

**Decision: no chart library.** A custom block is less code than the
integration wrapper would be, and server rendering, SEO, keyboard access,
printing and design-token styling all come for free.

## 4. Architecture

The block joins the single shared `puckConfig` in `apps/web`, following ADR
0025's precedent that one config serves the editor and the renderer across all
content pages. **No `@bdas/content` change**: the module stores block props
opaquely and already validates the Puck `Data` shape generically. No migration,
no new feature flag — the block rides the existing `content` flag.

| File                                                          | Change                                              |
| ------------------------------------------------------------- | --------------------------------------------------- |
| `apps/web/app/_content/org-tree.ts`                           | new — `Kasten` type and `buildTree`, pure, no React |
| `apps/web/app/_content/org-tree.test.ts`                      | new — `buildTree` edge cases                        |
| `apps/web/app/_content/Organigramm.tsx`                       | new — renderer                                      |
| `apps/web/app/_content/Organigramm.test.tsx`                  | new — render, links, accent, logo                   |
| `apps/web/app/_content/puck-config.tsx`                       | edit — register the block                           |
| `apps/web/app/ueber-uns/verbandsstruktur/page.tsx`            | edit — static → editable                            |
| `apps/web/app/ueber-uns/verbandsstruktur/bearbeiten/page.tsx` | new — editor route                                  |
| `e2e/content-pages.e2e.ts`                                    | edit — add the page to `EDITABLE_PAGES`             |
| `docs/decisions/0028-org-chart-without-chart-library.md`      | new                                                 |

Splitting `buildTree` out as a pure function is deliberate: every structural
edge case is unit-testable without rendering, and the renderer stays a plain
mapping over an already-valid tree.

No changes are needed to `apps/web/next.config.ts` (the `/ueber-uns/*`
catch-all redirect already excludes `verbandsstruktur`) or to
`apps/web/app/api/content/pages/[...slug]/route.ts` (no slug allowlist; it
gates on `federal_board`).

## 5. Data shape

```ts
type Kasten = {
  ebene: "1" | "2" | "3" | "4";
  titel: string;
  untertitel: string;
  link: string;         // "" = not a link
  logo: string;         // FotoField URL, "" = none
  hervorheben: boolean; // brand-red accent
};

Organigramm: { kaesten: Kasten[] };
```

The block has no heading prop of its own — the existing Überschrift block already
covers that, and duplicating it would give the board two ways to title the same
section.

Authoring model is a **flat outline list**, not a nested structure: one
drag-reorderable Puck array, each row choosing its own level, exactly like
bullet indentation in a word processor. This keeps the sidebar one accordion
deep, makes cycles structurally impossible, and needs no stable IDs. Moving a
branch means dragging its rows.

`buildTree(kaesten): OrgNode[]` walks the list maintaining a stack; a row at
level N attaches to the nearest preceding row at level N−1. Malformed input is
never silently dropped:

| Input                    | Behaviour                                          |
| ------------------------ | -------------------------------------------------- |
| First row is not level 1 | Treated as a root                                  |
| Level jumps (1 → 3)      | Attaches to the nearest shallower ancestor         |
| Several level-1 rows     | Multiple roots, rendered side by side as a forest  |
| Empty list               | Renders nothing — no empty shell, no stray heading |

`titel` is the item summary in the Puck sidebar (`getItemSummary`), falling
back to "Neuer Kasten" so unnamed rows stay identifiable.

## 6. Rendering

Semantic nested `<ul>`/`<li>`; connectors are CSS `::before`/`::after`
pseudo-elements on the list items. Desktop (≥768px): children laid out in a
centered flex row beneath their parent. Below 768px: flex column with a left
connector rail and indentation. Same DOM in both cases — one breakpoint, no
JavaScript, no layout shift, nothing ever off-screen.

Deliberately **no `role="tree"`**: that ARIA role promises tree-widget keyboard
semantics this component does not implement. A nested list is already announced
correctly by screen readers.

Styling consumes tokens only, no inline hex/radius/shadow/duration values:

- Box — `rounded-bdas` (12px), `border-bdas-soft`, `shadow-bdas-card`; on hover
  `-translate-y-bdas-lift-sm` and `shadow-bdas-lift-sm` over `duration-bdas-soft`
  `ease-bdas`. This is the documented card idiom.
- Accent box (`hervorheben`) — brand red left border (`border-l-4
border-l-bdas-red`) plus `shadow-bdas-red-glow`: the design system's
  active/open idiom. A side-specific border colour also avoids an
  equal-specificity collision with `Card`'s own all-sides `border-bdas-soft`.
- Connectors — `border-bdas-strong`.
- Text — `text-bdas-ink` (title), `text-bdas-ink-body` (subtitle).

Links reuse `safeHref` and `isExternalHref` from `apps/web/app/_content/href.ts`
— the same validators the existing Button block uses, so there is no second URL
policy. A box with a valid `link` renders as a single `<a>` wrapping its
content; external targets additionally get `↗`, `target="_blank"` and
`rel="noopener noreferrer"`. An invalid or unsafe href (`javascript:`, `data:`,
protocol-relative, control-character smuggling) renders the box as plain
non-linked content rather than dropping it.

All text passes through React children and is therefore escaped structurally —
no `dangerouslySetInnerHTML`, no sanitiser, no SVG. The component renders on the
server in the `<Render>` path with no `ssr: false` and no hydration boundary,
which is what makes the chart crawlable, printable and keyboard-navigable.

Logos render as `<img>` with `alt=""` and `aria-hidden`, because the adjacent
title already carries the name — a repeated logo alt would double-announce.

## 7. Page conversion

`/ueber-uns/verbandsstruktur` is converted to the ADR 0024 editable-page
pattern, mirroring `apps/web/app/ueber-uns/bdaj/page.tsx`: `force-dynamic`,
`getPage(getDb(), "ueber-uns/verbandsstruktur")`, an `isFederalBoard` gate on
the "Seite bearbeiten" link, and `<Render>` of the stored document. The root
carries `breite: "breit"` so the chart has horizontal room.

**Accepted consequence:** per ADR 0024 the existing placeholder paragraph is
dropped with no static fallback, so the page shows only its `<h1>` until the
board saves a document — the same behaviour BDAJ has today. A starter chart will
be authored through the editor immediately after deploy so the page is never
publicly empty.

The block is registered in the shared palette and therefore appears on all
content pages (BSR, BDAJ, Impressum, Datenschutz, group pages, blog).
Confirmed as intended: consistent with ADR 0025, and harmless where unused.

## 8. Testing

**Unit — `org-tree.test.ts`:** well-formed 3-level tree; level jump 1→3;
leading non-root row; several level-1 roots; empty list; deep-then-shallow
return to a higher level.

**Component — `Organigramm.test.tsx`:** titles and subtitles render; an external
link gets `target`/`rel` and the marker; an internal link gets neither; a
`javascript:` href renders unlinked; `hervorheben` applies the accent; a logo
renders with an empty alt; an empty `kaesten` array renders nothing.

**E2E — `content-pages.e2e.ts`:** add Verbandsstruktur to `EDITABLE_PAGES`,
which covers visitor-sees-page-without-edit-button, anonymous `/bearbeiten`
returns 404, and federal board reaches the Puck editor.

**Sequencing note:** commits `b7fb2e1`, `991efd3` and `99d873f` were all fixes
to Puck drawer E2E selectors. A new palette item is exactly the kind of change
that has broken them before, so the block is registered and the content-pages
E2E run **before** the page conversion is started.

## 9. Rule compliance

- Rule 1/8 (table ownership, single public surface): no module tables or public
  surfaces are touched; the block is `apps/web` presentation over an opaque
  document.
- Rule 4 (shared concerns in `core/`): styling consumes `core/design-system`
  tokens; no ad-hoc values are introduced.
- Rule 6 (feature-flag gating): rides the existing `content` flag; no new flag.
- Rule 7 (namespaced migrations): none required.
- ADR 0023/0025 no-raw-HTML guarantee: preserved structurally, and is the
  primary reason a chart library was rejected.
