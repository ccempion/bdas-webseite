# Block-Ausrichtung — Design

**Date:** 2026-08-10
**Status:** Approved (brainstormed with product owner)
**Scope:** Add a per-block `ausrichtung` (left / centre / right) control to the shared Puck palette. `apps/web/app/_content/puck-config.tsx` only — no `content` module, schema, migration, or flag change.

---

## 1. Context and decisions

The palette (ADR 0023, expanded by ADR 0025) offers no way to align a block. Every block renders left-aligned because the page container is a flex column (`puck-config.tsx:86`, `flex flex-col gap-6`) and children stretch to full width.

Decisions made during brainstorming:

- **Per-block prop, not a generic wrapper.** `root.render` wraps children _collectively_, so there is no clean per-block seam for injecting alignment generically — and a generic wrapper would also hit the blocks deliberately excluded below.
- **Only blocks where alignment is visible.** `Ueberschrift`, `Absatz`, `Zitat`, `Fliesstext`, `Bild`, `Button`. Excluded: `Trenner` (full-width `hr`), `Abstand` (invisible spacer), `Spalten` (grid container), `PersonenRaster` and `Organigramm` (own grid layouts). On those the control would render but do nothing, which misleads the board.
- **Two mechanisms, chosen per block.** Text blocks use `text-align`; `Bild` and `Button` move the element itself. A single uniform `text-align` was rejected because it cannot shift a block-level `<figure>`.
- **Default `"links"`,** which is exactly what every block renders today. No existing page changes appearance.
- **No schema or migration work.** `PuckDataSchema` validates props as `z.record(z.unknown())` (`modules/content/src/types.ts:3`), so blocks stored without the prop validate unchanged and fall back through `defaultProps`.

## 2. Goals and non-goals

**Goals**

- A board member can set left / centre / right on the six blocks where it is visible.
- Existing saved documents render byte-identically until someone changes the control.
- No inline hex, radius, shadow, or duration (CLAUDE.md §7).

**Non-goals**

- No alignment on `Trenner`, `Abstand`, `Spalten`, `PersonenRaster`, `Organigramm`.
- No vertical alignment.
- No per-paragraph alignment inside `Fliesstext` — the Tiptap config has no `TextAlign` extension and the renderer (`rich-text.tsx`) has no alignment support. Block-level only.

## 3. Data model

`Blocks` (`puck-config.tsx:21`) gains `ausrichtung: Ausrichtung` on the six entries:

```ts
export type Ausrichtung = "links" | "mittig" | "rechts";
```

Each of the six `defaultProps` gains `ausrichtung: "links"`.

## 4. Field definition

One shared constant, not six copies of the same options array:

```ts
const ausrichtungField = {
  type: "select" as const,
  label: "Ausrichtung",
  options: [
    { label: "Linksbündig", value: "links" },
    { label: "Mittig", value: "mittig" },
    { label: "Rechtsbündig", value: "rechts" },
  ],
};
```

## 5. Class helpers

Two helpers beside the existing `breiteClass`:

```ts
ausrichtungText(a)    → "text-left" | "text-center" | "text-right"
ausrichtungElement(a) → "mr-auto"   | "mx-auto"     | "ml-auto"
```

Both return literal strings from a lookup, never template-interpolated — Tailwind's scanner only sees literals.

## 6. Per-block application

| Block          | Applied as                                                                | Notes                                                  |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `Ueberschrift` | `ausrichtungText` on the existing `<h2>`/`<h3>`                           | no new DOM                                             |
| `Absatz`       | `ausrichtungText` on the existing `<p>`                                   | no new DOM                                             |
| `Zitat`        | `ausrichtungText` on the `<blockquote>`                                   | card stays full width; text inside moves               |
| `Fliesstext`   | `ausrichtungText` on a new wrapper `<div>`                                | cascades to every `<p>` the renderer emits             |
| `Bild`         | `ausrichtungElement` on the `<figure>`, `ausrichtungText` for the caption | no-op while the image is full width                    |
| `Button`       | `ausrichtungText` on a new wrapper `<div>`                                | the `<a>` is `inline-flex`, so text-align positions it |

**To verify during implementation:** `Bild` and `Button` rely on how the block sits in the root flex column — a flex child stretches, which is what gives `text-align` and `mx-auto` room to work. Confirm the emitted DOM with `renderToStaticMarkup` rather than trusting a reading of the flex spec. If a stretched flex child does not behave as expected, wrap the block in a plain `<div>` and align inside it.

## 7. Testing

Extend `apps/web/app/_content/puck-config.test.ts` (node env, `renderToStaticMarkup`, matching `Organigramm.test.tsx`):

- For each of the six blocks, all three values produce the expected class.
- Regression: a block whose stored props omit `ausrichtung` renders left-aligned.
- The five excluded blocks expose no `ausrichtung` field.

No new E2E — this adds no new flow to the §23 acceptance surface.

## 8. Open questions

None.
