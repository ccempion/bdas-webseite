# Organigramm Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a board-editable `Organigramm` block to the shared Puck palette and convert `/ueber-uns/verbandsstruktur` from static placeholder copy into an editable content page that uses it.

**Architecture:** A flat, drag-reorderable Puck array of boxes — each row picking its own level 1–4 — is turned by a pure `buildTree` function into a nested tree, then rendered as semantic nested `<ul>`/`<li>` with connectors drawn by CSS pseudo-elements. No chart library: the component renders on the server, so the chart is crawlable, printable and keyboard-navigable, and all text stays React-escaped.

**Tech Stack:** TypeScript, Next.js 14 App Router, React Server Components, `@puckeditor/core` 0.22, Tailwind CSS via `@bdas/design-system` preset, Vitest (node environment, `renderToStaticMarkup`), Playwright.

## Global Constraints

- **Never inline a hex, radius, shadow or duration.** Consume design tokens: Tailwind classes (`rounded-bdas`, `border-bdas-soft`, `shadow-bdas-card`, `text-bdas-ink`, `text-bdas-ink-body`, `border-bdas-red`, `shadow-bdas-red-glow`) or, in `globals.css`, `theme("…")` lookups. If a value is missing from tokens, stop and raise it.
- **No raw HTML, ever.** No `dangerouslySetInnerHTML`, no sanitiser, no SVG `foreignObject`. All authored text renders as React children (ADR 0023/0025).
- **No `@bdas/content` module change.** No migration, no new feature flag — the block rides the existing `content` flag.
- **All UI copy is German.** Puck's own chrome is English (ADR 0023); everything we author is German.
- **Tests run in the `node` environment.** There is no jsdom and no `@testing-library/react`. Assert on markup via `renderToStaticMarkup` from `react-dom/server`, as `rich-text.test.ts` and `puck-config.test.ts` already do.
- **Comments explain why, not what.** The codebase does not narrate code.
- Unit tests: `pnpm --filter @bdas/web test`. Lint: `pnpm lint`. Typecheck: `pnpm --filter @bdas/web typecheck`. E2E: `pnpm e2e`.
- Work happens on branch `feat/organigramm-block`, already created.
- The pure logic module is `org-tree.ts`, not `organigramm.ts`: a file name differing from `Organigramm.tsx` only by the case of its first letter resolves ambiguously on case-insensitive filesystems (default macOS/Windows), since Vite's resolver treats the two as the same candidate.

---

### Task 1: ADR + `buildTree`

Records the decision, then builds the pure outline→tree function all rendering depends on. No React here — this file must stay importable from a plain node test.

**Files:**

- Create: `docs/decisions/0028-org-chart-without-chart-library.md`
- Create: `apps/web/app/_content/org-tree.ts`
- Test: `apps/web/app/_content/org-tree.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `type Kasten = { ebene: "1"|"2"|"3"|"4"; titel: string; untertitel: string; link: string; logo: string; hervorheben: boolean }`, `type OrgNode = { kasten: Kasten; kinder: OrgNode[] }`, and `buildTree(kaesten: Kasten[]): OrgNode[]`.

- [ ] **Step 1: Write the ADR**

Create `docs/decisions/0028-org-chart-without-chart-library.md`:

```markdown
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
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/app/_content/org-tree.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildTree, type Kasten } from "./org-tree";

const k = (ebene: Kasten["ebene"], titel: string): Kasten => ({
  ebene,
  titel,
  untertitel: "",
  link: "",
  logo: "",
  hervorheben: false,
});

/** Titles only, so the assertions read like the outline the board typed. */
const shape = (nodes: ReturnType<typeof buildTree>): unknown =>
  nodes.map((n) => ({ [n.kasten.titel]: shape(n.kinder) }));

describe("buildTree", () => {
  it("nests each row under the nearest preceding shallower row", () => {
    expect(
      shape(buildTree([k("1", "Bundeskonferenz"), k("2", "Bundesvorstand"), k("3", "AG Bildung")])),
    ).toEqual([{ Bundeskonferenz: [{ Bundesvorstand: [{ "AG Bildung": [] }] }] }]);
  });

  it("keeps siblings at the same level side by side", () => {
    expect(shape(buildTree([k("1", "BDAS"), k("2", "BSR"), k("2", "BDAJ")]))).toEqual([
      { BDAS: [{ BSR: [] }, { BDAJ: [] }] },
    ]);
  });

  it("returns to a higher level after a deeper branch", () => {
    expect(shape(buildTree([k("1", "BDAS"), k("2", "BuVo"), k("3", "AG"), k("2", "BSR")]))).toEqual(
      [{ BDAS: [{ BuVo: [{ AG: [] }] }, { BSR: [] }] }],
    );
  });

  it("attaches a skipped level to the nearest shallower ancestor", () => {
    expect(shape(buildTree([k("1", "BDAS"), k("3", "AG Bildung")]))).toEqual([
      { BDAS: [{ "AG Bildung": [] }] },
    ]);
  });

  it("treats a leading non-root row as a root rather than dropping it", () => {
    expect(shape(buildTree([k("3", "Verwaist"), k("4", "Kind")]))).toEqual([
      { Verwaist: [{ Kind: [] }] },
    ]);
  });

  it("supports several roots as a forest", () => {
    expect(shape(buildTree([k("1", "BDAS"), k("2", "BSR"), k("1", "AABF")]))).toEqual([
      { BDAS: [{ BSR: [] }] },
      { AABF: [] },
    ]);
  });

  it("returns no roots for an empty list", () => {
    expect(buildTree([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @bdas/web test organigramm`
Expected: FAIL — cannot resolve `./org-tree`.

- [ ] **Step 4: Write the implementation**

Create `apps/web/app/_content/org-tree.ts`:

```ts
/** One authored box. The board writes a flat outline; `ebene` carries the
 *  nesting the way indentation does in a word processor. */
export type Kasten = {
  ebene: "1" | "2" | "3" | "4";
  titel: string;
  untertitel: string;
  link: string;
  logo: string;
  hervorheben: boolean;
};

export type OrgNode = { kasten: Kasten; kinder: OrgNode[] };

/**
 * Turn the flat outline into a tree: each row attaches to the nearest
 * preceding row one or more levels shallower. Malformed input is never
 * dropped — a leading deep row becomes a root, and a skipped level attaches
 * to the nearest shallower ancestor.
 */
export function buildTree(kaesten: Kasten[]): OrgNode[] {
  const roots: OrgNode[] = [];
  const stack: { level: number; node: OrgNode }[] = [];

  for (const kasten of kaesten) {
    const level = Number(kasten.ebene);
    const node: OrgNode = { kasten, kinder: [] };

    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();

    const parent = stack[stack.length - 1];
    if (parent) parent.node.kinder.push(node);
    else roots.push(node);

    stack.push({ level, node });
  }

  return roots;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @bdas/web test organigramm`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add docs/decisions/0028-org-chart-without-chart-library.md \
        apps/web/app/_content/org-tree.ts \
        apps/web/app/_content/org-tree.test.ts
git commit -m "feat(content): build the Organigramm outline-to-tree function

Records ADR 0028: no chart library. d3-org-chart's node API is a raw HTML
string in an SVG foreignObject, which would breach the no-raw-HTML
guarantee of ADRs 0023/0025 and hide the page's content from crawlers."
```

---

### Task 2: Renderer + connector CSS

**Files:**

- Create: `apps/web/app/_content/Organigramm.tsx`
- Modify: `apps/web/app/globals.css` (append a `@layer base` block at the end)
- Test: `apps/web/app/_content/Organigramm.test.tsx`

**Interfaces:**

- Consumes: `buildTree`, `Kasten`, `OrgNode` from `./org-tree`; `safeHref`, `isExternalHref` from `./href`; `Card` from `@bdas/design-system`.
- Produces: `Organigramm({ kaesten }: { kaesten: Kasten[] })` — a React component returning `null` for an empty list.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_content/Organigramm.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { Organigramm } from "./Organigramm";
import type { Kasten } from "./org-tree";

const k = (over: Partial<Kasten> = {}): Kasten => ({
  ebene: "1",
  titel: "BDAS",
  untertitel: "",
  link: "",
  logo: "",
  hervorheben: false,
  ...over,
});

const html = (kaesten: Kasten[]) => renderToStaticMarkup(<Organigramm kaesten={kaesten} />);

describe("Organigramm", () => {
  it("renders titles and subtitles", () => {
    const out = html([k({ titel: "BDAJ", untertitel: "Bund der Alevitischen Jugendlichen" })]);
    expect(out).toContain("BDAJ");
    expect(out).toContain("Bund der Alevitischen Jugendlichen");
  });

  it("nests children inside the parent list item", () => {
    const out = html([k({ titel: "BDAS" }), k({ ebene: "2", titel: "BSR" })]);
    expect(out).toMatch(/BDAS[\s\S]*<ul>[\s\S]*BSR/);
  });

  it("renders nothing at all for an empty list", () => {
    expect(html([])).toBe("");
  });

  it("gives an external link target and rel", () => {
    const out = html([k({ link: "https://bdaj.de" })]);
    expect(out).toContain('href="https://bdaj.de"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("gives an internal link neither target nor rel", () => {
    const out = html([k({ link: "/gruppen/koeln" })]);
    expect(out).toContain('href="/gruppen/koeln"');
    expect(out).not.toContain("target=");
    expect(out).not.toContain("rel=");
  });

  it("drops an unsafe href but keeps the box readable", () => {
    const out = html([k({ titel: "Klick", link: "javascript:alert(1)" })]);
    expect(out).not.toContain("<a");
    expect(out).toContain("Klick");
  });

  it("escapes authored text rather than emitting markup", () => {
    const out = html([k({ titel: "<script>alert(1)</script>" })]);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("applies the accent styling when hervorheben is set", () => {
    const an = html([k({ hervorheben: true })]);
    expect(an).toContain("border-l-bdas-red");
    expect(an).toContain("shadow-bdas-red-glow");
    expect(html([k({ hervorheben: false })])).not.toContain("border-l-bdas-red");
  });

  it("renders a logo with an empty alt, since the title already names it", () => {
    const out = html([k({ logo: "https://cdn.example/logo.png" })]);
    expect(out).toContain('src="https://cdn.example/logo.png"');
    expect(out).toContain('alt=""');
  });

  it("omits the image element when no logo is set", () => {
    expect(html([k()])).not.toContain("<img");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bdas/web test Organigramm`
Expected: FAIL — cannot resolve `./Organigramm`.

- [ ] **Step 3: Write the component**

Create `apps/web/app/_content/Organigramm.tsx`:

```tsx
import React from "react";

import { Card } from "@bdas/design-system";

import { isExternalHref, safeHref } from "./href";
import { buildTree, type Kasten, type OrgNode } from "./org-tree";

/** A single box. An unsafe or empty href renders unlinked rather than
 *  dropping the box, so bad input never loses content. */
function Kachel({ kasten }: { kasten: Kasten }) {
  const href = safeHref(kasten.link);
  const extern = href !== null && isExternalHref(href);

  const inhalt = (
    <Card
      className={`w-48 px-4 py-3 text-center ${
        // The design system's accent idiom (CLAUDE.md §7): left border + halo,
        // as on an open accordion. A side-specific border colour also avoids
        // colliding with Card's own all-sides `border-bdas-soft`.
        kasten.hervorheben ? "border-l-4 border-l-bdas-red shadow-bdas-red-glow" : ""
      }`}
    >
      {kasten.logo ? (
        <img
          src={kasten.logo}
          alt=""
          aria-hidden
          className="mx-auto mb-2 h-10 w-auto object-contain"
        />
      ) : null}
      <p className="font-semibold text-bdas-ink">
        {kasten.titel}
        {extern ? <span aria-hidden> ↗</span> : null}
      </p>
      {kasten.untertitel ? (
        <p className="mt-1 text-sm text-bdas-ink-body">{kasten.untertitel}</p>
      ) : null}
    </Card>
  );

  if (href === null) return inhalt;

  return (
    <a
      href={href}
      className="block no-underline"
      {...(extern ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {inhalt}
    </a>
  );
}

function Knoten({ node }: { node: OrgNode }) {
  return (
    <li>
      <Kachel kasten={node.kasten} />
      {node.kinder.length > 0 ? (
        <ul>
          {node.kinder.map((kind, i) => (
            <Knoten key={i} node={kind} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Connectors are drawn by `.bdas-organigramm` rules in globals.css, which key
 *  off `li > ul` — so the root list gets no incoming line. */
export function Organigramm({ kaesten }: { kaesten: Kasten[] }) {
  const wurzeln = buildTree(kaesten);
  if (wurzeln.length === 0) return null;

  return (
    <div className="bdas-organigramm overflow-x-auto">
      <ul>
        {wurzeln.map((wurzel, i) => (
          <Knoten key={i} node={wurzel} />
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bdas/web test Organigramm`
Expected: PASS — 10 tests.

- [ ] **Step 5: Add the connector CSS**

Append to the end of `apps/web/app/globals.css`, after the existing `@layer base { … }` block (this is a second `@layer base` block — Tailwind merges them):

```css
@layer base {
  /* Org-chart connectors. Every rule keys off `li > ul`, so the outermost list
     gets no incoming line and the roots sit unconnected as a forest. */
  .bdas-organigramm ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    justify-content: center;
  }

  /* Only the root list is an unconnected forest, so only it gets a real
     flex gap. Nested lists get none: flex gap is empty space owned by
     neither sibling, which would leave the rail below as N disconnected
     dashes instead of one continuous line (spacing there comes from
     padding on the li instead, so adjacent padding boxes touch). */
  .bdas-organigramm > ul {
    gap: 24px;
  }

  .bdas-organigramm li {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .bdas-organigramm li > ul {
    position: relative;
    margin-top: 24px;
  }

  /* Drop from the parent box down to the sibling rail. */
  .bdas-organigramm li > ul::before {
    content: "";
    position: absolute;
    top: -24px;
    left: 50%;
    width: 1px;
    height: 24px;
    background: theme("borderColor.bdas-strong");
  }

  /* The 24px vertical gap plus 12px on each side — half the 24px sibling
     separation — so two adjacent li padding boxes touch at their shared
     edge and the rail segments below (left:0; right:0) join seamlessly. */
  .bdas-organigramm li > ul > li {
    padding: 24px 12px 0;
  }

  /* Stub from the rail down into this child. */
  .bdas-organigramm li > ul > li::before {
    content: "";
    position: absolute;
    top: 0;
    left: 50%;
    width: 1px;
    height: 24px;
    background: theme("borderColor.bdas-strong");
  }

  /* The rail itself, trimmed to a half-width at each end of the row. */
  .bdas-organigramm li > ul > li::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: theme("borderColor.bdas-strong");
  }

  .bdas-organigramm li > ul > li:first-child::after {
    left: 50%;
  }

  .bdas-organigramm li > ul > li:last-child::after {
    right: 50%;
  }

  .bdas-organigramm li > ul > li:only-child::after {
    content: none;
  }

  /* Below the md breakpoint the tree collapses to an indented list with a left
     rail, so nothing is ever off-screen on a phone. */
  @media (max-width: 767px) {
    .bdas-organigramm ul {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .bdas-organigramm li {
      align-items: stretch;
    }

    .bdas-organigramm li > ul {
      margin-top: 12px;
      margin-left: 24px;
      padding-left: 16px;
      border-left: 1px solid theme("borderColor.bdas-strong");
      gap: 12px;
    }

    .bdas-organigramm li > ul::before,
    .bdas-organigramm li > ul > li::before {
      content: none;
    }

    /* Zero out the desktop horizontal padding too — the indented-list rail
       below comes from margin-left/padding-left/border-left on the ul, and
       leftover 12px side padding here would just add stray indentation. */
    .bdas-organigramm li > ul > li {
      padding: 0;
    }

    /* Short tick from the left rail across to the box. */
    .bdas-organigramm li > ul > li::after,
    .bdas-organigramm li > ul > li:first-child::after,
    .bdas-organigramm li > ul > li:last-child::after,
    .bdas-organigramm li > ul > li:only-child::after {
      content: "";
      top: 24px;
      left: -16px;
      right: auto;
      width: 16px;
      height: 1px;
    }
  }
}
```

- [ ] **Step 6: Verify nothing regressed**

Run: `pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm lint`
Expected: all PASS. CSS is not covered by the unit tests — it is verified visually in Task 4, Step 6.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_content/Organigramm.tsx \
        apps/web/app/_content/Organigramm.test.tsx \
        apps/web/app/globals.css
git commit -m "feat(content): render the Organigramm as a semantic nested list

Connectors are CSS pseudo-elements over real <ul>/<li>, so the chart is
server-rendered, crawlable and keyboard-navigable. Collapses to an
indented list below 768px."
```

---

### Task 3: Register the block in the Puck palette

Deliberately ahead of the page conversion: a new drawer item is exactly the change that broke the Puck E2E selectors in `b7fb2e1`, `991efd3` and `99d873f`, so the drawer is re-verified before anything else is built on top.

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx`
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `Organigramm` from `./Organigramm`, `Kasten` from `./org-tree`, `FotoField` from `./FotoField` (already imported in this file).
- Produces: `puckConfig.components.Organigramm` with a single `kaesten` array field.

- [ ] **Step 1: Write the failing test**

Append these cases inside the existing `describe("puckConfig", …)` block in `apps/web/app/_content/puck-config.test.ts`:

```ts
it("exposes the Organigramm block with the six box fields", () => {
  const kaesten = puckConfig.components.Organigramm?.fields?.kaesten;
  if (kaesten?.type !== "array") throw new Error("kaesten must be an array field");
  expect(Object.keys(kaesten.arrayFields).sort()).toEqual([
    "ebene",
    "hervorheben",
    "link",
    "logo",
    "titel",
    "untertitel",
  ]);
});

it("offers four Organigramm levels", () => {
  const kaesten = puckConfig.components.Organigramm?.fields?.kaesten;
  if (kaesten?.type !== "array") throw new Error("kaesten must be an array field");
  const ebene = kaesten.arrayFields.ebene;
  if (ebene?.type !== "select") throw new Error("ebene must be a select field");
  expect(ebene.options.map((o) => o.value)).toEqual(["1", "2", "3", "4"]);
});

it("summarises a box by level and title with a German fallback", () => {
  const kaesten = puckConfig.components.Organigramm?.fields?.kaesten;
  if (kaesten?.type !== "array" || !kaesten.getItemSummary) {
    throw new Error("array field with getItemSummary expected");
  }
  const box = {
    ebene: "2",
    titel: "BDAJ",
    untertitel: "",
    link: "",
    logo: "",
    hervorheben: false,
  };
  expect(kaesten.getItemSummary(box, 0)).toBe("2 · BDAJ");
  expect(kaesten.getItemSummary({ ...box, titel: "" }, 0)).toBe("Neuer Kasten");
});

it("starts an Organigramm empty so an unfilled block renders nothing", () => {
  expect(puckConfig.components.Organigramm?.defaultProps).toEqual({ kaesten: [] });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bdas/web test puck-config`
Expected: FAIL — `puckConfig.components.Organigramm` is undefined.

- [ ] **Step 3: Register the block**

In `apps/web/app/_content/puck-config.tsx`:

Add to the imports, alongside the existing `./FotoField` and `./RichTextField` imports:

```tsx
import { Organigramm } from "./Organigramm";
import type { Kasten } from "./org-tree";
```

Add to the `Blocks` type, after the `Spalten` entry:

```ts
  Organigramm: { kaesten: Kasten[] };
```

Add to `puckConfig.components`, after the `Spalten` component:

```tsx
    Organigramm: {
      label: "Organigramm",
      fields: {
        kaesten: {
          type: "array",
          label: "Kästen",
          arrayFields: {
            ebene: {
              type: "select",
              label: "Ebene",
              options: [
                { label: "1 — oberste Ebene", value: "1" },
                { label: "2", value: "2" },
                { label: "3", value: "3" },
                { label: "4", value: "4" },
              ],
            },
            titel: { type: "text", label: "Titel" },
            untertitel: { type: "text", label: "Untertitel" },
            link: { type: "text", label: "Link (optional)" },
            logo: {
              type: "custom",
              label: "Logo (optional)",
              render: ({ value, onChange }) => <FotoField value={value} onChange={onChange} />,
            },
            hervorheben: {
              type: "radio",
              label: "Hervorheben",
              options: [
                { label: "Nein", value: false },
                { label: "Ja", value: true },
              ],
            },
          },
          defaultItemProps: {
            ebene: "1",
            titel: "",
            untertitel: "",
            link: "",
            logo: "",
            hervorheben: false,
          },
          getItemSummary: (kasten) =>
            kasten.titel ? `${kasten.ebene} · ${kasten.titel}` : "Neuer Kasten",
        },
      },
      defaultProps: { kaesten: [] },
      render: ({ kaesten }) => <Organigramm kaesten={kaesten} />,
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Verify the Puck drawer still works**

Run: `pnpm e2e content-pages`
Expected: PASS. If a drawer selector now matches two elements, the new "Organigramm" label has collided with an existing selector — fix the **test selector** to disambiguate (as `99d873f` did), not the block label.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(content): add the Organigramm block to the shared palette"
```

---

### Task 4: Convert the Verbandsstruktur page

**Files:**

- Modify: `apps/web/app/ueber-uns/verbandsstruktur/page.tsx`
- Create: `apps/web/app/ueber-uns/verbandsstruktur/bearbeiten/page.tsx`
- Modify: `e2e/content-pages.e2e.ts:15-28` (the `EDITABLE_PAGES` array)

**Interfaces:**

- Consumes: `puckConfig`, `breiteClass`, `withBreite` from `../../_content/puck-config`; `PuckEditor` from `../../../_content/PuckEditor`; `getPage`, `getDb`, `isFlagOn`, `isFederalBoard`, `loadCurrentMember`, `requirePublicShellFlag`.
- Produces: nothing consumed by later tasks.

No `next.config.ts` change is needed — the `/ueber-uns/:slug` catch-all redirect at line 51 already excludes `verbandsstruktur`. No API change is needed — `app/api/content/pages/[...slug]/route.ts` has no slug allowlist and gates on `federal_board`.

- [ ] **Step 1: Convert the public page**

Replace the entire contents of `apps/web/app/ueber-uns/verbandsstruktur/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { breiteClass, puckConfig, withBreite } from "../../_content/puck-config";
import { loadCurrentMember } from "../../_dashboard/session";
import { requirePublicShellFlag } from "../../_public/flag";

export const dynamic = "force-dynamic";

const SLUG = "ueber-uns/verbandsstruktur";

export const metadata: Metadata = {
  title: "Verbandsstruktur",
  description: "Wie der BDAS organisiert ist: Hochschulgruppen, Bundesvorstand, Bundeskonferenz.",
};

/**
 * Verbandsstruktur — board-editable via Puck (ADR 0024), built around the
 * Organigramm block (ADR 0028). `breit` gives the chart horizontal room.
 */
export default async function VerbandsstrukturPage() {
  requirePublicShellFlag();

  const contentOn = isFlagOn("content");
  const page = contentOn ? await getPage(getDb(), SLUG) : null;
  const me = contentOn ? await loadCurrentMember() : null;
  const canEdit = me !== null && isFederalBoard(me.grants);

  return (
    <main className="py-12">
      <div
        className={`mx-auto flex w-full flex-col items-start gap-4 px-4 sm:flex-row sm:justify-between ${breiteClass("breit")}`}
      >
        <h1 className="break-words text-3xl font-semibold text-bdas-ink">Verbandsstruktur</h1>
        {canEdit ? (
          <Link
            href="/ueber-uns/verbandsstruktur/bearbeiten"
            className="inline-flex shrink-0 items-center rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
          >
            Seite bearbeiten
          </Link>
        ) : null}
      </div>
      {page ? (
        <div className="mt-6">
          <Render config={puckConfig} data={withBreite(page.data as Data, "breit")} />
        </div>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 2: Create the editor route**

Create `apps/web/app/ueber-uns/verbandsstruktur/bearbeiten/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { PuckEditor } from "../../../_content/PuckEditor";
import { loadCurrentMember } from "../../../_dashboard/session";

export const dynamic = "force-dynamic";

const SLUG = "ueber-uns/verbandsstruktur";

export const metadata: Metadata = {
  title: "Seite bearbeiten — Verbandsstruktur",
  robots: { index: false },
};

/** Editor is board-only; everyone else gets a 404 (no existence leak, spec §6). */
export default async function VerbandsstrukturBearbeitenPage() {
  if (!isFlagOn("public_shell") || !isFlagOn("content")) notFound();

  const me = await loadCurrentMember();
  if (!me || !isFederalBoard(me.grants)) notFound();

  const page = await getPage(getDb(), SLUG);
  const initialData = (page?.data ?? { root: { props: {} }, content: [] }) as Data;

  return <PuckEditor slug={SLUG} initialData={initialData} />;
}
```

- [ ] **Step 3: Add the page to the E2E coverage list**

In `e2e/content-pages.e2e.ts`, add this entry to `EDITABLE_PAGES` after the BDAJ entry:

```ts
  {
    name: "Verbandsstruktur",
    path: "/ueber-uns/verbandsstruktur",
    heading: "Verbandsstruktur",
  },
```

- [ ] **Step 4: Run typecheck, lint and unit tests**

Run: `pnpm --filter @bdas/web typecheck && pnpm lint && pnpm --filter @bdas/web test`
Expected: all PASS.

- [ ] **Step 5: Run the content-pages E2E**

Run: `pnpm e2e content-pages`
Expected: PASS, now including the three Verbandsstruktur cases (visitor sees the page without an edit button; anonymous `/bearbeiten` is a 404; federal board reaches the Puck editor).

- [ ] **Step 6: Verify the chart visually**

Run `pnpm --filter @bdas/web dev`, sign in as a federal-board member, open
`/ueber-uns/verbandsstruktur/bearbeiten`, add an Organigramm block and author
this outline:

| Ebene | Titel                    | Untertitel                          | Link                              | Hervorheben |
| ----- | ------------------------ | ----------------------------------- | --------------------------------- | ----------- |
| 1     | Bundeskonferenz          | Höchstes beschlussfassendes Gremium |                                   | Nein        |
| 2     | Bundesvorstand           | Koordiniert die gemeinsame Arbeit   |                                   | Ja          |
| 2     | Bundessprecher\*innenrat |                                     | /ueber-uns/bundessprecherinnenrat | Nein        |
| 2     | BDAJ                     | Bund der Alevitischen Jugendlichen  | https://bdaj.de                   | Nein        |

Publish, then confirm on the public page:

- connector lines join each child to its parent, with the rail trimmed at both ends of the row;
- the Bundesvorstand box shows the red left accent border and halo;
- the BDAJ box shows ↗ and opens in a new tab;
- the BSR box navigates internally in the same tab;
- boxes lift on hover;
- at a 375px-wide viewport the chart becomes an indented list with a left rail and the page does **not** scroll horizontally.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/ueber-uns/verbandsstruktur/page.tsx \
        apps/web/app/ueber-uns/verbandsstruktur/bearbeiten/page.tsx \
        e2e/content-pages.e2e.ts
git commit -m "feat(web): make Verbandsstruktur a board-editable content page

Drops the placeholder copy with no static fallback, per ADR 0024 — the
page shows only its heading until the board publishes a document."
```

---

### Task 5: Full verification

**Files:** none — this task only runs the suites and reports.

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm test`
Expected: PASS. Module integration tests need Docker Postgres (`docker compose up -d`); they skip when the database is unreachable, which is fine — this change touches no module.

- [ ] **Step 2: Run lint and typecheck across the workspace**

Run: `pnpm lint && pnpm --filter @bdas/web typecheck`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `pnpm --filter @bdas/web build`
Expected: PASS. A failure mentioning a missing column would mean an unapplied migration — not expected here, since this change adds none.

- [ ] **Step 4: Run the full E2E suite**

Run: `pnpm e2e`
Expected: PASS. Report any failure with its output rather than retrying blindly.

- [ ] **Step 5: Report**

State plainly which suites passed, and paste the output of any that did not.

---

## Post-merge note

The Verbandsstruktur page renders only its `<h1>` until a document is saved — the accepted ADR 0024 consequence. Author the starter chart through the editor immediately after deploy so the page is never publicly empty. `BDAS_FLAG_CONTENT` and `BDAS_FLAG_PUBLIC_SHELL` are already on in production; no flag flip is part of this work.
