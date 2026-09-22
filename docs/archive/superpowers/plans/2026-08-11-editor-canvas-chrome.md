# Editor-Canvas-Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Puck canvas shows the real public header and footer around the content column, so the board edits a page that looks like the page — while visitors see exactly what they see today.

**Architecture:** Both shell components split into an async data half and a pure view half. The `/bearbeiten` routes read the two footer flags and pass them to `PuckEditor`, which forwards them through `<Puck metadata>`; `root.render` reads `puck.metadata.chrome` and wraps the column in the two views when `puck.isEditing`. The chrome is inert — `pointer-events-none` and `aria-hidden`.

**Tech Stack:** TypeScript, React, Next.js 14 App Router, Puck (`@puckeditor/core` 0.22.2), Tailwind via `core/design-system` tokens, Vitest (node environment), Playwright (E2E).

Implements PRs 2 and 3 of `docs/superpowers/specs/2026-08-10-editor-realismus-design.md` §5. PR 1 (`BlockPlatzhalter`) shipped in #165. Branches from `feat/fliesstext-bilder`.

## This is two PRs, not one

CLAUDE.md §4 is one module per PR, and the spec (§5) splits these deliberately: the shell refactor touches `_public/`, which is outside the content editor and deserves its own review.

| PR  | Branch                        | Tasks | Reviewable alone                         |
| --- | ----------------------------- | ----- | ---------------------------------------- |
| 2   | `refactor/public-shell-views` | 1–2   | yes — pure refactor, no behaviour change |
| 3   | `feat/editor-canvas-chrome`   | 3–5   | depends on 2                             |

## Global Constraints

- **Vitest runs in `environment: "node"`** (`vitest.config.ts:5`). React is tested via `renderToStaticMarkup`. **Do not add jsdom.**
- **Vitest compiles JSX with the classic runtime**, so every component rendered from a test must import React in its own file. `PublicHeader.tsx` and `PublicFooter.tsx` currently do not — the new view files must, and the two existing files need it too once they render a view. Verified: without it the render throws `React is not defined`, while the Next build (automatic runtime) is unaffected.
- **`next/image` cannot render under vitest.** The footer imports `../../public/bdas-logo.png`; Vite resolves that to a URL string, and `next/image` then throws `Image with src "/public/bdas-logo.png" is missing required "width" property`. Tests that render the footer view **must** `vi.mock("next/image", …)`. Verified by spike. Do not add width/height to the production `<Image>` to work around this — that changes what ships.
- **Public rendering must not change.** This is a pure refactor in PR 2. The `public-shell` and `content-pages` E2E specs already drive the header, footer and editor; they must stay green **with no edits**. If a spec needs changing, the refactor was not behaviour-preserving.
- **The chrome shows the visitor's view**, not the signed-in board member's: `navItems({ isLoggedIn: false })`, no Konto pill, no approvals badge, no "Meine Gruppe" (spec §2 non-goals).
- **The chrome is decoration, never a block.** It lives in `root.render`, never in `components` — the board must not be able to edit or drag it.
- **The chrome must be inert.** Without `pointer-events-none`, a stray click on a nav `<Link>` navigates the _iframe_ away and the board loses the editor (spec §4).
- **All user-facing copy is German.**
- **Never inline a hex, radius, shadow, or duration** (CLAUDE.md §7). The views move existing markup; they introduce no new values.
- **Commit after every task**, conventional-commit style.
- Before each commit run: `pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint`

---

## File Structure

| File                                             | Responsibility                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `apps/web/app/_public/PublicHeaderView.tsx`      | **New.** Pure, client-safe header markup. All data arrives as props.   |
| `apps/web/app/_public/PublicFooterView.tsx`      | **New.** Pure footer markup; the two `isFlagOn` reads become props.    |
| `apps/web/app/_public/PublicHeaderView.test.tsx` | **New.** Visitor-case nav rendering.                                   |
| `apps/web/app/_public/PublicFooterView.test.tsx` | **New.** Flag-prop behaviour.                                          |
| `apps/web/app/_public/PublicHeader.tsx`          | **Modify.** Keeps its data loading; renders the view.                  |
| `apps/web/app/_public/PublicFooter.tsx`          | **Modify.** Reads the flags; renders the view.                         |
| `apps/web/app/_content/PuckEditor.tsx`           | **Modify.** New `chrome` prop, forwarded via `<Puck metadata>`.        |
| `apps/web/app/_content/puck-config.tsx`          | **Modify.** `root.render` wraps the column in the chrome when editing. |
| `apps/web/app/_content/puck-config.test.ts`      | **Modify.** Chrome-in-root assertions.                                 |
| The seven `*/bearbeiten/page.tsx` routes         | **Modify.** Read the two flags and pass `chrome`.                      |
| `e2e/content-pages.e2e.ts`                       | **Modify.** Canvas-chrome and no-double-header assertions.             |

The seven Puck editor routes are `ueber-uns`, `ueber-uns/bdaj`, `ueber-uns/verbandsstruktur`, `ueber-uns/bundessprecherinnenrat`, `impressum`, `datenschutz`, `gruppen/[slug]`, each `…/bearbeiten/page.tsx`. `blog/[slug]/bearbeiten` is the Tiptap post editor and is **not** in scope.

---

## PR 2 — the view split

### Task 1: `PublicHeaderView`

**Files:**

- Create: `apps/web/app/_public/PublicHeaderView.tsx`
- Create: `apps/web/app/_public/PublicHeaderView.test.tsx`
- Modify: `apps/web/app/_public/PublicHeader.tsx`

**Interfaces:**

- Consumes: `NavItem` from `./nav-items`.
- Produces:

```tsx
export function PublicHeaderView(props: {
  items: NavItem[];
  konto: { displayName: string; isBoard: boolean; openCount: number } | null;
}): JSX.Element;
```

`konto: null` is the visitor case — it renders the "Mitglied werden" and "Anmelden" entries instead of the account dropdown, which is exactly what the canvas chrome needs.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_public/PublicHeaderView.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { navItems } from "./nav-items";
import { PublicHeaderView } from "./PublicHeaderView";

const visitor = () => <PublicHeaderView items={navItems({ isLoggedIn: false })} konto={null} />;

describe("PublicHeaderView", () => {
  it("renders one banner landmark", () => {
    const out = renderToStaticMarkup(visitor());
    expect(out.match(/<header/g)?.length).toBe(1);
  });

  it("shows the visitor's entries, not an account menu", () => {
    const out = renderToStaticMarkup(visitor());
    expect(out).toContain("Mitglied werden");
    expect(out).toContain("Anmelden");
    expect(out).not.toContain("Mein Konto");
    expect(out).not.toContain("Abmelden");
  });

  it("renders every nav item it is given", () => {
    const out = renderToStaticMarkup(
      <PublicHeaderView
        items={[
          { label: "Unsere Arbeit", href: "/unsere-arbeit" },
          { label: "Über uns", children: [{ label: "Kurzportrait", href: "/ueber-uns" }] },
        ]}
        konto={null}
      />,
    );
    expect(out).toContain("Unsere Arbeit");
    expect(out).toContain("Über uns");
    expect(out).toContain('href="/ueber-uns"');
  });

  it("shows the account menu and approvals count for a signed-in board member", () => {
    const out = renderToStaticMarkup(
      <PublicHeaderView items={[]} konto={{ displayName: "Aylin", isBoard: true, openCount: 3 }} />,
    );
    expect(out).toContain("Aylin");
    expect(out).toContain("Mein Konto");
    expect(out).toContain("Board-Bereich");
    expect(out).toContain("Abmelden");
    expect(out).not.toContain("Mitglied werden");
  });

  it("hides the Board-Bereich entry from a non-board member", () => {
    const out = renderToStaticMarkup(
      <PublicHeaderView
        items={[]}
        konto={{ displayName: "Deniz", isBoard: false, openCount: 0 }}
      />,
    );
    expect(out).toContain("Mein Konto");
    expect(out).not.toContain("Board-Bereich");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @bdas/web test -- PublicHeaderView`
Expected: FAIL — `Failed to load url ./PublicHeaderView`.

- [ ] **Step 3: Move the markup into the view**

Create `apps/web/app/_public/PublicHeaderView.tsx`. Move **all** of the JSX currently returned by `PublicHeader` — including the `PILL` and `DROPDOWN_LINK` constants and the `DesktopItem` component — into this file unchanged. Only the data source changes: everything that was a local `const` computed from `loadCurrentMember` becomes a prop.

The file begins:

```tsx
import Link from "next/link";
import React from "react";

import { Badge } from "@bdas/design-system";

import { BrandLink } from "../../components/BrandLink";
import { MobileMenuAutoClose } from "./MobileMenuAutoClose";
import { NavAutoClose } from "./NavAutoClose";
import { type NavItem } from "./nav-items";
```

and the signature is:

```tsx
/** Pure header markup. Every server-only read — session, approvals, group —
 *  happens in `PublicHeader` and arrives here as props, which is what lets the
 *  Puck canvas render the visitor's chrome inside its client-side iframe. */
export function PublicHeaderView({
  items,
  konto,
}: {
  items: NavItem[];
  konto: { displayName: string; isBoard: boolean; openCount: number } | null;
}) {
```

Inside, substitute the four values the old component computed:

| Was                            | Becomes             |
| ------------------------------ | ------------------- |
| `items`                        | `items` (prop)      |
| `me ? … : …` (signed-in check) | `konto ? … : …`     |
| `displayName`                  | `konto.displayName` |
| `isBoard`                      | `konto.isBoard`     |
| `openCount`                    | `konto.openCount`   |

The mobile `<summary>`'s `<Badge count={openCount} …/>` becomes `<Badge count={konto?.openCount ?? 0} …/>` — it renders for visitors too, and `Badge` already renders nothing at zero.

- [ ] **Step 4: Reduce `PublicHeader` to data loading**

Replace the body of `apps/web/app/_public/PublicHeader.tsx` so it keeps every existing read and hands the results over. Delete the markup, the `PILL`/`DROPDOWN_LINK` constants and `DesktopItem` — they now live in the view.

```tsx
import { canAdministerBoard } from "@bdas/dashboard-shell";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroup } from "@bdas/groups";

import { loadApprovalCounts } from "../_dashboard/approvals";
import { loadCurrentMember } from "../_dashboard/session";
import { navItems } from "./nav-items";
import { PublicHeaderView } from "./PublicHeaderView";

export async function PublicHeader() {
  const me = await loadCurrentMember();
  const isBoard = me ? canAdministerBoard(me.grants) : false;
  const approvals = isBoard ? await loadApprovalCounts() : null;
  const openCount = approvals?.total ?? 0;

  // "Meine Gruppe" links into the public group page; it needs the group's slug
  // and only makes sense while groups are enabled and the group is not archived
  // (its public page 404s otherwise).
  const groupId = me?.member?.primaryGroupId ?? null;
  const group = groupId && isFlagOn("groups") ? await getGroup(getDb(), groupId) : null;
  const myGroup =
    group && group.status !== "archived" ? { slug: group.slug, name: group.name } : undefined;

  // Files access is per member-kind, independent of the group page; flag-gate it
  // so the item never renders while BDAS_FLAG_FILES is off (no dead link).
  const showFiles = Boolean(me?.member) && isFlagOn("files");

  const items = navItems({
    isLoggedIn: Boolean(me),
    ...(myGroup ? { myGroup } : {}),
    showFiles,
  });

  return (
    <PublicHeaderView
      items={items}
      konto={me ? { displayName: me.member?.firstName ?? "Konto", isBoard, openCount } : null}
    />
  );
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @bdas/web test -- PublicHeaderView`
Expected: PASS, five tests.

- [ ] **Step 6: Run the full gate and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_public
git commit -m "refactor(web): split PublicHeader into data and view"
```

---

### Task 2: `PublicFooterView`

**Files:**

- Create: `apps/web/app/_public/PublicFooterView.tsx`
- Create: `apps/web/app/_public/PublicFooterView.test.tsx`
- Modify: `apps/web/app/_public/PublicFooter.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces:

```tsx
export function PublicFooterView(props: {
  privacyUrl: string;
  imprintUrl: string;
  showEvents: boolean;
  showGroups: boolean;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_public/PublicFooterView.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/image cannot render here: Vite resolves the logo import to a URL string
// and next/image then demands an explicit width. The logo is not what these
// tests are about.
vi.mock("next/image", () => ({
  default: ({ alt, className }: { alt: string; className?: string }) =>
    React.createElement("img", { alt, className }),
}));

import { PublicFooterView } from "./PublicFooterView";

const view = (props: Partial<Parameters<typeof PublicFooterView>[0]> = {}) =>
  renderToStaticMarkup(
    <PublicFooterView
      privacyUrl="/datenschutz"
      imprintUrl="/impressum"
      showEvents={false}
      showGroups={false}
      {...props}
    />,
  );

describe("PublicFooterView", () => {
  it("always shows the legal links it is given", () => {
    const out = view();
    expect(out).toContain('href="/datenschutz"');
    expect(out).toContain('href="/impressum"');
  });

  it("respects a custom legal URL pair", () => {
    const out = view({ privacyUrl: "/legal/privacy", imprintUrl: "/legal/imprint" });
    expect(out).toContain('href="/legal/privacy"');
    expect(out).toContain('href="/legal/imprint"');
  });

  it("hides Events and Gruppen when both flags are off", () => {
    const out = view();
    expect(out).not.toContain('href="/events"');
    expect(out).not.toContain('href="/gruppen"');
  });

  it("shows each of Events and Gruppen independently", () => {
    expect(view({ showEvents: true })).toContain('href="/events"');
    expect(view({ showEvents: true })).not.toContain('href="/gruppen"');
    expect(view({ showGroups: true })).toContain('href="/gruppen"');
    expect(view({ showGroups: true })).not.toContain('href="/events"');
  });

  it("renders one contentinfo landmark", () => {
    expect(view().match(/<footer/g)?.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm --filter @bdas/web test -- PublicFooterView`
Expected: FAIL — `Failed to load url ./PublicFooterView`.

- [ ] **Step 3: Move the markup into the view**

Create `apps/web/app/_public/PublicFooterView.tsx` holding everything `PublicFooter` currently renders, with the two `isFlagOn` calls replaced by props and a React import added:

```tsx
import Image from "next/image";
import Link from "next/link";
import React from "react";

import logo from "../../public/bdas-logo.png";

const LINK = "hover:text-bdas-red hover:underline";

/** Pure footer markup. The two flag reads live in `PublicFooter`, so this
 *  renders unchanged inside the Puck canvas, which has no server context. */
export function PublicFooterView({
  privacyUrl,
  imprintUrl,
  showEvents,
  showGroups,
}: {
  privacyUrl: string;
  imprintUrl: string;
  showEvents: boolean;
  showGroups: boolean;
}) {
```

The body is the existing footer JSX verbatim, with exactly two substitutions:

- `{isFlagOn("events") && (` → `{showEvents && (`
- `{isFlagOn("groups") && (` → `{showGroups && (`

Keep `const year = new Date().getFullYear();` at the top of the body.

- [ ] **Step 4: Reduce `PublicFooter` to the flag reads**

Replace `apps/web/app/_public/PublicFooter.tsx` entirely:

```tsx
import React from "react";

import { isFlagOn } from "@bdas/feature-flags";

import { PublicFooterView } from "./PublicFooterView";

/** Public-site footer: contact, quick links, partner orgs, legal, socials.
 *  Contact details and social handles are placeholders (spec §8 open items). */
export function PublicFooter({
  privacyUrl,
  imprintUrl,
}: {
  privacyUrl: string;
  imprintUrl: string;
}) {
  return (
    <PublicFooterView
      privacyUrl={privacyUrl}
      imprintUrl={imprintUrl}
      showEvents={isFlagOn("events")}
      showGroups={isFlagOn("groups")}
    />
  );
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @bdas/web test -- PublicFooterView`
Expected: PASS, five tests.

- [ ] **Step 6: Run the full gate, build, and commit**

The build matters here: the footer is in the root layout, so a broken import breaks every page.

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
pnpm --filter @bdas/web build
git add apps/web/app/_public
git commit -m "refactor(web): split PublicFooter into data and view"
```

**PR 2 ends here.** Open it, confirm the `public-shell` E2E is green with no edits, and merge before starting PR 3.

---

## PR 3 — chrome in the canvas

### Task 3: Feed the canvas

**Files:**

- Modify: `apps/web/app/_content/PuckEditor.tsx`
- Modify: the seven `*/bearbeiten/page.tsx` routes listed in the File Structure section

**Interfaces:**

- Consumes: nothing new.
- Produces: `PuckEditor` gains a **required** prop `chrome: { events: boolean; groups: boolean }`, forwarded as `<Puck metadata={{ chrome }}>`. Required, not optional, so no route can silently forget it and render a footer with the wrong links.

`<Puck metadata?: Metadata>` exists in the installed 0.22.2 (`index.d.ts:152`), and `root.render` receives it through `puck.metadata` because `DefaultRootRenderProps = WithPuckProps<WithChildren<Props>>` (`actions-Csn3gOP8.d.ts:362`). Verified against the installed package.

- [ ] **Step 1: Add the prop and forward it**

In `apps/web/app/_content/PuckEditor.tsx`, extend the props and pass `metadata`:

```tsx
export function PuckEditor({
  slug,
  initialData,
  defaultBreite = "schmal",
  chrome,
}: {
  slug: string;
  initialData: Data;
  defaultBreite?: Breite;
  /** Flag values the canvas chrome's footer needs. Read on the server by each
   *  /bearbeiten route — the canvas is a client tree and cannot read flags. */
  chrome: { events: boolean; groups: boolean };
}) {
```

and on the `<Puck>` element, beside `config` and `data`:

```tsx
        metadata={{ chrome }}
```

- [ ] **Step 2: Pass it from all seven routes**

Each route already imports `isFlagOn` from `@bdas/feature-flags` for its own gate. In each of the seven files, change the render to:

```tsx
return (
  <PuckEditor
    slug={SLUG}
    initialData={initialData}
    chrome={{ events: isFlagOn("events"), groups: isFlagOn("groups") }}
  />
);
```

Keep each route's existing extra props — `gruppen/[slug]/bearbeiten/page.tsx` and `ueber-uns/bundessprecherinnenrat/bearbeiten/page.tsx` pass a `defaultBreite`; do not drop it. Read each file before editing rather than assuming its shape.

- [ ] **Step 3: Verify every route was updated**

Run: `pnpm --filter @bdas/web typecheck`
Expected: PASS. Because `chrome` is required, a missed route is a type error — this step is the check, which is why the prop is not optional.

- [ ] **Step 4: Run the full gate and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app
git commit -m "feat(web): pass the canvas chrome flags into Puck metadata"
```

---

### Task 4: Render the chrome in `root.render`

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx`
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `PublicHeaderView`, `PublicFooterView` from `../_public/…` (Task 1–2); `navItems` from `../_public/nav-items`; `puck.metadata.chrome` from Task 3.
- Produces: no new exports. `root.render` renders chrome around `children` when `puck.isEditing`.

The chrome renders **only** under `isEditing`. If it ever rendered in `<Render>`, a visitor would see two headers — the layout's and this one. That is the property Step 1's test pins, and the E2E in Task 5 pins it again from the outside.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("puckConfig", …)` in `apps/web/app/_content/puck-config.test.ts`. Add the `next/image` mock at the top of the file, above the existing imports — the footer view is now reachable from `puckConfig`:

```ts
vi.mock("next/image", () => ({
  default: ({ alt, className }: { alt: string; className?: string }) =>
    React.createElement("img", { alt, className }),
}));
```

and add `vi` to the existing `vitest` import.

```ts
it("root renders no page chrome outside the editor", () => {
  const render = puckConfig.root?.render;
  if (!render) throw new Error("root render missing");
  const out = renderToStaticMarkup(
    render({
      breite: "schmal",
      children: React.createElement("p", null, "Inhalt"),
      puck: { isEditing: false, metadata: { chrome: { events: true, groups: true } } },
    } as never) as never,
  );
  expect(out).toContain("Inhalt");
  // A visitor must never get a second header: the layout already renders one.
  expect(out).not.toContain("<header");
  expect(out).not.toContain("<footer");
});

it("root frames the column in visitor chrome inside the editor", () => {
  const render = puckConfig.root?.render;
  if (!render) throw new Error("root render missing");
  const out = renderToStaticMarkup(
    render({
      breite: "schmal",
      children: React.createElement("p", null, "Inhalt"),
      puck: { isEditing: true, metadata: { chrome: { events: true, groups: true } } },
    } as never) as never,
  );
  expect(out).toContain("<header");
  expect(out).toContain("<footer");
  expect(out).toContain("Inhalt");
  // The visitor's header, not the board member's.
  expect(out).toContain("Anmelden");
  expect(out).not.toContain("Mein Konto");
});

it("the canvas chrome is inert and hidden from assistive tech", () => {
  const render = puckConfig.root?.render;
  if (!render) throw new Error("root render missing");
  const out = renderToStaticMarkup(
    render({
      breite: "schmal",
      children: React.createElement("p", null, "Inhalt"),
      puck: { isEditing: true, metadata: { chrome: { events: false, groups: false } } },
    } as never) as never,
  );
  // Without pointer-events-none a stray click on a nav link navigates the
  // iframe away and the board loses the editor.
  expect(out).toMatch(/pointer-events-none/);
  expect(out).toMatch(/aria-hidden/);
});

it("the canvas footer honours the chrome flags it is given", () => {
  const render = puckConfig.root?.render;
  if (!render) throw new Error("root render missing");
  const mit = renderToStaticMarkup(
    render({
      breite: "schmal",
      children: null,
      puck: { isEditing: true, metadata: { chrome: { events: true, groups: false } } },
    } as never) as never,
  );
  expect(mit).toContain('href="/events"');
  expect(mit).not.toContain('href="/gruppen"');
});

it("root survives an editor session with no chrome metadata", () => {
  // Defensive: a route that forgot the prop must degrade to no chrome, not a
  // crashed canvas.
  const render = puckConfig.root?.render;
  if (!render) throw new Error("root render missing");
  const out = renderToStaticMarkup(
    render({
      breite: "schmal",
      children: React.createElement("p", null, "Inhalt"),
      puck: { isEditing: true, metadata: {} },
    } as never) as never,
  );
  expect(out).toContain("Inhalt");
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: FAIL on the chrome assertions — `root.render` currently emits only the column.

- [ ] **Step 3: Render the chrome**

In `apps/web/app/_content/puck-config.tsx`, add the imports:

```tsx
import { navItems } from "../_public/nav-items";
import { PublicFooterView } from "../_public/PublicFooterView";
import { PublicHeaderView } from "../_public/PublicHeaderView";
```

Replace `root.render` with:

```tsx
  root: {
    render: ({ children, ...props }) => {
      const breite = ((props as unknown as { breite?: Breite }).breite ?? "schmal") as Breite;
      const puck = (props as unknown as { puck?: { isEditing?: boolean; metadata?: unknown } })
        .puck;
      const spalte = (
        <div className={`mx-auto flex w-full flex-col gap-6 px-4 ${breiteClass(breite)}`}>
          {children}
        </div>
      );
      if (!puck?.isEditing) return spalte;

      // Editor only. `<Render>` never sets isEditing, so a visitor cannot get a
      // second header — the layout already renders one.
      const chrome = (puck.metadata as { chrome?: { events: boolean; groups: boolean } })?.chrome;
      return (
        <div className="flex min-h-full flex-col">
          {/* Decoration, not navigation: a click on a nav link would navigate
              the canvas iframe away and the board would lose the editor. */}
          <div aria-hidden className="pointer-events-none">
            <PublicHeaderView items={navItems({ isLoggedIn: false })} konto={null} />
          </div>
          <div className="flex-1 py-12">{spalte}</div>
          <div aria-hidden className="pointer-events-none">
            <PublicFooterView
              privacyUrl="/datenschutz"
              imprintUrl="/impressum"
              showEvents={chrome?.events ?? false}
              showGroups={chrome?.groups ?? false}
            />
          </div>
        </div>
      );
    },
  },
```

The legal URLs are the platform's own routes. The layout resolves them through `legalUrls()`, which is server-only; the canvas is decoration, so hardcoding the two in-app paths here is correct rather than threading two more values through `metadata`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: PASS, including every existing block and Ausrichtung test.

- [ ] **Step 5: Run the full gate, build, and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
pnpm --filter @bdas/web build
git add apps/web/app/_content
git commit -m "feat(web): frame the Puck canvas in the visitor's header and footer"
```

---

### Task 5: E2E

**Files:**

- Modify: `e2e/content-pages.e2e.ts`

**Interfaces:**

- Consumes: the existing `visible` helper and the `authoring` describe block's desktop viewport.

Spec §6 asks for exactly two assertions: the editor canvas contains the header landmark, and the published public page still renders exactly one header. The canvas is an iframe, so the main frame's `getByRole("banner")` cannot see the canvas header — which is itself the guarantee that the two never collide.

- [ ] **Step 1: Write the test**

Append inside the existing `test.describe("authoring", …)` block in `e2e/content-pages.e2e.ts`, after the Button test:

```ts
test("the canvas is framed in page chrome and the public page keeps one header", async ({
  page,
}) => {
  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, { email: FEDERAL_EMAIL, firstName: "Fed", lastName: "Eral" });

  await page.goto("/ueber-uns/bdaj/bearbeiten");
  const canvas = page.frameLocator("iframe");
  // The chrome is decoration inside the canvas: it carries the visitor's
  // entries, never the signed-in board member's account menu.
  await expect(canvas.locator("header")).toHaveCount(1);
  await expect(canvas.locator("footer")).toHaveCount(1);
  await expect(canvas.getByText("Anmelden")).toBeVisible();
  await expect(canvas.getByText("Mein Konto")).toHaveCount(0);

  // The editor page itself still has exactly one header — the layout's. The
  // canvas one lives in an iframe and cannot collide with it.
  await expect(page.getByRole("banner")).toHaveCount(1);

  await page.goto("/ueber-uns/bdaj");
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
});
```

- [ ] **Step 2: Run the spec**

Run: `pnpm e2e -- content-pages`
Expected: PASS. This needs a running app and a seeded database; CI provides both. If the canvas locators time out, check that `BDAS_FLAG_PUBLIC_SHELL` and `BDAS_FLAG_CONTENT` are on in the E2E environment — the spec's header comment already lists them.

- [ ] **Step 3: Commit**

```bash
git add e2e
git commit -m "test(web): assert canvas chrome and a single public header"
```

---

## Self-Review

**Spec coverage.**

| Spec section                                                                           | Task              |
| -------------------------------------------------------------------------------------- | ----------------- |
| §4 `PublicHeaderView` extraction                                                       | 1                 |
| §4 `PublicFooterView` extraction, flags to props                                       | 2                 |
| §4 metadata plumbing through `/bearbeiten` + `PuckEditor`                              | 3                 |
| §4 `root.render` reads `puck.metadata.chrome`, calls `navItems({ isLoggedIn: false })` | 4                 |
| §4 chrome is inert (`pointer-events-none`, `aria-hidden`)                              | 4                 |
| §6 unit: view rendering for the visitor case                                           | 1, 2              |
| §6 unit: footer respects both flag props                                               | 2                 |
| §6 regression: existing E2E green with no edits                                        | 1, 2 (PR 2 gate)  |
| §6 E2E: canvas has the header, public page has one                                     | 5                 |
| §7 double-chrome risk                                                                  | 4 (unit), 5 (E2E) |

**Spec §7's second risk — iframe styling — is not covered by a test and cannot be.** Whether the app's Tailwind reaches the Puck iframe is a visual property. Existing blocks already render styled in the canvas, so it is expected to hold; confirm it by looking at the editor once after Task 4 rather than assuming. Recorded here rather than left implicit.

**Placeholder scan.** No TBDs. The one instruction that does not carry literal code — Task 1 Step 3's "move the markup unchanged" — is a move, and spelling out 180 lines of unchanged JSX would invite a transcription error; the substitution table names every value that changes.

**Type consistency.** `konto` is `{ displayName: string; isBoard: boolean; openCount: number } | null` in the view's definition, its tests, and `PublicHeader`'s call. `chrome` is `{ events: boolean; groups: boolean }` in `PuckEditor`'s prop, the seven routes, `<Puck metadata>`, and `root.render`'s read. `showEvents` / `showGroups` are booleans in the footer view's definition, its tests, `PublicFooter`, and `root.render`.

**Task 3's required prop is deliberate.** Making `chrome` optional would let a route forget it and ship a canvas footer with the wrong links, failing silently. Required turns that into a typecheck failure, which is why Task 3 Step 3 is a typecheck rather than a grep.
