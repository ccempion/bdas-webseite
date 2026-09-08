# Content-Seiten Layout-Erweiterung — PR2 (Hero) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Hero`/Header-Section block to the Puck palette — a full-width opener with a headline, sub-text, an optional button, three height presets, and one of three backgrounds (light surface, brand accent, or a photo behind the scrim).

**Architecture:** The Hero's render is too large to sit inline in `puck-config.tsx` (already ~700 lines), so it becomes its own presentational component (`Hero.tsx`) — the same shape `Organigramm.tsx` already has. That inverts an import: `puck-config.tsx` starts importing block components, so the two lookups those components need (`ausrichtung*`, and the button classes now shared between the `Button` block and the Hero) must first move into leaf modules, exactly as `bild-breite.ts` did for the same reason. Four tasks: two extractions (behaviour-preserving), the component, then the block registration. No `modules/content` schema, migration, or feature-flag change — `root.props` and block `props` are already opaque passthrough JSON.

**Tech Stack:** Next.js 14 App Router, `@puckeditor/core@0.23.0` (pinned), Tailwind CSS 3.4 via `core/design-system` tokens, Vitest (`renderToStaticMarkup`, node environment).

**Spec:** `docs/superpowers/specs/2026-09-08-content-pages-layout-erweiterung-design.md` (§6 Hero/Header-Section, §10 PR-Sequenzierung Nr. 2, §11 Tests, §12 height presets deferred to this plan). Reference: `docs/decisions/0036-puck-freeform-layout-and-block-expansion.md`. Predecessor: `docs/superpowers/plans/2026-09-08-content-pages-layout-pr1-fundament.md` (merged as PR #203).

## Global Constraints

- No MUI/Emotion, no raw HTML block, no free-text CSS/styling prop on any block (ADR 0023, unchanged). No `dangerouslySetInnerHTML`.
- Every class must be a **literal string** — never an interpolated/dynamic Tailwind class. Tailwind's scanner only sees literals; `ausrichtungText`, `bildBreiteClass` and `SPALTEN_LAYOUT` all follow this and so must every lookup below.
- Only `core/design-system` tokens (`bdas-*` utilities from `core/design-system/src/tailwind-preset.ts`) — no ad-hoc hex, radius, shadow, or duration values. The one exception this plan takes is the three `min-h-[…]` height literals in Task 3, justified there.
- Brand red `#d12020` (`bg-bdas-red`) is an accent/active state, never a default text colour (CLAUDE.md §7). The Hero may use it as a **surface**; it never becomes body text.
- Documents saved before a prop existed must keep rendering byte-identically. Every new lookup is **total** over `undefined` and over unrecognised values — `Object.hasOwn` guard plus a default, as in `bildBreiteClass`.
- `BlockPlatzhalter` is editor-only. It must be gated on `puck?.isEditing` and never reach `<Render>` — `puck-config.test.ts` has a structural sweep that renders every registered block with `isEditing: false` and asserts no `data-block-platzhalter` in the output.
- `@puckeditor/core` stays pinned at `^0.23.0`. **No new runtime dependency in this PR** — `embla-carousel-react` belongs to PR5 alone (spec §8).
- Branch off `main` (which carries PR #203). Never branch off another feature worktree.

---

## Task 1: Extract `ausrichtung.ts` as a leaf module

Pure refactor, no behaviour change. `Hero.tsx` (Task 3) needs `ausrichtungText`/`ausrichtungFlex`, and `puck-config.tsx` will import `Hero.tsx` — so the lookup cannot stay in `puck-config.tsx` without a cycle. This is the same reasoning `bild-breite.ts` documents in its own header comment.

**Files:**

- Create: `apps/web/app/_content/ausrichtung.ts`
- Create: `apps/web/app/_content/ausrichtung.test.ts`
- Modify: `apps/web/app/_content/puck-config.tsx` (remove the type + two helpers + two records; import and re-export them instead)

**Interfaces:**

- Produces: `export type Ausrichtung = "links" | "mittig" | "rechts"`, `export const ausrichtungText: (a: Ausrichtung | undefined) => string`, `export const ausrichtungFlex: (a: Ausrichtung | undefined) => string` — all from `./ausrichtung`. `puck-config.tsx` re-exports all three unchanged, so every existing importer (including `puck-config.test.ts`) keeps working with no edit.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_content/ausrichtung.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ausrichtungFlex, ausrichtungText } from "./ausrichtung";

describe("ausrichtung", () => {
  it("maps each value to its text class", () => {
    expect(ausrichtungText("links")).toBe("text-left");
    expect(ausrichtungText("mittig")).toBe("text-center");
    expect(ausrichtungText("rechts")).toBe("text-right");
  });

  it("maps each value to its flex-justify class", () => {
    expect(ausrichtungFlex("links")).toBe("justify-start");
    expect(ausrichtungFlex("mittig")).toBe("justify-center");
    expect(ausrichtungFlex("rechts")).toBe("justify-end");
  });

  it("falls back to left for a missing or unknown value", () => {
    expect(ausrichtungText(undefined)).toBe("text-left");
    expect(ausrichtungFlex(undefined)).toBe("justify-start");
    expect(ausrichtungText("mitte" as never)).toBe("text-left");
    expect(ausrichtungFlex("mitte" as never)).toBe("justify-start");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test -- ausrichtung`
Expected: FAIL — `Failed to resolve import "./ausrichtung"`, the module does not exist yet.

- [ ] **Step 3: Create the leaf module**

Create `apps/web/app/_content/ausrichtung.ts` with the code **moved verbatim** out of `puck-config.tsx:74-99` (type, both records, both helpers), plus a header comment explaining why it is its own file:

```ts
/**
 * Per-block horizontal alignment (ADR 0023 palette). `links` is the default
 * and is what every block rendered before the control existed.
 *
 * Its own leaf module for the same reason as `bild-breite.ts`: block
 * components that live in their own files (`Hero.tsx`, and the grid blocks in
 * PR3) need these helpers, and `puck-config.tsx` imports those files — so the
 * shared lookup cannot live in `puck-config.tsx` without a cycle.
 * `puck-config.tsx` re-exports all three, so existing importers are unaffected.
 */
export type Ausrichtung = "links" | "mittig" | "rechts";

const AUSRICHTUNG_TEXT: Record<Ausrichtung, string> = {
  links: "text-left",
  mittig: "text-center",
  rechts: "text-right",
};

const AUSRICHTUNG_FLEX: Record<Ausrichtung, string> = {
  links: "justify-start",
  mittig: "justify-center",
  rechts: "justify-end",
};

/** Both lookups fall back to the `links` classes for a missing or unrecognised
 *  value: documents saved before this field existed carry no `ausrichtung`,
 *  and they must keep rendering exactly as they did. Class strings are
 *  literals — Tailwind's scanner never sees an interpolated class. */
export const ausrichtungText = (a: Ausrichtung | undefined): string =>
  a !== undefined && Object.hasOwn(AUSRICHTUNG_TEXT, a)
    ? AUSRICHTUNG_TEXT[a]
    : AUSRICHTUNG_TEXT.links;

export const ausrichtungFlex = (a: Ausrichtung | undefined): string =>
  a !== undefined && Object.hasOwn(AUSRICHTUNG_FLEX, a)
    ? AUSRICHTUNG_FLEX[a]
    : AUSRICHTUNG_FLEX.links;
```

- [ ] **Step 4: Delete the originals from `puck-config.tsx` and re-export**

In `apps/web/app/_content/puck-config.tsx`, delete the block that currently spans from the `/** Per-block horizontal alignment (ADR 0023 palette). … */` comment down to the end of the `ausrichtungFlex` arrow function (`puck-config.tsx:74-99`). Add to the import block at the top (import list stays alphabetically sorted — `./ausrichtung` sorts before `./bild-breite`):

```tsx
import { type Ausrichtung, ausrichtungFlex, ausrichtungText } from "./ausrichtung";
```

And directly below the imports, add the re-export so nothing downstream has to change:

```tsx
// Re-exported from their leaf module (see `ausrichtung.ts`): `puck-config.tsx`
// stayed the import site for these three long before block components moved
// into their own files, and every consumer still imports them from here.
export { ausrichtungFlex, ausrichtungText } from "./ausrichtung";
export type { Ausrichtung } from "./ausrichtung";
```

Two separate statements: `verbatimModuleSyntax`/`isolatedModules` requires the type to leave through `export type`.

- [ ] **Step 5: Run the full content test file to verify nothing moved**

Run: `pnpm --filter web test -- _content`
Expected: PASS — every existing `puck-config.test.ts` assertion (including `ausrichtungText`/`ausrichtungFlex`, which it imports from `./puck-config`) still passes, plus the four new `ausrichtung.test.ts` cases.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS, no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_content/ausrichtung.ts apps/web/app/_content/ausrichtung.test.ts apps/web/app/_content/puck-config.tsx
git commit -m "refactor(content): move Ausrichtung lookups into a leaf module"
```

---

## Task 2: Extract `button-klasse.ts`, with a third `hell` variant

The Hero renders a link styled as a button, and so does the `Button` block. One definition, one leaf module — and the Hero needs a variant neither existing one can play: on brand red or on a scrimmed photo, `primaer` is red-on-red and `sekundaer` is a hairline outline with no contrast.

**Files:**

- Create: `apps/web/app/_content/button-klasse.ts`
- Create: `apps/web/app/_content/button-klasse.test.ts`
- Modify: `apps/web/app/_content/puck-config.tsx` (the `Button` block's `render` — replace the inline `const cls = …` ternary with a call)

**Interfaces:**

- Produces: `export type ButtonVariante = "primaer" | "sekundaer" | "hell"`, `export const buttonKlasse: (v: ButtonVariante | undefined) => string`. Task 3 (`Hero.tsx`) calls `buttonKlasse("hell")` and `buttonKlasse("primaer")`.
- Consumes: nothing from Task 1.

**Note on `hell`:** it is introduced here and consumed two tasks later in the same PR — not a speculative abstraction. The `Button` block's `variante` field keeps offering exactly two options; `hell` is never editor-selectable, only derived by the Hero from its background.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_content/button-klasse.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buttonKlasse } from "./button-klasse";

describe("buttonKlasse", () => {
  it("keeps the primary button on the brand-red surface", () => {
    const cls = buttonKlasse("primaer");
    expect(cls).toContain("bg-bdas-red");
    expect(cls).toContain("rounded-bdas-sm");
  });

  it("keeps the secondary button as a hairline outline", () => {
    const cls = buttonKlasse("sekundaer");
    expect(cls).toContain("border-bdas-strong");
    expect(cls).not.toContain("bg-bdas-red");
  });

  it("hell is a light surface with ink text, for dark hero grounds", () => {
    const cls = buttonKlasse("hell");
    expect(cls).toContain("bg-bdas-surface");
    expect(cls).toContain("text-bdas-ink");
    expect(cls).not.toContain("bg-bdas-red");
  });

  it("falls back to primaer for a missing or unknown variant", () => {
    expect(buttonKlasse(undefined)).toBe(buttonKlasse("primaer"));
    expect(buttonKlasse("gross" as never)).toBe(buttonKlasse("primaer"));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test -- button-klasse`
Expected: FAIL — `Failed to resolve import "./button-klasse"`.

- [ ] **Step 3: Create the leaf module**

Create `apps/web/app/_content/button-klasse.ts`. The `primaer` and `sekundaer` strings are **copied character-for-character** from the `Button` block's current `render` so the extraction changes no pixel:

```ts
/**
 * The one button class scale in the Puck palette.
 *
 * Its own leaf module because two blocks render a link styled as a button —
 * the `Button` block, inline in `puck-config.tsx`, and `Hero.tsx`, which
 * `puck-config.tsx` imports. Same cycle-avoidance reasoning as `bild-breite.ts`.
 */
export type ButtonVariante = "primaer" | "sekundaer" | "hell";

const BUTTON_KLASSE: Record<ButtonVariante, string> = {
  primaer:
    "inline-flex items-center rounded-bdas-sm bg-bdas-red px-4 py-2 text-sm font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:opacity-90",
  sekundaer:
    "inline-flex items-center rounded-bdas-sm border border-bdas-strong px-4 py-2 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover",
  // Only ever reached from `Hero`, where the ground is the brand red or a
  // scrimmed photo: `primaer` would be red on red and `sekundaer`'s hairline
  // outline has no contrast on either. Not offered in the `Button` block's
  // select — the Hero derives it from its own background. Composed from
  // existing tokens only; no new raw values.
  hell: "inline-flex items-center rounded-bdas-sm bg-bdas-surface px-4 py-2 text-sm font-medium text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover",
};

/** Total over `undefined` and over unrecognised values: a document saved
 *  before the field existed carries no `variante`, and the old default was
 *  the primary button. */
export const buttonKlasse = (v: ButtonVariante | undefined): string =>
  v !== undefined && Object.hasOwn(BUTTON_KLASSE, v) ? BUTTON_KLASSE[v] : BUTTON_KLASSE.primaer;
```

- [ ] **Step 4: Point the `Button` block at it**

In `apps/web/app/_content/puck-config.tsx`, add to the imports:

```tsx
import { buttonKlasse } from "./button-klasse";
```

In the `Button` block's `render`, replace the whole inline declaration:

```tsx
const cls =
  variante === "sekundaer"
    ? "inline-flex items-center rounded-bdas-sm border border-bdas-strong px-4 py-2 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
    : "inline-flex items-center rounded-bdas-sm bg-bdas-red px-4 py-2 text-sm font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:opacity-90";
```

with:

```tsx
const cls = buttonKlasse(variante);
```

Nothing else in that render changes.

- [ ] **Step 5: Run the tests to verify they pass and the Button is untouched**

Run: `pnpm --filter web test -- _content`
Expected: PASS — the four new cases, plus every existing `Button` assertion in `puck-config.test.ts` (which asserts on the rendered markup, so an accidental class change would fail here).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_content/button-klasse.ts apps/web/app/_content/button-klasse.test.ts apps/web/app/_content/puck-config.tsx
git commit -m "refactor(content): share the button classes through a leaf module"
```

---

## Task 3: The `Hero` presentational component

**Files:**

- Create: `apps/web/app/_content/Hero.tsx`
- Create: `apps/web/app/_content/Hero.test.tsx`

**Interfaces:**

- Consumes: `ausrichtungText`, `ausrichtungFlex`, `Ausrichtung` from `./ausrichtung` (Task 1); `buttonKlasse` from `./button-klasse` (Task 2); `safeHref`, `isExternalHref` from `./href` (already exists — `safeHref(value: string) => string | null`, `isExternalHref(href: string) => boolean`).
- Produces:

```ts
export type HeroHintergrund = "hell" | "akzent" | "bild";
export type HeroHoehe = "kompakt" | "mittel" | "gross";
export type HeroProps = {
  ueberschrift: string;
  untertext: string;
  hintergrund: HeroHintergrund;
  bild: string;
  hoehe: HeroHoehe;
  ausrichtung: Ausrichtung;
  buttonLabel: string;
  buttonHref: string;
};
export function Hero(props: HeroProps): JSX.Element;
```

Task 4 registers the Puck block that passes these props straight through.

**Design decisions this task locks in** (spec §12 left them to the PR plan):

- **Height presets:** `kompakt` = `min-h-[16rem]`, `mittel` = `min-h-[24rem]`, `gross` = `min-h-[70vh]`. Arbitrary-value literals, not tokens, because the design system has no height scale — and `min-h-[70vh]` is already the established hero height in `app/_public/landing/HeroSlideshow.tsx:26`. Literal strings, so Tailwind's scanner sees them.
- **Photo backgrounds render as `<img>`, not `background-image: url(…)`.** The value is editor-supplied; a quote or paren inside it would break out of a `url()` and inject CSS. React escapes an attribute, it does not escape a style string. `HeroSlideshow` may use the CSS form because its URLs are a hardcoded module constant. The `Bild` block already renders editor images as `<img src={…}>`.
- **The headline is an `<h2>`,** not an `<h1>`: the routes that will carry a Hero already render their own `<h1>` in the page header above the Puck content (`app/ueber-uns/page.tsx`), and a second `<h1>` is an accessibility regression, not a feature.
- **White text needs a dark ground.** `dunkel` is true for `akzent`, and for `bild` **only once an image is actually set** — a Hero set to "photo" before the board uploads one falls back to the light surface and must stay dark-on-light, or the text vanishes.
- **Shadow: `shadow-bdas-card-low`, not `cardLiftLg`.** Spec §6 names `cardLiftLg` for this block, but that token is the hero card's _hover_ shadow (`core/design-system/src/tokens.ts`: "Hero card hover — pronounced float") and a Hero section is not a hoverable card — it would never enter that state. `cardLow` is the resting half of the same recipe ("Hero card resting"), which is the state a Hero section is permanently in. Note the deviation in the PR body so the reviewer sees it was a reading of the recipe, not an oversight.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/_content/Hero.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { Hero, type HeroProps } from "./Hero";

const basis: HeroProps = {
  ueberschrift: "Wer wir sind",
  untertext: "Der Bund der alevitischen Studierenden.",
  hintergrund: "hell",
  bild: "",
  hoehe: "mittel",
  ausrichtung: "links",
  buttonLabel: "",
  buttonHref: "",
};

const render = (props: Partial<HeroProps>) => renderToStaticMarkup(<Hero {...basis} {...props} />);

describe("Hero", () => {
  it("renders headline and sub-text with ink colours on the light surface", () => {
    const out = render({});
    expect(out).toContain("Wer wir sind");
    expect(out).toContain("Der Bund der alevitischen Studierenden.");
    expect(out).toContain("text-bdas-ink");
    expect(out).not.toContain("text-bdas-ink-on-brand");
  });

  it("uses the brand-red surface and on-brand text for the accent background", () => {
    const out = render({ hintergrund: "akzent" });
    expect(out).toContain("bg-bdas-red");
    expect(out).toContain("text-bdas-ink-on-brand");
  });

  it("renders a photo background as an img behind the scrim, never as inline CSS", () => {
    const out = render({ hintergrund: "bild", bild: "https://cdn.example/foto.webp" });
    expect(out).toContain('src="https://cdn.example/foto.webp"');
    expect(out).toContain("bg-bdas-hero-scrim");
    expect(out).not.toContain("background-image");
    expect(out).toContain("text-bdas-ink-on-brand");
  });

  it("escapes a hostile image value instead of letting it reach CSS", () => {
    const out = render({ hintergrund: "bild", bild: "x'); background: url('evil" });
    // The payload must land inside an escaped attribute and nowhere near a
    // style string. Do not assert on the absence of "background:" — the
    // payload itself contains it, escaped and inert, in the src attribute.
    expect(out).not.toContain("style=");
    expect(out).toContain("&#x27;");
  });

  it("stays dark-on-light when the photo background has no image yet", () => {
    const out = render({ hintergrund: "bild", bild: "" });
    expect(out).not.toContain("text-bdas-ink-on-brand");
    expect(out).not.toContain("bg-bdas-hero-scrim");
  });

  it("rests on the hero-card shadow, not the hover one", () => {
    const out = render({});
    expect(out).toContain("shadow-bdas-card-low");
    expect(out).not.toContain("shadow-bdas-lift-lg");
  });

  it("maps each height preset to its own class", () => {
    expect(render({ hoehe: "kompakt" })).toContain("min-h-[16rem]");
    expect(render({ hoehe: "mittel" })).toContain("min-h-[24rem]");
    expect(render({ hoehe: "gross" })).toContain("min-h-[70vh]");
  });

  it("falls back to the mittel height and the light surface for unknown values", () => {
    const out = render({
      hoehe: undefined as never,
      hintergrund: undefined as never,
    });
    expect(out).toContain("min-h-[24rem]");
    expect(out).not.toContain("bg-bdas-red");
  });

  it("renders the optional button only when label and href are both usable", () => {
    expect(render({ buttonLabel: "Mehr erfahren", buttonHref: "/ueber-uns" })).toContain(
      'href="/ueber-uns"',
    );
    expect(render({ buttonLabel: "", buttonHref: "/ueber-uns" })).not.toContain("<a");
    expect(render({ buttonLabel: "Mehr erfahren", buttonHref: "" })).not.toContain("<a");
    expect(
      render({ buttonLabel: "Mehr erfahren", buttonHref: "javascript:alert(1)" }),
    ).not.toContain("<a");
  });

  it("gives the button a light variant on a dark ground and the primary one on light", () => {
    const dunkel = render({
      hintergrund: "akzent",
      buttonLabel: "Mitglied werden",
      buttonHref: "/mitglied-werden",
    });
    expect(dunkel).toContain("bg-bdas-surface px-4");
    const hellGrund = render({
      buttonLabel: "Mitglied werden",
      buttonHref: "/mitglied-werden",
    });
    expect(hellGrund).toContain("bg-bdas-red px-4");
  });

  it("opens an external button link in a new tab with a safe rel", () => {
    const out = render({ buttonLabel: "Zum BDAJ", buttonHref: "https://bdaj.de" });
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("carries the alignment through to text and button row", () => {
    const out = render({
      ausrichtung: "mittig",
      buttonLabel: "Los",
      buttonHref: "/los",
    });
    expect(out).toContain("text-center");
    expect(out).toContain("justify-center");
  });

  it("renders nothing but the frame when every field is empty", () => {
    const out = render({ ueberschrift: "", untertext: "" });
    expect(out).not.toContain("<h2");
    expect(out).not.toContain("<p");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web test -- Hero`
Expected: FAIL — `Failed to resolve import "./Hero"`.

- [ ] **Step 3: Write the component**

Create `apps/web/app/_content/Hero.tsx`:

```tsx
import React from "react";

import { type Ausrichtung, ausrichtungFlex, ausrichtungText } from "./ausrichtung";
import { buttonKlasse } from "./button-klasse";
import { isExternalHref, safeHref } from "./href";

export type HeroHintergrund = "hell" | "akzent" | "bild";
export type HeroHoehe = "kompakt" | "mittel" | "gross";

export type HeroProps = {
  ueberschrift: string;
  untertext: string;
  hintergrund: HeroHintergrund;
  bild: string;
  hoehe: HeroHoehe;
  ausrichtung: Ausrichtung;
  buttonLabel: string;
  buttonHref: string;
};

/** Height presets. Arbitrary-value literals rather than tokens: the design
 *  system has no height scale, and `70vh` is already the established hero
 *  height (`app/_public/landing/HeroSlideshow.tsx`). Literal strings, so
 *  Tailwind's scanner sees each one. */
const HOEHE: Record<HeroHoehe, string> = {
  kompakt: "min-h-[16rem]",
  mittel: "min-h-[24rem]",
  gross: "min-h-[70vh]",
};

/** Resting surface behind the content. `bild` shares the light fallback: it is
 *  what shows until the board has actually uploaded a photo. */
const FLAECHE: Record<HeroHintergrund, string> = {
  hell: "bg-bdas-overlay-soft",
  akzent: "bg-bdas-red",
  bild: "bg-bdas-overlay-soft",
};

const heroHoehe = (h: HeroHoehe | undefined): string =>
  h !== undefined && Object.hasOwn(HOEHE, h) ? HOEHE[h] : HOEHE.mittel;

const heroFlaeche = (h: HeroHintergrund | undefined): string =>
  h !== undefined && Object.hasOwn(FLAECHE, h) ? FLAECHE[h] : FLAECHE.hell;

/**
 * Opening section for a content page: headline, sub-text, optional button, on
 * one of three grounds.
 *
 * `<h2>`, not `<h1>`: the routes that carry a Hero render their own page `<h1>`
 * above the Puck content, and a second one is an accessibility regression.
 *
 * Purely presentational and free of Puck types — the block wrapper in
 * `puck-config.tsx` owns the editor placeholder, so this file has no
 * `isEditing` branch and stays directly testable.
 */
export function Hero({
  ueberschrift,
  untertext,
  hintergrund,
  bild,
  hoehe,
  ausrichtung,
  buttonLabel,
  buttonHref,
}: HeroProps) {
  const mitBild = hintergrund === "bild" && (bild ?? "") !== "";
  // White text needs a dark ground under it. A photo Hero without a photo yet
  // falls back to the light surface, so it must stay dark-on-light.
  const dunkel = hintergrund === "akzent" || mitBild;
  const href = safeHref(buttonHref ?? "");
  const label = (buttonLabel ?? "").trim();
  const hoeheKlasse = heroHoehe(hoehe);

  return (
    // `isolate` opens a stacking context so the `-z-10` layers below sit behind
    // the content but never behind the section's own background.
    <section
      className={`relative isolate overflow-hidden rounded-bdas shadow-bdas-card-low ${hoeheKlasse} ${
        mitBild ? "" : heroFlaeche(hintergrund)
      }`}
    >
      {mitBild ? (
        <>
          {/* An <img>, not `background-image: url(...)`: `bild` is
              editor-supplied and a quote or paren in it would break out of the
              url() and inject CSS. React escapes an attribute; it does not
              escape a style string. `alt=""` because the headline carries the
              meaning — this is wallpaper. */}
          <img
            src={bild}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
          <div aria-hidden className="absolute inset-0 -z-10 bg-bdas-hero-scrim" />
        </>
      ) : null}
      <div
        className={`flex ${hoeheKlasse} flex-col justify-center gap-4 p-8 sm:p-12 ${ausrichtungText(
          ausrichtung,
        )}`}
      >
        {ueberschrift ? (
          <h2
            className={`text-3xl font-semibold sm:text-4xl ${
              dunkel ? "text-bdas-ink-on-brand" : "text-bdas-ink"
            }`}
          >
            {ueberschrift}
          </h2>
        ) : null}
        {untertext ? (
          <p
            className={`whitespace-pre-line ${
              dunkel ? "text-bdas-ink-on-brand" : "text-bdas-ink-body"
            }`}
          >
            {untertext}
          </p>
        ) : null}
        {href && label ? (
          <div className={`flex ${ausrichtungFlex(ausrichtung)}`}>
            {isExternalHref(href) ? (
              <a
                href={href}
                rel="noopener noreferrer"
                target="_blank"
                className={buttonKlasse(dunkel ? "hell" : "primaer")}
              >
                {label}
              </a>
            ) : (
              <a href={href} className={buttonKlasse(dunkel ? "hell" : "primaer")}>
                {label}
              </a>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- Hero`
Expected: PASS — all thirteen cases.

If the hostile-value case fails on the exact entity (`&#x27;`), read the actual output before changing the assertion: the point of the test is that the value lands in an escaped attribute and never in a `style` string. `expect(out).not.toContain("background:")` is the assertion that must hold; adjust the entity assertion to whatever `renderToStaticMarkup` actually emits, do not weaken the first one.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/Hero.tsx apps/web/app/_content/Hero.test.tsx
git commit -m "feat(content): add the Hero section component"
```

---

## Task 4: Register the `Hero` block in the Puck palette

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (`Blocks` type; new `Hero` entry in `components`)
- Modify: `apps/web/app/_content/puck-config.test.ts` (new `describe`; update the "exactly the six intended blocks carry an Ausrichtung field" guard)

**Interfaces:**

- Consumes: `Hero`, `HeroHintergrund`, `HeroHoehe` from `./Hero` (Task 3); `Ausrichtung` from `./ausrichtung` (Task 1); the existing `FotoField` custom field and `BlockPlatzhalter`.
- Produces: `puckConfig.components.Hero` — a registered block. Nothing later in this PR depends on it.

**Guard test that WILL break if you skip it:** `puck-config.test.ts` asserts `exactly the six intended blocks carry an Ausrichtung field` with the list `["Absatz", "Bild", "Button", "Fliesstext", "Ueberschrift", "Zitat"]`. The Hero has an `ausrichtung` field, so that list becomes seven entries and the test title becomes "seven". This is a deliberate tripwire, not an obstacle — update it, do not delete it.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/app/_content/puck-config.test.ts`, inside the top-level `describe("puckConfig", …)`, next to the existing `describe("Panel block", …)`:

```ts
describe("Hero block", () => {
  it("is registered with the German label and its eight fields", () => {
    const hero = puckConfig.components.Hero;
    expect(hero?.label).toBe("Hero / Aufmacher");
    expect(Object.keys(hero?.fields ?? {}).sort()).toEqual([
      "ausrichtung",
      "bild",
      "buttonHref",
      "buttonLabel",
      "hintergrund",
      "hoehe",
      "ueberschrift",
      "untertext",
    ]);
  });

  it("offers exactly three backgrounds and three heights", () => {
    const hintergrund = puckConfig.components.Hero?.fields?.hintergrund;
    if (hintergrund?.type !== "select") throw new Error("hintergrund must be a select");
    expect(hintergrund.options.map((o) => o.value)).toEqual(["hell", "akzent", "bild"]);

    const hoehe = puckConfig.components.Hero?.fields?.hoehe;
    if (hoehe?.type !== "select") throw new Error("hoehe must be a select");
    expect(hoehe.options.map((o) => o.value)).toEqual(["kompakt", "mittel", "gross"]);
  });

  it("takes its image through the shared upload field", () => {
    expect(puckConfig.components.Hero?.fields?.bild?.type).toBe("custom");
  });

  it("defaults to the light surface, mittel height and left alignment", () => {
    expect(puckConfig.components.Hero?.defaultProps).toEqual({
      ueberschrift: "Überschrift",
      untertext: "",
      hintergrund: "hell",
      bild: "",
      hoehe: "mittel",
      ausrichtung: "links",
      buttonLabel: "",
      buttonHref: "",
    });
  });

  it("renders the headline through the Hero component", () => {
    const render = puckConfig.components.Hero?.render;
    if (!render) throw new Error("Hero render missing");
    const out = renderToStaticMarkup(
      render({
        ueberschrift: "Wer wir sind",
        untertext: "",
        hintergrund: "hell",
        bild: "",
        hoehe: "mittel",
        ausrichtung: "links",
        buttonLabel: "",
        buttonHref: "",
        puck: { isEditing: false },
      } as never) as never,
    );
    expect(out).toContain("Wer wir sind");
    expect(out).toContain("min-h-[24rem]");
  });

  it("shows a placeholder in the editor while headline, text and image are all empty", () => {
    const render = puckConfig.components.Hero?.render;
    if (!render) throw new Error("Hero render missing");
    const out = renderToStaticMarkup(
      render({
        ueberschrift: "",
        untertext: "",
        hintergrund: "hell",
        bild: "",
        hoehe: "mittel",
        ausrichtung: "links",
        buttonLabel: "",
        buttonHref: "",
        puck: { isEditing: true },
      } as never) as never,
    );
    expect(out).toContain("data-block-platzhalter");
    expect(out).toContain("Noch kein Inhalt");
  });

  it("renders nothing at all on the public page while empty", () => {
    const render = puckConfig.components.Hero?.render;
    if (!render) throw new Error("Hero render missing");
    const out = renderToStaticMarkup(
      render({
        ueberschrift: "",
        untertext: "",
        hintergrund: "akzent",
        bild: "",
        hoehe: "mittel",
        ausrichtung: "links",
        buttonLabel: "",
        buttonHref: "",
        puck: { isEditing: false },
      } as never) as never,
    );
    expect(out).toBe("");
  });

  it("renders the real hero, not the placeholder, as soon as one field is filled", () => {
    const render = puckConfig.components.Hero?.render;
    if (!render) throw new Error("Hero render missing");
    const out = renderToStaticMarkup(
      render({
        ueberschrift: "",
        untertext: "",
        hintergrund: "bild",
        bild: "https://cdn.example/foto.webp",
        hoehe: "kompakt",
        ausrichtung: "links",
        buttonLabel: "",
        buttonHref: "",
        puck: { isEditing: true },
      } as never) as never,
    );
    expect(out).not.toContain("data-block-platzhalter");
    expect(out).toContain("bg-bdas-hero-scrim");
  });

  it("a document saved before the Hero's props existed still renders", () => {
    const render = puckConfig.components.Hero?.render;
    if (!render) throw new Error("Hero render missing");
    const out = renderToStaticMarkup(
      render({ ueberschrift: "Alt", puck: { isEditing: false } } as never) as never,
    );
    expect(out).toContain("Alt");
    expect(out).toContain("min-h-[24rem]");
    expect(out).not.toContain("text-bdas-ink-on-brand");
  });
});
```

And change the existing Ausrichtung guard — find:

```ts
  it("exactly the six intended blocks carry an Ausrichtung field", () => {
```

replace the title with `"exactly the seven intended blocks carry an Ausrichtung field"` and the expectation with:

```ts
expect(mit).toEqual(["Absatz", "Bild", "Button", "Fliesstext", "Hero", "Ueberschrift", "Zitat"]);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web test -- puck-config`
Expected: FAIL — every `Hero block` case fails on `puckConfig.components.Hero` being `undefined`, and the Ausrichtung guard fails because `Hero` is not in the config yet.

- [ ] **Step 3: Add the block to the `Blocks` type**

In `apps/web/app/_content/puck-config.tsx`, add to the imports:

```tsx
import { Hero, type HeroHintergrund, type HeroHoehe } from "./Hero";
```

and add one entry to the `Blocks` type, after `Akkordeon`:

```tsx
Hero: {
  ueberschrift: string;
  untertext: string;
  hintergrund: HeroHintergrund;
  bild: string;
  hoehe: HeroHoehe;
  ausrichtung: Ausrichtung;
  buttonLabel: string;
  buttonHref: string;
}
```

- [ ] **Step 4: Register the component**

In the same file, add a `Hero` entry to `puckConfig.components`, after `Akkordeon`:

```tsx
    Hero: {
      label: "Hero / Aufmacher",
      fields: {
        ueberschrift: { type: "text", label: "Überschrift" },
        untertext: { type: "textarea", label: "Untertext (optional)" },
        hintergrund: {
          type: "select",
          label: "Hintergrund",
          options: [
            { label: "Helle Fläche", value: "hell" },
            { label: "Akzentfarbe", value: "akzent" },
            { label: "Bild", value: "bild" },
          ],
        },
        bild: {
          type: "custom",
          label: "Hintergrundbild (nur bei Hintergrund „Bild“)",
          render: ({ value, onChange }) => <FotoField value={value} onChange={onChange} />,
        },
        hoehe: {
          type: "select",
          label: "Höhe",
          options: [
            { label: "Kompakt", value: "kompakt" },
            { label: "Mittel", value: "mittel" },
            { label: "Groß", value: "gross" },
          ],
        },
        ausrichtung: ausrichtungField,
        buttonLabel: { type: "text", label: "Button-Beschriftung (optional)" },
        buttonHref: { type: "text", label: "Button-Link (https://… oder /pfad)" },
      },
      defaultProps: {
        ueberschrift: "Überschrift",
        untertext: "",
        hintergrund: "hell",
        bild: "",
        hoehe: "mittel",
        ausrichtung: "links",
        buttonLabel: "",
        buttonHref: "",
      },
      // Empty means nothing at all on the public page — an empty coloured box
      // is worse than no block. Same shape the `Bild` and `Button` blocks use:
      // placeholder in the editor, `<></>` outside it. The placeholder is
      // gated on `isEditing` because the structural sweep in the tests renders
      // every block with `isEditing: false` and asserts none reaches a reader.
      render: ({
        ueberschrift,
        untertext,
        hintergrund,
        bild,
        hoehe,
        ausrichtung,
        buttonLabel,
        buttonHref,
        puck,
      }) => {
        if ((ueberschrift ?? "") === "" && (untertext ?? "") === "" && (bild ?? "") === "") {
          return puck?.isEditing ? (
            <BlockPlatzhalter
              titel="Hero / Aufmacher"
              hinweis="Noch kein Inhalt — Überschrift, Untertext oder Bild ergänzen."
            />
          ) : (
            <></>
          );
        }
        return (
          <Hero
            ueberschrift={ueberschrift}
            untertext={untertext}
            hintergrund={hintergrund}
            bild={bild}
            hoehe={hoehe}
            ausrichtung={ausrichtung}
            buttonLabel={buttonLabel}
            buttonHref={buttonHref}
          />
        );
      },
    },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test -- puck-config`
Expected: PASS — the eight new `Hero block` cases, the updated Ausrichtung guard, and (unchanged) the structural sweep, which now also renders `Hero` with `isEditing: false` and must find no `data-block-platzhalter`.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS. If `Config<Blocks>` complains about the `Hero` entry, the `Blocks` field types and the `defaultProps` shape have drifted apart — reconcile them, do not cast.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(content): add the Hero block to the Puck palette"
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

Expected: all four PASS. `pnpm format:check` fails on this plan file too if it was written without Prettier's wrapping — run `pnpm format` and commit the result rather than hand-fixing.

- [ ] **Step 2: Production build**

Run: `pnpm --filter web build`
Expected: PASS. This is the gate that catches a Tailwind class the scanner cannot see — but note it only catches _build_ errors, not a class silently dropped from the CSS. Step 3 is what actually confirms the classes render.

- [ ] **Step 3: Manual check in the editor**

Before starting, confirm nothing else owns port 3000 (`lsof -i :3000`) — another worktree's stale server will otherwise serve an old build and any result you get is meaningless.

```bash
pnpm --filter web dev
```

Open the `ueber-uns` editor, drop a Hero, and verify by eye:

1. All three backgrounds — light surface, brand red, and a photo (upload one through the field) — and that headline text is white on red and on the photo, ink-dark on the light surface.
2. All three heights visibly differ.
3. The optional button appears only once both label and link are filled, and is white-on-red rather than red-on-red on the accent background.
4. The preview toggle from PR1 ("Vorschau") shows the Hero with no editing chrome over it.
5. Save, then open the public page and confirm it matches the preview.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/content-layout-pr2
gh pr create --base main \
  --title "feat(content): freies Layout & neue Puck-Blöcke — PR2 (Hero)" \
  --body "Implements the Hero/Header-Section block (spec §6, ADR 0036, PR 2 of 5).

- \`Hero.tsx\`: headline, sub-text, optional button, three heights, three backgrounds (light surface / brand accent / photo behind the scrim).
- Two behaviour-preserving extractions first (\`ausrichtung.ts\`, \`button-klasse.ts\`) — block components now live in their own files, so the shared lookups had to leave \`puck-config.tsx\` to avoid an import cycle, the same reason \`bild-breite.ts\` exists.
- New \`hell\` button variant, composed from existing tokens, for the dark hero grounds where \`primaer\` would be red-on-red.
- Photo backgrounds render as \`<img>\`, not \`background-image: url(…)\`: the value is editor-supplied and React escapes an attribute but not a style string.
- **Deviation from spec §6:** the section rests on \`cardLow\`, not \`cardLiftLg\`. \`cardLiftLg\` is the hero card's *hover* shadow and a Hero section is not hoverable — \`cardLow\` is the resting half of the same recipe.
- No new runtime dependency. No schema, migration, or feature-flag change."
```

- [ ] **Step 5: Review**

Run `/review` on the PR (CLAUDE.md §4). No `/security-review` — no auth, payments, or files surface. Point the reviewer at the `<img>`-instead-of-CSS decision and the new `hell` button variant; those are the two judgement calls in this PR.

---

## Out of scope for this PR

Feature-/Karten-Grid and Stats (PR3), CTA-Banner (PR4), Karussell plus `embla-carousel-react` and the carousel design-system recipe (PR5). No new slug, route, or E2E flow — spec §11 leaves the existing editor/content-page coverage in place.
