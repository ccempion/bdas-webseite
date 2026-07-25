# ADR 0028 — Org chart without a chart library

- **Status:** Accepted
- **Date:** 2026-07-25
- **Supersedes:** —
- **Superseded by:** —

## Context

The Verbandsstruktur page needs a visual organisational chart of the
federation — roughly 8–15 boxes over 3 levels, linking out to bdaj.de, the
AABF site and platform pages. `bumbeishvili/org-chart` (`d3-org-chart`) was
proposed. It was evaluated against `@xyflow/react`,
`react-organizational-chart`, `react-d3-tree`, and a dependency-free custom
block.

## Decision

Build a custom `Organigramm` Puck block. No chart library.

`d3-org-chart` is well built for its use case — a zoomable directory of
thousands of nodes — but is wrong here on four counts:

1. Its node API is a raw HTML string (`nodeContent: d => '<div>…</div>'`)
   injected via d3's `.html()` into an SVG `<foreignObject>` — functionally
   `dangerouslySetInnerHTML`. ADR 0023 promises "no raw-HTML block, ever" and
   ADR 0025 reaffirms it; board-authored titles and hrefs would flow into that
   string, so the guarantee would rest on hand-rolled escaping.
2. The page is public and crawler-indexed (`apps/web/app/sitemap.ts`). Content
   painted client-side into a `<foreignObject>` is invisible to search engines
   and effectively to screen readers — on a page whose whole purpose is to
   state how the federation is organised.
3. ~42 kB minified plus six d3 sub-packages and `d3-flextree@2.1.2`, which is
   WTFPL-licensed and depends on d3-hierarchy **v1**, shipping a second copy
   alongside v3.
4. Pan, zoom and expand/collapse are its selling points and are all liabilities
   at this size: a scroll trap on mobile, content that no longer flows with the
   page.

React Flow is the healthiest package and uses real React nodes, but at 57 kB
gzip it is a node-editor around a client-only pan/zoom canvas — same SEO and
accessibility trade-off, more weight. `react-organizational-chart` is
unreleased since April 2023 and would pull `@emotion/css` into a Tailwind
codebase. `react-d3-tree` drags in d3-hierarchy v1, uuid v8 and a forked
`react-transition-group`.

## Consequences

- Server rendering, SEO, keyboard access, printing and token styling come free;
  the custom block is less code than the integration wrapper would have been.
- Connector geometry is ours to maintain — CSS pseudo-elements in
  `globals.css`, following the accordion idiom already there.
- No pan/zoom, no expand/collapse, no image export. If the chart ever needs to
  enumerate every Hochschulgruppe, this decision should be revisited.
