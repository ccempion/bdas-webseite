# Bildgröße mit Ziehgriff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A board member sizes a `Bild` block by dragging a handle on the image in the Puck canvas, snapping to 25 / 50 / 75 / 100 %, with a keyboard-reachable select in the sidebar and every existing document migrating itself on read.

**Architecture:** A new leaf module `bild-breite.ts` owns the step type, the class lookup, the legacy migration and the snap arithmetic — all pure, all unit-tested. `withBreite` grows into `normalizeContent`, which seeds the root width _and_ runs the `Bild` migration through Puck's `transformProps`, and every one of the eight render paths routes through it. The drag handle is a new client component mounted only under `puck.isEditing`.

**Tech Stack:** TypeScript, React, Next.js 14 App Router, Puck (`@puckeditor/core` 0.22.2), Tailwind via `core/design-system` tokens, Vitest (node environment), Playwright (E2E).

Implements `docs/superpowers/specs/2026-08-10-bild-groesse-design.md`. Branches from `feat/block-ausrichtung`, whose alignment wrapper this plan renders inside.

## Global Constraints

- **Vitest runs in `environment: "node"`** (`vitest.config.ts:5`). No jsdom, no testing-library. React is tested via `renderToStaticMarkup`. **Do not add jsdom.**
- **All user-facing copy is German.**
- **Never inline a hex, radius, shadow, or duration** (CLAUDE.md §7). Sizing uses plain Tailwind layout utilities (`w-full`, `sm:w-1/4`, `sm:w-1/2`, `sm:w-3/4`) and the handle reuses tokens already in the codebase (`rounded-bdas-sm`, `border-bdas-strong`, `bg-bdas-surface`, `text-bdas-ink-muted`).
- **Class strings must be literals in a lookup object, never template-interpolated.** Tailwind's scanner only sees literals; an interpolated class silently fails to generate.
- **`bildBreiteClass` must be total over `undefined` and over any unrecognised value.** The structural sweep in `puck-config.test.ts:375` renders every block with a prop bag that carries no `breite`, and legacy documents carry the strings `"voll"` / `"halb"`.
- **Seed the root `breite` _before_ calling `transformProps`.** `transformProps` unwraps `data.root` to `data.root.props` when the incoming root has no `props` key (`chunk-JNJJ2M57.mjs:182-184`), which would silently rewrite the document into the legacy root shape. Seeding first guarantees `root.props` exists.
- **Never render `Bild` with `isEditing: true` _and_ a non-empty `bild` in a node test.** That path mounts `BildGroesseGriff`, which calls `usePuck()` and requires the Puck store. The empty-`bild` placeholder path is safe at `isEditing: true`, and every existing test that passes `isEditing: true` to `Bild` uses `bild: ""`.
- **Puck select fields round-trip numbers.** Puck JSON-encodes each option value and parses it back on change (`chunk-CGHMSBNM.mjs:1903,1909`), so a numeric option value arrives at `render` as a number, not a string. Verified against the installed 0.22.2, not the docs.
- **Commit after every task**, conventional-commit style.
- Before each commit run: `pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint`

---

## File Structure

| File                                                     | Responsibility                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `apps/web/app/_content/bild-breite.ts`                   | **New.** Step type, class lookup, legacy migration, snap arithmetic. Pure, no JSX. |
| `apps/web/app/_content/bild-breite.test.ts`              | **New.** Its unit tests.                                                           |
| `apps/web/app/_content/BildGroesseGriff.tsx`             | **New.** The in-canvas drag handle. Client component.                              |
| `apps/web/app/_content/puck-config.tsx`                  | **Modify.** `normalizeContent`, the `Bild` field, defaults and render.             |
| `apps/web/app/_content/puck-config.test.ts`              | **Modify.** New assertions; two existing `breite` tests rewritten.                 |
| `apps/web/app/_content/PuckEditor.tsx`                   | **Modify.** Call `normalizeContent`.                                               |
| `apps/web/app/ueber-uns/page.tsx`                        | **Modify.** Route through `normalizeContent` — it currently skips normalisation.   |
| `apps/web/app/ueber-uns/bdaj/page.tsx`                   | **Modify.** Rename the call.                                                       |
| `apps/web/app/ueber-uns/verbandsstruktur/page.tsx`       | **Modify.** Rename the call.                                                       |
| `apps/web/app/ueber-uns/bundessprecherinnenrat/page.tsx` | **Modify.** Rename the call.                                                       |
| `apps/web/app/impressum/page.tsx`                        | **Modify.** Rename the call.                                                       |
| `apps/web/app/datenschutz/page.tsx`                      | **Modify.** Rename the call.                                                       |
| `apps/web/app/gruppen/[slug]/page.tsx`                   | **Modify.** Rename the call.                                                       |
| `e2e/helpers/db.ts`                                      | **Modify.** Add `seedContentPage`.                                                 |
| `e2e/group-pages.e2e.ts`                                 | **Modify.** One legacy-document rendering test.                                    |

**Why `bild-breite.ts` is a separate module and not another export from `puck-config.tsx`.** `puck-config.tsx` already imports `renderRichText` from `rich-text.tsx`. The next plan in this series (`2026-08-10-fliesstext-bilder-umfliessen-design.md` §9) requires `rich-text.tsx` to read **the same** width-class lookup, so putting the lookup in `puck-config.tsx` would create a circular import between the two. A leaf module with no imports of its own is the only placement that works for both surfaces, and the spec's "both surfaces read the same class lookup, so they cannot drift apart" is the requirement it serves. This is not speculative (CLAUDE.md §6) — the second consumer is already specced.

---

### Task 1: The width-scale module

**Files:**

- Create: `apps/web/app/_content/bild-breite.ts`
- Test: `apps/web/app/_content/bild-breite.test.ts`

**Interfaces:**

- Consumes: nothing. This module imports nothing.
- Produces, all exported from `./bild-breite`:
  - `type BildBreite = 25 | 50 | 75 | 100`
  - `BILD_BREITE_STUFEN: readonly BildBreite[]` — `[25, 50, 75, 100]`, ascending
  - `bildBreiteClass(breite: BildBreite | undefined): string` → `"w-full sm:w-1/4" | "w-full sm:w-1/2" | "w-full sm:w-3/4" | "w-full"`
  - `normalizeBildBreite(value: unknown): BildBreite`
  - `snapBildBreite(anteil: number): BildBreite` — `anteil` is a fraction of the container width (`0.5` = half)

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/_content/bild-breite.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  BILD_BREITE_STUFEN,
  bildBreiteClass,
  normalizeBildBreite,
  snapBildBreite,
} from "./bild-breite";

describe("bildBreiteClass", () => {
  it("maps each step to its literal Tailwind classes", () => {
    expect(bildBreiteClass(25)).toBe("w-full sm:w-1/4");
    expect(bildBreiteClass(50)).toBe("w-full sm:w-1/2");
    expect(bildBreiteClass(75)).toBe("w-full sm:w-3/4");
    expect(bildBreiteClass(100)).toBe("w-full");
  });

  it("is full width below the sm breakpoint at every step", () => {
    for (const stufe of BILD_BREITE_STUFEN) {
      expect(bildBreiteClass(stufe).startsWith("w-full")).toBe(true);
    }
  });

  it("falls back to full width for a missing or unrecognised value", () => {
    expect(bildBreiteClass(undefined)).toBe("w-full");
    expect(bildBreiteClass(33 as never)).toBe("w-full");
    expect(bildBreiteClass("halb" as never)).toBe("w-full");
  });
});

describe("normalizeBildBreite", () => {
  it("migrates the two legacy string values", () => {
    expect(normalizeBildBreite("voll")).toBe(100);
    expect(normalizeBildBreite("halb")).toBe(50);
  });

  it("passes the four numeric steps through untouched", () => {
    expect(normalizeBildBreite(25)).toBe(25);
    expect(normalizeBildBreite(50)).toBe(50);
    expect(normalizeBildBreite(75)).toBe(75);
    expect(normalizeBildBreite(100)).toBe(100);
  });

  it("falls back to full width for anything unrecognised", () => {
    expect(normalizeBildBreite(undefined)).toBe(100);
    expect(normalizeBildBreite(null)).toBe(100);
    expect(normalizeBildBreite(33)).toBe(100);
    expect(normalizeBildBreite("50")).toBe(100);
    expect(normalizeBildBreite({})).toBe(100);
  });
});

describe("snapBildBreite", () => {
  it("snaps a fraction to the nearest step", () => {
    expect(snapBildBreite(0.26)).toBe(25);
    expect(snapBildBreite(0.48)).toBe(50);
    expect(snapBildBreite(0.6)).toBe(50);
    expect(snapBildBreite(0.7)).toBe(75);
    expect(snapBildBreite(0.9)).toBe(100);
  });

  it("clamps both ends", () => {
    expect(snapBildBreite(0)).toBe(25);
    expect(snapBildBreite(-3)).toBe(25);
    expect(snapBildBreite(1)).toBe(100);
    expect(snapBildBreite(4.2)).toBe(100);
  });

  it("resolves an exact tie downwards", () => {
    // 0.375 sits exactly between 25 and 50. Ties go to the smaller step so a
    // slow drag does not flicker between two values at the midpoint.
    expect(snapBildBreite(0.375)).toBe(25);
    expect(snapBildBreite(0.625)).toBe(50);
  });

  it("falls back to full width for a non-finite fraction", () => {
    // A zero-width container divides to NaN; the block must not vanish.
    expect(snapBildBreite(Number.NaN)).toBe(100);
    expect(snapBildBreite(Number.POSITIVE_INFINITY)).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter @bdas/web test -- bild-breite`
Expected: FAIL — `Failed to resolve import "./bild-breite"`.

- [ ] **Step 3: Write the module**

Create `apps/web/app/_content/bild-breite.ts`:

```ts
/**
 * The one image-width scale in this codebase.
 *
 * Four steps, matching the presets the blog and events rich-text editors
 * already offer (`_blog/PostEditor.tsx:36`, `admin/events/_editor/RichTextEditor.tsx:32`),
 * so a page never mixes two different scales. Consumed by the `Bild` block and
 * — per `2026-08-10-fliesstext-bilder-umfliessen-design.md` — by the inline
 * images in `rich-text.tsx`. It lives in its own leaf module because
 * `puck-config.tsx` imports `rich-text.tsx`; the shared lookup cannot live in
 * either without creating a cycle.
 */
export type BildBreite = 25 | 50 | 75 | 100;

export const BILD_BREITE_STUFEN: readonly BildBreite[] = [25, 50, 75, 100];

/** Literal class strings — Tailwind's scanner never sees an interpolated class.
 *  Every step is `w-full` below `sm`: a 25 % image on a 380px phone is a
 *  thumbnail, and `breite: "halb"` was already full width there (`sm:max-w-md`). */
const BILD_BREITE_CLASS: Record<BildBreite, string> = {
  25: "w-full sm:w-1/4",
  50: "w-full sm:w-1/2",
  75: "w-full sm:w-3/4",
  100: "w-full",
};

/** Total over `undefined` and over unrecognised values: the structural sweep in
 *  `puck-config.test.ts` renders every block with a prop bag carrying no
 *  `breite`, and an unmigrated legacy document carries a string. */
export const bildBreiteClass = (breite: BildBreite | undefined): string =>
  breite !== undefined && Object.hasOwn(BILD_BREITE_CLASS, breite)
    ? BILD_BREITE_CLASS[breite]
    : BILD_BREITE_CLASS[100];

/** Migrate a stored `Bild.breite` onto the numeric scale. Documents written
 *  before this change carry `"voll"` or `"halb"`. Anything else — including a
 *  numeric string from a hand-edited document — becomes full width, which is
 *  the safe direction: an image is never silently shrunk. */
export function normalizeBildBreite(value: unknown): BildBreite {
  if (value === 25 || value === 50 || value === 75 || value === 100) return value;
  if (value === "halb") return 50;
  return 100;
}

/** Snap a drag to the nearest step. `anteil` is a fraction of the container
 *  width, so it is naturally clamped by picking the nearest of four values.
 *  Ties resolve downwards (strict `<`), which keeps a drag parked exactly on a
 *  midpoint from flickering between two steps. */
export function snapBildBreite(anteil: number): BildBreite {
  if (!Number.isFinite(anteil)) return 100;
  const prozent = anteil * 100;
  return BILD_BREITE_STUFEN.reduce((beste, stufe) =>
    Math.abs(stufe - prozent) < Math.abs(beste - prozent) ? stufe : beste,
  );
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @bdas/web test -- bild-breite`
Expected: PASS, 12 assertions across four describes.

- [ ] **Step 5: Run the full gate and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/bild-breite.ts apps/web/app/_content/bild-breite.test.ts
git commit -m "feat(web): add the shared image-width scale"
```

---

### Task 2: `normalizeContent` replaces `withBreite` on all eight render paths

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx:109-113`
- Modify: `apps/web/app/_content/PuckEditor.tsx:12,27`
- Modify: `apps/web/app/ueber-uns/page.tsx:11,47`
- Modify: `apps/web/app/ueber-uns/bdaj/page.tsx:11,56`
- Modify: `apps/web/app/ueber-uns/verbandsstruktur/page.tsx:11,53`
- Modify: `apps/web/app/ueber-uns/bundessprecherinnenrat/page.tsx:12,55`
- Modify: `apps/web/app/impressum/page.tsx:11,52`
- Modify: `apps/web/app/datenschutz/page.tsx:11,52`
- Modify: `apps/web/app/gruppen/[slug]/page.tsx:15,91`
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `normalizeBildBreite` from `./bild-breite` (Task 1).
- Produces: `normalizeContent(data: Data, fallback: Breite): Data`, exported from `./puck-config`. **`withBreite` is removed, not deprecated** — CLAUDE.md §6 rules out compatibility shims for code we wrote ourselves.

There are eight paths into a Puck tree: seven public `<Render>` call sites and `<Puck>` itself. `apps/web/app/ueber-uns/page.tsx:47` is the one that currently skips normalisation entirely. That is harmless today because `root.render` falls back to `schmal` on its own, but it stops being harmless here: a legacy `halb` image on that page would reach `render` unmigrated. One seam, one place to test.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("puckConfig", …)` block in `apps/web/app/_content/puck-config.test.ts`. Add `normalizeContent` to the existing import from `./puck-config`, and add `import type { Data } from "@puckeditor/core";` at the top if it is not already imported.

```ts
it("normalizeContent seeds the root width when the document has none", () => {
  const data = { content: [], root: {} } as unknown as Data;
  const out = normalizeContent(data, "breit");
  expect((out.root.props as { breite?: string }).breite).toBe("breit");
});

it("normalizeContent keeps a width the document already carries", () => {
  const data = { content: [], root: { props: { breite: "schmal" } } } as unknown as Data;
  const out = normalizeContent(data, "breit");
  expect((out.root.props as { breite?: string }).breite).toBe("schmal");
});

it("normalizeContent migrates legacy Bild widths onto the numeric scale", () => {
  const data = {
    content: [
      { type: "Bild", props: { id: "a", bild: "x.jpg", breite: "voll" } },
      { type: "Bild", props: { id: "b", bild: "y.jpg", breite: "halb" } },
      { type: "Bild", props: { id: "c", bild: "z.jpg" } },
    ],
    root: {},
  } as unknown as Data;

  const breiten = normalizeContent(data, "schmal").content.map(
    (item) => (item.props as { breite?: unknown }).breite,
  );
  expect(breiten).toEqual([100, 50, 100]);
});

it("normalizeContent leaves a document's other blocks and ids alone", () => {
  const data = {
    content: [
      { type: "Bild", props: { id: "a", bild: "x.jpg", altText: "Foto", breite: "halb" } },
      { type: "Absatz", props: { id: "b", text: "Ein Satz." } },
    ],
    root: {},
  } as unknown as Data;

  const out = normalizeContent(data, "schmal");
  expect(out.content[0]?.props).toMatchObject({ id: "a", altText: "Foto", breite: 50 });
  expect(out.content[1]?.props).toEqual({ id: "b", text: "Ein Satz." });
});

it("normalizeContent keeps root under a props key, never the legacy flat shape", () => {
  // transformProps unwraps root to root.props when the incoming root has no
  // props key. Seeding the width first is what stops that from happening.
  const data = { content: [], root: {} } as unknown as Data;
  const out = normalizeContent(data, "schmal");
  expect(out.root.props).toBeDefined();
  expect((out.root as { breite?: string }).breite).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: FAIL — `normalizeContent is not exported by ./puck-config`.

- [ ] **Step 3: Replace `withBreite` with `normalizeContent`**

In `apps/web/app/_content/puck-config.tsx`, add `transformProps` to the existing `@puckeditor/core` import and import the migration:

```tsx
import { type Config, type Data, transformProps } from "@puckeditor/core";
```

```tsx
import { normalizeBildBreite } from "./bild-breite";
```

Then replace the whole `withBreite` function (currently `puck-config.tsx:109-113`) with:

```tsx
/** The single seam every Puck tree passes through, on all eight paths — the
 *  seven public `<Render>` call sites and `<Puck>`.
 *
 *  Two jobs. First, ensure the document carries a `breite`: documents authored
 *  before the root existed have none, and the fallback differs per page so the
 *  editor and the published page frame them identically. Second, migrate
 *  `Bild.breite` off the legacy `"voll" | "halb"` strings onto the numeric
 *  scale.
 *
 *  Order matters: the width is seeded first because `transformProps` unwraps
 *  `data.root` to `data.root.props` when the incoming root has no `props` key,
 *  which would rewrite the document into the legacy root shape. */
export function normalizeContent(data: Data, fallback: Breite): Data {
  const props = (data.root?.props ?? {}) as Record<string, unknown>;
  const mitBreite =
    props.breite === "schmal" || props.breite === "breit"
      ? data
      : ({ ...data, root: { ...data.root, props: { ...props, breite: fallback } } } as Data);

  return transformProps(mitBreite, {
    Bild: (bild) => ({ ...bild, breite: normalizeBildBreite(bild.breite) }),
  });
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: the five new tests PASS. Typecheck will still fail at the eight call sites — that is Step 5.

- [ ] **Step 5: Update all eight call sites**

`apps/web/app/_content/PuckEditor.tsx` — change the import on line 12 and the memo on line 27:

```tsx
import { type Breite, normalizeContent, puckConfig } from "./puck-config";
```

```tsx
const data = useMemo(
  () => normalizeContent(initialData, defaultBreite),
  [initialData, defaultBreite],
);
```

`apps/web/app/ueber-uns/page.tsx` — this one gains normalisation it never had. Change line 11 and line 47:

```tsx
import { normalizeContent, puckConfig } from "../_content/puck-config";
```

```tsx
<Render config={puckConfig} data={normalizeContent(page.data as Data, "schmal")} />
```

`"schmal"` is the correct fallback: the page's own `<main>` is `max-w-3xl`, which is what `breiteClass("schmal")` returns.

In each of the five remaining public pages, rename the import and the call. The fallback argument stays exactly as it is today:

| File                                                     | Import line | Call line | Fallback   |
| -------------------------------------------------------- | ----------- | --------- | ---------- |
| `apps/web/app/ueber-uns/bdaj/page.tsx`                   | 11          | 56        | `"schmal"` |
| `apps/web/app/ueber-uns/verbandsstruktur/page.tsx`       | 11          | 53        | `"breit"`  |
| `apps/web/app/ueber-uns/bundessprecherinnenrat/page.tsx` | 12          | 55        | `BREITE`   |
| `apps/web/app/impressum/page.tsx`                        | 11          | 52        | `"schmal"` |
| `apps/web/app/datenschutz/page.tsx`                      | 11          | 52        | `"schmal"` |
| `apps/web/app/gruppen/[slug]/page.tsx`                   | 15          | 91        | `"schmal"` |

For example, in `apps/web/app/ueber-uns/bdaj/page.tsx`:

```tsx
import { breiteClass, normalizeContent, puckConfig } from "../../_content/puck-config";
```

```tsx
<Render config={puckConfig} data={normalizeContent(page.data as Data, "schmal")} />
```

`bundessprecherinnenrat/page.tsx` keeps its `type Breite` import and its `BREITE` constant:

```tsx
import { type Breite, breiteClass, normalizeContent, puckConfig } from "../../_content/puck-config";
```

- [ ] **Step 6: Verify no call site was missed**

Run: `grep -rn "withBreite" apps/web`
Expected: no output. Any hit is a missed call site.

Run: `grep -rn "normalizeContent" apps/web --include=*.tsx | grep -c ""`
Expected: `9` — one definition plus eight call sites.

- [ ] **Step 7: Run the full gate and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web
git commit -m "refactor(web): route every Puck tree through normalizeContent"
```

---

### Task 3: `Bild` switches to the four-step scale

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` — the `Blocks` type and the `Bild` component
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `BildBreite`, `bildBreiteClass` from `./bild-breite` (Task 1).
- Produces: `Blocks["Bild"]["breite"]` is now `BildBreite`. `Bild.defaultProps.breite` is `100`.

Two existing tests assert the old mechanism and **must** be rewritten in this task — unlike the Ausrichtung work, this change is deliberately visible:

- `"Bild at halber Breite keeps an explicit width so it does not shrink-wrap"` (`puck-config.test.ts:517`) asserts `sm:max-w-md`, which no longer exists.
- `"Bild centres the figure and its caption"` (`:494`) passes `breite: "halb"`; change that prop to `50`. Its assertions about `justify-center` and `text-center` stay untouched — alignment behaviour does not change here.

Every other occurrence of `breite: "voll"` in the test file sits in a prop bag that is only passed through (`:97`, `:107`, `:254`, `:360`, `:541`, `:621`); those tests keep passing because `bildBreiteClass` is total, and they should be left alone.

- [ ] **Step 1: Write the failing tests**

Add `bildBreiteClass` is not needed here — assert through the render function. Append inside `describe("puckConfig", …)`:

```ts
it("Bild offers the four width steps as numbers", () => {
  const breite = puckConfig.components.Bild?.fields?.breite;
  if (breite?.type !== "select") throw new Error("breite must be a select field");
  expect(breite.options.map((o) => o.value)).toEqual([25, 50, 75, 100]);
  expect(breite.options.map((o) => o.label)).toEqual(["25 %", "50 %", "75 %", "100 %"]);
});

it("a new Bild is full width", () => {
  expect(puckConfig.components.Bild?.defaultProps?.breite).toBe(100);
});

it("Bild renders the width class for each step", () => {
  const render = puckConfig.components.Bild?.render;
  if (!render) throw new Error("Bild render missing");
  const figureClass = (breite: number) => {
    const out = renderToStaticMarkup(
      render({
        bild: "https://cdn.test/x.jpg",
        altText: "a",
        bildunterschrift: "",
        breite,
        ausrichtung: "links",
        puck: {},
      } as never) as never,
    );
    return out.match(/<figure class="([^"]*)"/)?.[1] ?? "";
  };
  // Matched by containment, not equality: Task 4 adds `relative` to this same
  // element, and an exact-string assertion would break on a change that has
  // nothing to do with width.
  expect(figureClass(25)).toMatch(/\bw-full\b.*\bsm:w-1\/4\b/);
  expect(figureClass(50)).toMatch(/\bw-full\b.*\bsm:w-1\/2\b/);
  expect(figureClass(75)).toMatch(/\bw-full\b.*\bsm:w-3\/4\b/);
  expect(figureClass(100)).toMatch(/\bw-full\b/);
  expect(figureClass(100)).not.toMatch(/\bsm:w-/);
});

it("a Bild saved before the numeric scale still renders full width", () => {
  // The migration runs in normalizeContent, but the render must not blow up on
  // an unmigrated prop bag either — the structural sweep passes none at all.
  const render = puckConfig.components.Bild?.render;
  if (!render) throw new Error("Bild render missing");
  const out = renderToStaticMarkup(
    render({
      bild: "https://cdn.test/x.jpg",
      altText: "a",
      bildunterschrift: "",
      breite: "halb",
      ausrichtung: "links",
      puck: {},
    } as never) as never,
  );
  expect(out).toMatch(/<figure class="w-full">/);
});
```

- [ ] **Step 2: Rewrite the two existing tests**

Replace the test named `"Bild at halber Breite keeps an explicit width so it does not shrink-wrap"` (`puck-config.test.ts:517-530`) with:

```ts
it("Bild below full width keeps an explicit width so it does not shrink-wrap", () => {
  const render = puckConfig.components.Bild?.render;
  if (!render) throw new Error("Bild render missing");
  const out = renderToStaticMarkup(
    render({
      bild: "https://cdn.test/x.jpg",
      altText: "a",
      bildunterschrift: "",
      breite: 50,
      ausrichtung: "links",
      puck: {},
    } as never) as never,
  );
  // `w-full` under the alignment wrapper, narrowed from `sm` up. Without the
  // explicit width the figure shrink-wraps to the image's intrinsic size.
  expect(out).toMatch(/<figure class="[^"]*\bw-full\b[^"]*\bsm:w-1\/2\b/);
});
```

In `"Bild centres the figure and its caption"` (`:494`), change the one line `breite: "halb",` to `breite: 50,`. Change nothing else in that test.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: FAIL — the option values are still `"voll"`/`"halb"`, and the figure still carries `sm:max-w-md`.

- [ ] **Step 4: Change the `Bild` block**

In `apps/web/app/_content/puck-config.tsx`, extend the `bild-breite` import added in Task 2:

```tsx
import { type BildBreite, bildBreiteClass, normalizeBildBreite } from "./bild-breite";
```

In the `Blocks` type, change the `Bild` entry's `breite`:

```tsx
Bild: {
  bild: string;
  altText: string;
  bildunterschrift: string;
  breite: BildBreite;
  ausrichtung: Ausrichtung;
}
```

Replace the `breite` field definition:

```tsx
        breite: {
          type: "select",
          label: "Breite",
          options: [
            { label: "25 %", value: 25 },
            { label: "50 %", value: 50 },
            { label: "75 %", value: 75 },
            { label: "100 %", value: 100 },
          ],
        },
```

Change the default:

```tsx
      defaultProps: {
        bild: "",
        altText: "",
        bildunterschrift: "",
        breite: 100,
        ausrichtung: "links",
      },
```

And in `render`, replace the inline ternary on the `<figure>`:

```tsx
            <figure className={bildBreiteClass(breite)}>
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: PASS, including every untouched Ausrichtung and placeholder test.

- [ ] **Step 6: Run the full gate and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content
git commit -m "feat(web): size the Bild block on the four-step scale"
```

---

### Task 4: The in-canvas drag handle

**Files:**

- Create: `apps/web/app/_content/BildGroesseGriff.tsx`
- Modify: `apps/web/app/_content/puck-config.tsx` — mount the handle in `Bild.render`
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `BildBreite`, `snapBildBreite` from `./bild-breite` (Task 1); `registerOverlayPortal`, `usePuck` from `@puckeditor/core`.
- Produces: `BildGroesseGriff({ id, breite }: { id: string; breite: BildBreite }): JSX.Element | null`.

**Everything this component relies on is present in the installed 0.22.2**, verified against `node_modules/@puckeditor/core/dist/index.d.ts`: `registerOverlayPortal` (`:246`), `usePuck` (`:292`), `getSelectorForId(id) => Required<ItemSelector>` and `getItemById(id)` (`:265-267`), and the `replace` action shape `{ type, destinationIndex, destinationZone, data }` (`actions-Csn3gOP8.d.ts:786-792`). `PuckComponent` props carry `id` (`:397`), which is how the handle learns which block it belongs to.

**The gesture is delta-based**, not absolute: `anteil = startBreite / 100 + (clientX - startX) / containerWidth`. That means dragging right always widens, whatever the block's `Ausrichtung` — an absolute measurement from the container's left edge would read ~1.0 for every right-aligned image. It is a deliberate simplification, and it is why `snapBildBreite` takes a fraction rather than a pixel offset.

**History:** steps reached mid-drag dispatch with `recordHistory: false` so the image resizes live without filling the undo stack; the release dispatches once more with history on, so one drag is one undo.

- [ ] **Step 1: Write the failing test**

The handle itself cannot be rendered in a node test — `usePuck()` requires the Puck store. What the test must pin is the property the spec cares about: **the handle never reaches the public page.** Append inside `describe("puckConfig", …)`:

```ts
it("Bild ships no resize handle to the public page", () => {
  const render = puckConfig.components.Bild?.render;
  if (!render) throw new Error("Bild render missing");
  const out = renderToStaticMarkup(
    render({
      id: "bild-1",
      bild: "https://cdn.test/x.jpg",
      altText: "a",
      bildunterschrift: "",
      breite: 50,
      ausrichtung: "links",
      puck: { isEditing: false },
    } as never) as never,
  );
  expect(out).not.toContain("data-bild-groesse-griff");
});
```

- [ ] **Step 2: Run the test and watch it pass for the wrong reason**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: PASS — nothing renders a handle yet. This test is a guard, not a driver; it turns into a real assertion the moment Step 4 mounts the component. Note it now so its later value is not mistaken for a tautology.

- [ ] **Step 3: Write the component**

Create `apps/web/app/_content/BildGroesseGriff.tsx`:

```tsx
"use client";

import { registerOverlayPortal, usePuck } from "@puckeditor/core";
import { useEffect, useRef, useState } from "react";

import { type BildBreite, snapBildBreite } from "./bild-breite";

/**
 * In-canvas resize handle for the `Bild` block. Mounted only under
 * `puck.isEditing`, so the public page never ships it.
 *
 * Puck has no resize field — the shipped `.d.ts` of 0.22.2 and 0.23.0 both
 * offer `array · custom · external · number · object · radio · richtext ·
 * select · slot · text · textarea` and nothing dimensional — so this is
 * hand-rolled, but on first-party APIs: `registerOverlayPortal` marks the
 * handle interactive so dnd-kit does not turn the gesture into a block drag,
 * and `usePuck().dispatch` writes the new value, which is the combination the
 * overlay-portals documentation names for inline inputs.
 *
 * The sidebar keeps an equivalent select — a drag-only control is unusable by
 * keyboard.
 */
export function BildGroesseGriff({ id, breite }: { id: string; breite: BildBreite }) {
  const { dispatch, getItemById, getSelectorForId, selectedItem } = usePuck();
  const griffRef = useRef<HTMLDivElement>(null);
  const zug = useRef<{ startX: number; startBreite: BildBreite; containerBreite: number } | null>(
    null,
  );
  const [aktuell, setAktuell] = useState<BildBreite | null>(null);

  // Handles belong to the selected block only — standard editor behaviour, and
  // it keeps a page of images from sprouting handles everywhere.
  const istAusgewaehlt = selectedItem?.props.id === id;

  // Keyed on selection, not `[]`: the handle is absent from the DOM until this
  // block is selected, so on the first run of an empty-dependency effect the
  // ref is still null and the portal would never be registered.
  useEffect(() => {
    if (!istAusgewaehlt) return;
    return registerOverlayPortal(griffRef.current, { disableDrag: true });
  }, [istAusgewaehlt]);

  if (!istAusgewaehlt) return null;

  function schreibe(neu: BildBreite, recordHistory: boolean) {
    const selector = getSelectorForId(id);
    const item = getItemById(id);
    if (!selector || !item) return;
    dispatch({
      type: "replace",
      recordHistory,
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...item, props: { ...item.props, breite: neu } },
    });
  }

  return (
    <div
      ref={griffRef}
      data-bild-groesse-griff
      aria-hidden
      className="absolute right-0 top-1/2 flex h-10 w-3 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-bdas-sm border border-bdas-strong bg-bdas-surface"
      onPointerDown={(e) => {
        const container = griffRef.current?.closest("[data-bild-rahmen]");
        const rect = container?.getBoundingClientRect();
        if (!rect) return;
        zug.current = { startX: e.clientX, startBreite: breite, containerBreite: rect.width };
        setAktuell(breite);
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const z = zug.current;
        if (!z) return;
        const anteil = z.startBreite / 100 + (e.clientX - z.startX) / z.containerBreite;
        const neu = snapBildBreite(anteil);
        if (neu === aktuell) return;
        setAktuell(neu);
        // Live resize, but no undo entry per step — the release records one.
        schreibe(neu, false);
      }}
      onPointerUp={(e) => {
        const z = zug.current;
        zug.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (z && aktuell !== null && aktuell !== z.startBreite) schreibe(aktuell, true);
        setAktuell(null);
      }}
    >
      {aktuell === null ? null : (
        <span className="pointer-events-none absolute right-5 rounded-bdas-sm border border-bdas-strong bg-bdas-surface px-2 py-1 text-xs text-bdas-ink-muted">
          {aktuell} %
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Mount it in `Bild.render`**

In `apps/web/app/_content/puck-config.tsx`, import the component:

```tsx
import { BildGroesseGriff } from "./BildGroesseGriff";
```

Then change the `Bild` render's non-empty branch to take `id`, make the figure a positioning context, and give the figure the marker attribute the handle measures against:

```tsx
      render: ({ id, bild, altText, bildunterschrift, breite, ausrichtung, puck }) => {
        if (!bild) {
          return puck?.isEditing ? (
            <BlockPlatzhalter titel="Bild" hinweis="Noch kein Bild ausgewählt." />
          ) : (
            <></>
          );
        }
        return (
          <div className={`flex ${ausrichtungFlex(ausrichtung)}`} data-bild-rahmen>
            <figure className={`relative ${bildBreiteClass(breite)}`}>
              <img src={bild} alt={altText} className="w-full rounded-bdas" />
              {bildunterschrift ? (
                <figcaption
                  className={`mt-2 text-sm text-bdas-ink-muted ${ausrichtungText(ausrichtung)}`}
                >
                  {bildunterschrift}
                </figcaption>
              ) : null}
              {puck?.isEditing ? <BildGroesseGriff id={id} breite={breite} /> : null}
            </figure>
          </div>
        );
      },
```

`data-bild-rahmen` goes on the **alignment wrapper**, not the figure: the wrapper spans the full content column, which is the width the percentage is a percentage _of_. Measuring the figure itself would make each drag relative to the size the last drag produced.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: PASS. The Step 1 guard now genuinely exercises the `isEditing: false` branch, and Task 3's width assertions still pass because they match by containment rather than exact equality.

- [ ] **Step 6: Run the full gate and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content
git commit -m "feat(web): resize a Bild by dragging it in the canvas"
```

---

### Task 5: E2E — a legacy document renders on the new scale

**Files:**

- Modify: `e2e/helpers/db.ts`
- Modify: `e2e/group-pages.e2e.ts`

**Interfaces:**

- Consumes: `seedGroup`, `uniqueSlug` from `./helpers/db`.
- Produces: `seedContentPage(slug: string, data: unknown): Promise<void>` in `e2e/helpers/db.ts`.

The spec (§7) asks the E2E to cover the **data** path, not the drag gesture — driving a pointer sequence inside the preview iframe is expensive and thin on value once snapping and dispatch are unit-tested. That is a deliberate gap.

Seeding the document directly is a better test than driving the sidebar select, and it is what this task does. Driving the select would need a real image in the block first — `Bild` renders nothing without one, and `FotoField` only writes a URL after a signed upload to Supabase actually succeeds, which the E2E environment does not do (`group-profile.e2e.ts:61` asserts the upload _request_, never its result). Seeding also pins the far more valuable property: **a document written before this change renders correctly with no manual intervention**, which is the migration reaching all eight render paths.

Seed onto a disposable group page (`gruppen/<slug>`), never onto `/impressum` or the other shared fixtures — other specs assert against those.

- [ ] **Step 1: Add the seeding helper**

Append to `e2e/helpers/db.ts`:

```ts
/** Seed a Puck document for a content page (slug `gruppen/<slug>` for a group
 *  page). Used to plant documents in shapes the editor no longer produces —
 *  e.g. a `Bild` still carrying the pre-2026-08-11 `"voll" | "halb"` width. */
export async function seedContentPage(slug: string, data: unknown): Promise<void> {
  await sql`
    INSERT INTO content_pages (slug, data, updated_by)
    VALUES (${slug}, ${sql.json(data as never)}, 'e2e')
    ON CONFLICT (slug) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by`;
}
```

- [ ] **Step 2: Write the failing test**

Append to `e2e/group-pages.e2e.ts`, and add `seedContentPage` to the existing import from `./helpers/db`:

```ts
test("a Bild saved at the old halbe Breite renders on the numeric scale", async ({ page }) => {
  const slug = uniqueSlug("e2e-bildbreite");
  await seedGroup({ slug, name: "E2E Bildgruppe", city: "Teststadt" });
  // Written the way the editor wrote it before 2026-08-11: a string width, and
  // a root with no `breite` at all.
  await seedContentPage(`gruppen/${slug}`, {
    root: {},
    content: [
      {
        type: "Bild",
        props: {
          id: "Bild-legacy",
          bild: "https://cdn.test/legacy.jpg",
          altText: "Altes Bild",
          bildunterschrift: "",
          breite: "halb",
        },
      },
    ],
  });

  await page.goto(`/gruppen/${slug}`);
  const figure = page.locator("figure", { has: page.getByAltText("Altes Bild") });
  await expect(figure).toHaveClass(/\bsm:w-1\/2\b/);
  await expect(figure).not.toHaveClass(/\bsm:max-w-md\b/);
});
```

- [ ] **Step 3: Run the spec**

Run: `pnpm e2e -- group-pages`
Expected: PASS. If the app is not running against a seeded database this spec cannot run locally — CI runs it. If it fails with a missing `content_pages` row, check that `BDAS_FLAG_CONTENT` is on in the E2E environment (`group-pages.e2e.ts` already documents the flags it needs).

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(web): pin that a legacy Bild width migrates on read"
```

---

## Self-Review

**Spec coverage.**

| Spec section                                                | Task                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| §3 data model `25 \| 50 \| 75 \| 100`                       | 1, 3                                                  |
| §3 migration `voll→100 halb→50 else→100`                    | 1                                                     |
| §3 `withBreite` → `normalizeContent`, all eight paths       | 2                                                     |
| §4 class lookup incl. the mobile rule                       | 1                                                     |
| §5 handle, `registerOverlayPortal`, dispatch, selected-only | 4                                                     |
| §5 handle never reaches the public page                     | 4                                                     |
| §6 composes with Ausrichtung                                | 3, 4 (the wrapper is untouched; its tests stay green) |
| §7 unit: snapping, class lookup, migration                  | 1                                                     |
| §7 render: no handle at `isEditing: false`                  | 4                                                     |
| §7 E2E: the data path                                       | 5                                                     |

**Deviation from the spec, recorded.** §7 asks the E2E to "set a size through the sidebar select, publish, assert the public page carries the expected class". Task 5 seeds the document instead and asserts the same class on the same public page. Reason: the select path requires an image in the block, and image upload does not complete in the E2E environment. The seeded variant covers the migration as well, which is the higher-value property. The sidebar select's option values and default are pinned by unit tests in Task 3.

**Placeholder scan.** No TBDs, no "add error handling", no "similar to Task N". Every code step carries the code.

**Type consistency.** `BildBreite` is used identically in Tasks 1, 3 and 4. `bildBreiteClass` takes `BildBreite | undefined` everywhere. `normalizeBildBreite` takes `unknown` and is called only from `normalizeContent`. `snapBildBreite` takes a fraction in every caller and test. `normalizeContent(data, fallback)` has one signature across all eight call sites.

**One known coupling between tasks:** Task 4 prepends `relative` to the figure's class string, which Task 3 asserts against. Task 3's assertions therefore match by containment, so no expectation needs rewriting when Task 4 lands.
