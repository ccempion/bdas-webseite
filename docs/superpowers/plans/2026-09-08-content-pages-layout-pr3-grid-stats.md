# Content-Seiten Layout-Erweiterung — PR3 (Karten-Raster & Kennzahlen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two array-driven grid blocks to the Puck palette — `KartenRaster` (a Feature-/Karten-Grid of image + title + text cards, 2/3/4 columns) and `Kennzahlen` (a row of highlighted figures with captions).

**Architecture:** Both blocks are arrays rendered into an equal-column grid, which is why the spec pairs them in one PR: they share the pattern, not the code. Each gets its own presentational component file (`KartenRaster.tsx`, `Kennzahlen.tsx`) with an exported, independently testable grid-class lookup, following the `Organigramm.tsx` / `Hero.tsx` shape; `puck-config.tsx` only wires fields to props. `KartenRaster` reuses the design system's `Card` and the existing `FotoField` upload field, so it introduces no new visual primitive. No `modules/content` schema, migration, or feature-flag change — block `props` are already opaque passthrough JSON.

**Tech Stack:** Next.js 14 App Router, `@puckeditor/core@0.23.0` (pinned), Tailwind CSS 3.4 via `core/design-system` tokens, Vitest (`renderToStaticMarkup`, node environment).

**Spec:** `docs/superpowers/specs/2026-09-08-content-pages-layout-erweiterung-design.md` (§6 Feature-/Karten-Grid and Stats/Zahlen-Reihe, §10 PR-Sequenzierung Nr. 3, §11 Tests, §12 grid breakpoints deferred to this plan). Reference: `docs/decisions/0036-puck-freeform-layout-and-block-expansion.md`. Predecessors: PR1 (`…-pr1-fundament.md`, merged as PR #203), PR2 (`…-pr2-hero.md`).

## Global Constraints

- No MUI/Emotion, no raw HTML block, no free-text CSS/styling prop on any block (ADR 0023, unchanged). No `dangerouslySetInnerHTML`.
- Every class must be a **literal string** — never an interpolated/dynamic Tailwind class. Tailwind's scanner only sees literals, so both grid lookups below are records of complete class strings, never `` `sm:grid-cols-${n}` ``.
- Only `core/design-system` tokens (`bdas-*` utilities from `core/design-system/src/tailwind-preset.ts`) — no ad-hoc hex, radius, shadow, or duration values.
- **Brand red is not used in this PR.** ADR 0036 grants the accent colour to the CTA banner (PR4); a stat figure is not an active/open state, and CLAUDE.md §7 forbids red as a default text colour. The figures render in `text-bdas-ink`. If that reads flat in review, that is a design conversation for the spec, not a class to slip in here.
- Documents saved before a prop existed must keep rendering byte-identically. Every lookup is **total** over `undefined` and over unrecognised values — `Object.hasOwn` guard plus a default, as in `bildBreiteClass`; every array prop is read as `(x ?? [])`.
- `BlockPlatzhalter` is editor-only. Gate it on `puck?.isEditing` — `puck-config.test.ts` has a structural sweep that renders every registered block with `isEditing: false` and asserts no `data-block-platzhalter` in the output.
- **Do not touch the `exactly the seven intended blocks carry an Ausrichtung field` guard test.** Neither new block carries an `ausrichtung` field — the spec lists none for either. If you find yourself editing that list, you have added a field the spec does not call for.
- `@puckeditor/core` stays pinned at `^0.23.0`. **No new runtime dependency in this PR** — `embla-carousel-react` belongs to PR5 alone (spec §8).
- Base the branch on `main` once PR2 has merged. If PR2 is still open, branch off `feat/content-layout-pr2` and retarget to `main` after it lands. Never branch off another feature's worktree. Overlap with PR2 is confined to the import block and the `Blocks` type in `puck-config.tsx`.

---

## Task 1: The `KartenRaster` presentational component

**Files:**

- Create: `apps/web/app/_content/KartenRaster.tsx`
- Create: `apps/web/app/_content/KartenRaster.test.tsx`

**Interfaces:**

- Consumes: `Card` from `@bdas/design-system` (already used by `PersonenRaster`, `Organigramm`, `Panel`).
- Produces:

```ts
export type KartenSpalten = "2" | "3" | "4";
export type Karte = { bild: string; titel: string; text: string };
export const kartenGrid: (spalten: KartenSpalten | undefined) => string;
export function KartenRaster(props: { karten: Karte[]; spalten: KartenSpalten }): JSX.Element;
```

Task 2 registers the Puck block that passes these props straight through.

**Design decisions this task locks in** (spec §12 left breakpoints to the PR plan):

- **One column below `sm`, always.** A feature card carries a title _and_ a paragraph; two of those side by side on a 380px phone is unreadable. This differs deliberately from `PersonenRaster`, which is two-across from the narrowest viewport because each of its cards is a square photo with four short lines.
- **The card image is decorative** (`alt=""`, `aria-hidden`). The title next to it carries the meaning, so an alt text would be announced twice — and it keeps the editor's field count at three. `PersonenRaster` uses `alt={p.name}` because there the photo _is_ the content.
- **Index keys are correct here.** Unlike `Akkordeon`, a card holds no DOM state (no open `<details>`) that a reorder could strand, so there is no reason for the identity-keying `akkordeonKeys` does. `PersonenRaster` already uses `key={i}` for the same reason.
- `aspect-video` on the image so a row of cards has one image height regardless of what the board uploaded.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/_content/KartenRaster.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { KartenRaster, type Karte, kartenGrid } from "./KartenRaster";

const karte = (titel: string): Karte => ({ bild: "", titel, text: "Beschreibung." });

describe("kartenGrid", () => {
  it("is one column below sm on every preset", () => {
    for (const spalten of ["2", "3", "4"] as const) {
      // No *unprefixed* grid-cols class — every column class must carry a
      // breakpoint prefix. A plain `not.toContain("grid-cols-2")` would be
      // wrong: `sm:grid-cols-2` contains it and is exactly what we want.
      expect(kartenGrid(spalten)).not.toMatch(/(^|\s)grid-cols-/);
      expect(kartenGrid(spalten)).toContain("sm:grid-cols-2");
    }
  });

  it("maps each preset to its own widest breakpoint", () => {
    expect(kartenGrid("2")).not.toContain("lg:grid-cols");
    expect(kartenGrid("3")).toContain("lg:grid-cols-3");
    expect(kartenGrid("4")).toContain("lg:grid-cols-4");
  });

  it("falls back to three columns for a missing or unknown value", () => {
    expect(kartenGrid(undefined)).toBe(kartenGrid("3"));
    expect(kartenGrid("6" as never)).toBe(kartenGrid("3"));
  });
});

describe("KartenRaster", () => {
  it("renders one design-system card per entry", () => {
    const out = renderToStaticMarkup(
      <KartenRaster karten={[karte("Beratung"), karte("Vernetzung")]} spalten="3" />,
    );
    expect(out).toContain("Beratung");
    expect(out).toContain("Vernetzung");
    expect((out.match(/rounded-bdas /g) ?? []).length).toBe(2);
  });

  it("renders an image only when the entry has one, and marks it decorative", () => {
    const mit = renderToStaticMarkup(
      <KartenRaster
        karten={[{ bild: "https://cdn.example/a.webp", titel: "Beratung", text: "" }]}
        spalten="2"
      />,
    );
    expect(mit).toContain('src="https://cdn.example/a.webp"');
    expect(mit).toContain('alt=""');
    expect(mit).toContain("aria-hidden");
    expect(mit).toContain("aspect-video");

    const ohne = renderToStaticMarkup(<KartenRaster karten={[karte("Beratung")]} spalten="2" />);
    expect(ohne).not.toContain("<img");
  });

  it("omits an empty title or text rather than rendering an empty element", () => {
    const out = renderToStaticMarkup(
      <KartenRaster karten={[{ bild: "", titel: "Nur Titel", text: "" }]} spalten="2" />,
    );
    expect(out).toContain("Nur Titel");
    expect((out.match(/<p/g) ?? []).length).toBe(1);
  });

  it("keeps line breaks in the card text", () => {
    const out = renderToStaticMarkup(
      <KartenRaster karten={[{ bild: "", titel: "T", text: "Eins\nZwei" }]} spalten="2" />,
    );
    expect(out).toContain("whitespace-pre-line");
  });

  it("survives a document saved without the array", () => {
    const out = renderToStaticMarkup(
      <KartenRaster karten={undefined as never} spalten={undefined as never} />,
    );
    expect(out).toContain("sm:grid-cols-2");
    expect(out).not.toContain("<img");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web test -- KartenRaster`
Expected: FAIL — `Failed to resolve import "./KartenRaster"`.

- [ ] **Step 3: Write the component**

Create `apps/web/app/_content/KartenRaster.tsx`:

```tsx
import React from "react";

import { Card } from "@bdas/design-system";

export type KartenSpalten = "2" | "3" | "4";

export type Karte = {
  bild: string;
  titel: string;
  text: string;
};

/** Literal class strings — Tailwind's scanner never sees an interpolated
 *  class. One column below `sm` on every preset: a feature card carries a
 *  title *and* a paragraph, and two of those side by side on a phone is
 *  unreadable. (`PersonenRaster` is two-across from the narrowest viewport for
 *  the opposite reason — each of its cards is a square photo.) */
const KARTEN_GRID: Record<KartenSpalten, string> = {
  "2": "grid gap-6 sm:grid-cols-2",
  "3": "grid gap-6 sm:grid-cols-2 lg:grid-cols-3",
  "4": "grid gap-6 sm:grid-cols-2 lg:grid-cols-4",
};

/** Total over `undefined` and over unrecognised values: a document saved
 *  before the field existed carries no `spalten`. */
export const kartenGrid = (spalten: KartenSpalten | undefined): string =>
  spalten !== undefined && Object.hasOwn(KARTEN_GRID, spalten)
    ? KARTEN_GRID[spalten]
    : KARTEN_GRID["3"];

/**
 * Uniform cards side by side — "Unsere Angebote" and the like.
 *
 * The image is decoration (`alt=""`): the title beside it carries the meaning,
 * so an alt text would be announced twice. Index keys are right here because a
 * card holds no DOM state a reorder could strand — unlike `Akkordeon`, whose
 * `<details>` open state is exactly that.
 *
 * Purely presentational and free of Puck types — the block wrapper in
 * `puck-config.tsx` owns the editor placeholder.
 */
export function KartenRaster({ karten, spalten }: { karten: Karte[]; spalten: KartenSpalten }) {
  return (
    <div className={kartenGrid(spalten)}>
      {(karten ?? []).map((k, i) => (
        <Card key={i} className="flex flex-col overflow-hidden">
          {k.bild ? (
            <img src={k.bild} alt="" aria-hidden className="aspect-video w-full object-cover" />
          ) : null}
          <div className="flex flex-col gap-2 p-6">
            {k.titel ? <p className="font-semibold text-bdas-ink">{k.titel}</p> : null}
            {k.text ? <p className="whitespace-pre-line text-bdas-ink-body">{k.text}</p> : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- KartenRaster`
Expected: PASS — all nine cases.

If the `rounded-bdas ` card-count assertion is brittle against the design system's class string, read the actual markup and count on a stable substring from `Card`'s `BASE` (`core/design-system/src/components/Card.tsx`) instead — but keep counting cards, that is what the test is for.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/KartenRaster.tsx apps/web/app/_content/KartenRaster.test.tsx
git commit -m "feat(content): add the Karten-Raster component"
```

---

## Task 2: Register the `KartenRaster` block

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (`Blocks` type; new `KartenRaster` entry in `components`)
- Modify: `apps/web/app/_content/puck-config.test.ts` (new `describe`)

**Interfaces:**

- Consumes: `KartenRaster`, `Karte`, `KartenSpalten` from `./KartenRaster` (Task 1); the existing `FotoField` custom field and `BlockPlatzhalter`.
- Produces: `puckConfig.components.KartenRaster`. Nothing later in this PR depends on it.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/app/_content/puck-config.test.ts`, inside the top-level `describe("puckConfig", …)`:

```ts
describe("KartenRaster block", () => {
  it("is registered with the German label and two fields", () => {
    const block = puckConfig.components.KartenRaster;
    expect(block?.label).toBe("Karten-Raster");
    expect(Object.keys(block?.fields ?? {}).sort()).toEqual(["karten", "spalten"]);
  });

  it("each card carries an image, a title and a text", () => {
    const karten = puckConfig.components.KartenRaster?.fields?.karten;
    if (karten?.type !== "array") throw new Error("karten must be an array field");
    expect(Object.keys(karten.arrayFields).sort()).toEqual(["bild", "text", "titel"]);
    expect(karten.arrayFields.bild?.type).toBe("custom");
  });

  it("summarises a card by its title with a German fallback", () => {
    const karten = puckConfig.components.KartenRaster?.fields?.karten;
    if (karten?.type !== "array" || !karten.getItemSummary) {
      throw new Error("array field with getItemSummary expected");
    }
    expect(karten.getItemSummary({ bild: "", titel: "Beratung", text: "" }, 0)).toBe("Beratung");
    expect(karten.getItemSummary({ bild: "", titel: "", text: "" }, 0)).toBe("Neue Karte");
  });

  it("offers 2, 3 and 4 columns and defaults to 3", () => {
    const spalten = puckConfig.components.KartenRaster?.fields?.spalten;
    if (spalten?.type !== "select") throw new Error("spalten must be a select field");
    expect(spalten.options.map((o) => o.value)).toEqual(["2", "3", "4"]);
    expect(puckConfig.components.KartenRaster?.defaultProps).toEqual({
      karten: [],
      spalten: "3",
    });
  });

  it("shows a placeholder in the editor when empty", () => {
    const render = puckConfig.components.KartenRaster?.render;
    if (!render) throw new Error("KartenRaster render missing");
    const out = renderToStaticMarkup(
      render({ karten: [], spalten: "3", puck: { isEditing: true } } as never) as never,
    );
    expect(out).toContain("Noch keine Karten");
  });

  it("renders the cards through the component", () => {
    const render = puckConfig.components.KartenRaster?.render;
    if (!render) throw new Error("KartenRaster render missing");
    const out = renderToStaticMarkup(
      render({
        karten: [{ bild: "", titel: "Beratung", text: "Wir beraten." }],
        spalten: "4",
        puck: { isEditing: false },
      } as never) as never,
    );
    expect(out).toContain("Beratung");
    expect(out).toContain("lg:grid-cols-4");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web test -- puck-config`
Expected: FAIL — every case fails on `puckConfig.components.KartenRaster` being `undefined`.

- [ ] **Step 3: Add the block to the `Blocks` type**

In `apps/web/app/_content/puck-config.tsx`, add to the imports:

```tsx
import { type Karte, KartenRaster, type KartenSpalten } from "./KartenRaster";
```

and add one entry to the `Blocks` type, after `Hero`:

```tsx
  KartenRaster: { karten: Karte[]; spalten: KartenSpalten };
```

- [ ] **Step 4: Register the component**

Add a `KartenRaster` entry to `puckConfig.components`, after `Hero`:

```tsx
    KartenRaster: {
      label: "Karten-Raster",
      fields: {
        karten: {
          type: "array",
          label: "Karten",
          arrayFields: {
            bild: {
              type: "custom",
              label: "Bild / Icon (optional)",
              render: ({ value, onChange }) => <FotoField value={value} onChange={onChange} />,
            },
            titel: { type: "text", label: "Titel" },
            text: { type: "textarea", label: "Text" },
          },
          defaultItemProps: { bild: "", titel: "", text: "" },
          getItemSummary: (k) => k.titel || "Neue Karte",
        },
        spalten: {
          type: "select",
          label: "Spalten",
          options: [
            { label: "2 Spalten", value: "2" },
            { label: "3 Spalten", value: "3" },
            { label: "4 Spalten", value: "4" },
          ],
        },
      },
      defaultProps: { karten: [], spalten: "3" },
      render: ({ karten, spalten, puck }) =>
        (karten ?? []).length === 0 && puck?.isEditing ? (
          <BlockPlatzhalter titel="Karten-Raster" hinweis="Noch keine Karten hinzugefügt." />
        ) : (
          <KartenRaster karten={karten} spalten={spalten} />
        ),
    },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test -- puck-config`
Expected: PASS — the six new cases, plus the structural sweep, which now also renders `KartenRaster` with `isEditing: false` and no `karten` prop at all and must find no `data-block-platzhalter`.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(content): add the Karten-Raster block to the Puck palette"
```

---

## Task 3: The `Kennzahlen` presentational component

**Files:**

- Create: `apps/web/app/_content/Kennzahlen.tsx`
- Create: `apps/web/app/_content/Kennzahlen.test.tsx`

**Interfaces:**

- Consumes: nothing from Tasks 1–2. Independent of `KartenRaster` by design: the two blocks share a _pattern_, not code, and forcing a common grid helper on them would couple two lookups that answer different questions (a chosen preset vs. a derived count).
- Produces:

```ts
export type Kennzahl = { wert: string; beschriftung: string };
export const kennzahlenGrid: (anzahl: number) => string;
export function Kennzahlen(props: { werte: Kennzahl[] }): JSX.Element;
```

Task 4 registers the Puck block that passes these props straight through.

**Design decisions this task locks in:**

- **No column field.** The spec lists only `{ Wert, Beschriftung }` for this block. The column count is derived from how many figures there are, so the board cannot leave a lopsided row behind: 1 → one column, 2 → two, 3 → three from `sm`, 4 or more → four from `sm`. Below `sm` it is two-across (a figure plus a short caption is narrow enough), except for the single-figure case.
- **`wert` is free text, not a number.** "500+" and "seit 1994" are the point of the block (spec §6).
- **Plain elements, not a `<dl>`.** A `<dl>` would demand the caption (`<dt>`) precede the figure (`<dd>`) in source order, which is the reverse of the reading order here; reordering with CSS to satisfy the markup is worse than not claiming the semantics. These are captioned figures, not defined terms.
- **`text-bdas-ink`, not the accent** — see Global Constraints.
- **Deviation from spec §6:** it names `typography.size` tokens for the figures, but the design system has no display-size token — `typography.size` tops out at `summary` (1.1rem), sized for accordion headers. Every existing block already sizes with Tailwind's default scale (`Ueberschrift` uses `text-2xl`/`text-xl`, `PersonenRaster` `text-sm`), so this block follows that established practice with `text-3xl`/`text-sm`. Per CLAUDE.md §7 the missing value is raised, not ad-hoc'd: **flag in the PR that a display-size token is a candidate addition to `tokens.ts`** and let the reviewer decide — do not add one in this PR.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/_content/Kennzahlen.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { Kennzahlen, kennzahlenGrid } from "./Kennzahlen";

describe("kennzahlenGrid", () => {
  it("gives a single figure the full width", () => {
    expect(kennzahlenGrid(1)).not.toContain("grid-cols-2");
  });

  it("grows the column count with the number of figures", () => {
    expect(kennzahlenGrid(2)).toContain("grid-cols-2");
    expect(kennzahlenGrid(3)).toContain("sm:grid-cols-3");
    expect(kennzahlenGrid(4)).toContain("sm:grid-cols-4");
  });

  it("caps at four columns and wraps the rest", () => {
    expect(kennzahlenGrid(7)).toBe(kennzahlenGrid(4));
  });

  it("survives zero, negative and non-finite counts", () => {
    expect(kennzahlenGrid(0)).toBe(kennzahlenGrid(1));
    expect(kennzahlenGrid(-3)).toBe(kennzahlenGrid(1));
    expect(kennzahlenGrid(Number.NaN)).toBe(kennzahlenGrid(1));
  });
});

describe("Kennzahlen", () => {
  it("renders each figure with its caption", () => {
    const out = renderToStaticMarkup(
      <Kennzahlen
        werte={[
          { wert: "500+", beschriftung: "Mitglieder" },
          { wert: "seit 1994", beschriftung: "aktiv" },
        ]}
      />,
    );
    expect(out).toContain("500+");
    expect(out).toContain("Mitglieder");
    expect(out).toContain("seit 1994");
    expect(out).toContain("grid-cols-2");
  });

  it("renders the figure in ink, never in the brand accent", () => {
    const out = renderToStaticMarkup(
      <Kennzahlen werte={[{ wert: "500+", beschriftung: "Mitglieder" }]} />,
    );
    expect(out).toContain("text-bdas-ink");
    expect(out).not.toContain("text-bdas-red");
  });

  it("survives a document saved without the array", () => {
    const out = renderToStaticMarkup(<Kennzahlen werte={undefined as never} />);
    expect(out).toContain("grid");
    expect(out).not.toContain("<p");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web test -- Kennzahlen`
Expected: FAIL — `Failed to resolve import "./Kennzahlen"`.

- [ ] **Step 3: Write the component**

Create `apps/web/app/_content/Kennzahlen.tsx`:

```tsx
import React from "react";

export type Kennzahl = {
  wert: string;
  beschriftung: string;
};

/** Literal class strings — Tailwind's scanner never sees an interpolated
 *  class. The column count is derived from how many figures there are rather
 *  than offered as a field, so the board cannot leave a lopsided row behind.
 *  Two-across below `sm` from two figures up: a figure plus a short caption is
 *  narrow enough that a single column would waste a phone screen. */
const KENNZAHLEN_GRID: Record<1 | 2 | 3 | 4, string> = {
  1: "grid gap-6",
  2: "grid grid-cols-2 gap-6",
  3: "grid grid-cols-2 gap-6 sm:grid-cols-3",
  4: "grid grid-cols-2 gap-6 sm:grid-cols-4",
};

/** Five or more figures wrap inside the four-column layout. Total over a
 *  non-finite, zero or negative count so an unexpected value can never index
 *  past the record. */
export const kennzahlenGrid = (anzahl: number): string => {
  const stufe = Number.isFinite(anzahl) ? Math.min(Math.max(Math.trunc(anzahl), 1), 4) : 1;
  return KENNZAHLEN_GRID[stufe as 1 | 2 | 3 | 4];
};

/**
 * A row of highlighted figures — "500+ Mitglieder", "seit 1994 aktiv".
 *
 * `wert` is free text on purpose: "500+" and "seit 1994" are what this block
 * is for. Plain elements rather than a `<dl>`, whose markup would demand the
 * caption precede the figure — the reverse of the reading order here.
 *
 * Purely presentational and free of Puck types — the block wrapper in
 * `puck-config.tsx` owns the editor placeholder.
 */
export function Kennzahlen({ werte }: { werte: Kennzahl[] }) {
  const liste = werte ?? [];
  return (
    <div className={kennzahlenGrid(liste.length)}>
      {liste.map((k, i) => (
        <div key={i} className="flex flex-col items-center gap-1 text-center">
          <p className="text-3xl font-semibold text-bdas-ink">{k.wert}</p>
          <p className="text-sm text-bdas-ink-muted">{k.beschriftung}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- Kennzahlen`
Expected: PASS — all seven cases.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/Kennzahlen.tsx apps/web/app/_content/Kennzahlen.test.tsx
git commit -m "feat(content): add the Kennzahlen component"
```

---

## Task 4: Register the `Kennzahlen` block

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (`Blocks` type; new `Kennzahlen` entry in `components`)
- Modify: `apps/web/app/_content/puck-config.test.ts` (new `describe`)

**Interfaces:**

- Consumes: `Kennzahlen`, `Kennzahl` from `./Kennzahlen` (Task 3); `BlockPlatzhalter`.
- Produces: `puckConfig.components.Kennzahlen`. Nothing later depends on it.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/app/_content/puck-config.test.ts`, inside the top-level `describe("puckConfig", …)`:

```ts
describe("Kennzahlen block", () => {
  it("is registered with the German label and a single array field", () => {
    const block = puckConfig.components.Kennzahlen;
    expect(block?.label).toBe("Kennzahlen");
    expect(Object.keys(block?.fields ?? {})).toEqual(["werte"]);
    expect(block?.defaultProps).toEqual({ werte: [] });
  });

  it("each entry carries a free-text value and a caption", () => {
    const werte = puckConfig.components.Kennzahlen?.fields?.werte;
    if (werte?.type !== "array") throw new Error("werte must be an array field");
    expect(Object.keys(werte.arrayFields).sort()).toEqual(["beschriftung", "wert"]);
    expect(werte.arrayFields.wert?.type).toBe("text");
  });

  it("summarises an entry by its value with a German fallback", () => {
    const werte = puckConfig.components.Kennzahlen?.fields?.werte;
    if (werte?.type !== "array" || !werte.getItemSummary) {
      throw new Error("array field with getItemSummary expected");
    }
    expect(werte.getItemSummary({ wert: "500+", beschriftung: "Mitglieder" }, 0)).toBe("500+");
    expect(werte.getItemSummary({ wert: "", beschriftung: "" }, 0)).toBe("Neue Kennzahl");
  });

  it("shows a placeholder in the editor when empty", () => {
    const render = puckConfig.components.Kennzahlen?.render;
    if (!render) throw new Error("Kennzahlen render missing");
    const out = renderToStaticMarkup(
      render({ werte: [], puck: { isEditing: true } } as never) as never,
    );
    expect(out).toContain("Noch keine Kennzahlen");
  });

  it("renders the figures through the component", () => {
    const render = puckConfig.components.Kennzahlen?.render;
    if (!render) throw new Error("Kennzahlen render missing");
    const out = renderToStaticMarkup(
      render({
        werte: [
          { wert: "500+", beschriftung: "Mitglieder" },
          { wert: "12", beschriftung: "Hochschulgruppen" },
        ],
        puck: { isEditing: false },
      } as never) as never,
    );
    expect(out).toContain("500+");
    expect(out).toContain("Hochschulgruppen");
    expect(out).toContain("grid-cols-2");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web test -- puck-config`
Expected: FAIL — every case fails on `puckConfig.components.Kennzahlen` being `undefined`.

- [ ] **Step 3: Add the block to the `Blocks` type**

In `apps/web/app/_content/puck-config.tsx`, add to the imports:

```tsx
import { type Kennzahl, Kennzahlen } from "./Kennzahlen";
```

and add one entry to the `Blocks` type, after `KartenRaster`:

```tsx
  Kennzahlen: { werte: Kennzahl[] };
```

- [ ] **Step 4: Register the component**

Add a `Kennzahlen` entry to `puckConfig.components`, after `KartenRaster`:

```tsx
    Kennzahlen: {
      label: "Kennzahlen",
      fields: {
        werte: {
          type: "array",
          label: "Kennzahlen",
          arrayFields: {
            // Free text, not a number field: "500+" and "seit 1994" are the
            // point of the block (spec §6).
            wert: { type: "text", label: "Wert (z. B. „500+“)" },
            beschriftung: { type: "text", label: "Beschriftung" },
          },
          defaultItemProps: { wert: "", beschriftung: "" },
          getItemSummary: (k) => k.wert || "Neue Kennzahl",
        },
      },
      defaultProps: { werte: [] },
      render: ({ werte, puck }) =>
        (werte ?? []).length === 0 && puck?.isEditing ? (
          <BlockPlatzhalter titel="Kennzahlen" hinweis="Noch keine Kennzahlen hinzugefügt." />
        ) : (
          <Kennzahlen werte={werte} />
        ),
    },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test -- puck-config`
Expected: PASS — the five new cases, plus the structural sweep with `Kennzahlen` rendered at `isEditing: false` and no `werte` prop.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(content): add the Kennzahlen block to the Puck palette"
```

---

## Task 5: Full gate, manual check, PR

**Files:** none changed unless a gate fails.

- [ ] **Step 1: Run the whole repo gate**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

Expected: all four PASS. If `pnpm format:check` fails on this plan file, run `pnpm format` and commit the result rather than hand-fixing.

- [ ] **Step 2: Production build**

Run: `pnpm --filter web build`
Expected: PASS. Note this catches build errors, not a Tailwind class silently missing from the CSS — Step 3 is what confirms the grids actually render.

- [ ] **Step 3: Manual check in the editor**

Confirm nothing else owns port 3000 first (`lsof -i :3000`) — another worktree's stale server will serve an old build and any result you get is meaningless.

```bash
pnpm --filter web dev
```

Open the `ueber-uns` editor and verify by eye:

1. A `Karten-Raster` at 2, 3 and 4 columns, with and without images, and that it collapses to a single column when the browser is narrowed to phone width.
2. A card with a title but no text, and one with an image but no title, both render without an empty gap.
3. `Kennzahlen` with one, two, three, four and six entries — the row rebalances each time and six wraps into two rows of four and two.
4. The preview toggle from PR1 ("Vorschau") shows both blocks with no editing chrome over them.
5. Save, then open the public page and confirm it matches the preview.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/content-layout-pr3
gh pr create --base main \
  --title "feat(content): freies Layout & neue Puck-Blöcke — PR3 (Karten-Raster & Kennzahlen)" \
  --body "Implements the Feature-/Karten-Grid and the Stats/Zahlen-Reihe (spec §6, ADR 0036, PR 3 of 5).

- \`KartenRaster\`: array of image + title + text, rendered into design-system \`Card\`s at 2/3/4 columns, single column below \`sm\` because a feature card carries a paragraph.
- \`Kennzahlen\`: array of free-text value + caption. No column field — the count is derived from the number of figures, so a lopsided row is not reachable.
- Card images are decorative (\`alt=\"\"\`): the title beside them carries the meaning.
- Figures render in \`text-bdas-ink\`, deliberately not the brand accent — ADR 0036 scopes the accent to the CTA banner (PR4).
- **Open question for the reviewer:** spec §6 names \`typography.size\` tokens for the figures, but the design system has no display-size token (it tops out at \`summary\`, 1.1rem). This PR follows the established practice of every existing block and sizes with Tailwind's default scale. A display-size token in \`tokens.ts\` would be the alternative — raising it rather than ad-hoc'ing one, per CLAUDE.md §7.
- No new runtime dependency. No schema, migration, or feature-flag change."
```

- [ ] **Step 5: Review**

Run `/review` on the PR (CLAUDE.md §4). No `/security-review` — no auth, payments, or files surface. Point the reviewer at the derived column count for `Kennzahlen` and the decision not to use the accent colour; those are the two judgement calls here.

---

## Out of scope for this PR

CTA-Banner (PR4), Karussell plus `embla-carousel-react` and the carousel design-system recipe (PR5). No new slug, route, or E2E flow — spec §11 leaves the existing editor/content-page coverage in place. No shared grid helper across the two blocks: they answer different questions (a chosen preset vs. a derived count) and a common lookup would couple them for no gain.
