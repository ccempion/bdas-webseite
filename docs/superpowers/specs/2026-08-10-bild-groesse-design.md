# Bildgröße mit Ziehgriff — Design

**Date:** 2026-08-10
**Status:** Approved (brainstormed with product owner)
**Scope:** Replace the `Bild` block's two-value width select with a snapping in-canvas drag handle. `apps/web` only — no `content` module, schema, or flag change.

**Puck version:** independent of the 0.23 upgrade. `registerOverlayPortal`, `transformProps`, `usePuck` and `PuckContext { isEditing, metadata }` are all present in the currently-deployed 0.22.2, verified against its published `.d.ts`. This can land before or after `chore/puck-023-dnd`.

---

## 1. Context and decisions

`Bild` currently offers `breite: "voll" | "halb"` — full width or `sm:max-w-md`. The board wants to decide how big a picture is by dragging it.

**Puck ships nothing for this.** Verified against the shipped `.d.ts` of both 0.22.2 (deployed) and 0.23.0, not the docs — the field union is identical in each: the union is `array · custom · external · number · object · radio · richtext · select · slot · text · textarea` — no `image`, `media`, `file`, `resize`, or dimension field. The `ResizeHandle` symbol in `index.js` (18 occurrences, zero in any `.d.ts`) is internal and drives the resizable _sidebars_ from 0.20. The official `@puckeditor/*` plugins (`plugin-heading-analyzer`, `plugin-emotion-cache`, `field-contentful`, `plugin-ai`) do not cover it, and the nearest third-party package, `@caprionlinesrl/puck-plugin-media`, is a media _picker_, not a resizer. So this is hand-rolled — but on first-party APIs.

Decisions made during brainstorming:

- **In-canvas handle, not a sidebar slider.** Dragging the picture itself is the requested interaction.
- **Snap to four steps** — 25 / 50 / 75 / 100 %. These map onto Tailwind fraction classes, so no inline width styles and nothing outside the design system (CLAUDE.md §7). Snapping also prevents 63 %-wide images that read as accidental. Free-form percentages were rejected for requiring `style={{ width }}`.
- **The scale matches the rest of the codebase.** The blog and events editors already standardise on `["25%", "50%", "75%", "100%"]` (`_blog/PostEditor.tsx:36`, `admin/events/_editor/RichTextEditor.tsx:32`), and the inline `Fliesstext` images in `2026-08-10-fliesstext-bilder-umfliessen-design.md` use the same. One image scale everywhere; the drag handle also gets larger, easier snap targets. This supersedes an earlier six-step proposal made before the existing precedent was found.
- **Full width below the `sm` breakpoint.** The percentage applies on tablet and desktop only. This is exactly what `breite: "halb"` does today (`sm:max-w-md`), so mobile rendering is unchanged and no image becomes a thumbnail on a phone.
- **Keep the prop name `breite`.** It _is_ a width; one concept, one name. Only its type changes.
- **The sidebar keeps a select** with the same four steps. A drag-only control is unusable by keyboard, and this codebase already takes accessibility seriously (the alt-text field is labelled _Barrierefreiheit_).

## 2. Goals and non-goals

**Goals**

- Drag a handle on the selected image in the canvas to resize it, snapping to four steps.
- A keyboard-reachable equivalent in the sidebar.
- Existing documents keep rendering correctly with no manual intervention.
- The handle never reaches the public page.

**Non-goals**

- No height / aspect-ratio control; images keep their intrinsic ratio.
- No cropping.
- No per-breakpoint sizes beyond the single mobile rule.
- No free-form percentages.

## 3. Data model and migration

`Bild.breite` changes from `"voll" | "halb"` to `25 | 50 | 75 | 100`.

Legacy values migrate `voll → 100`, `halb → 50`, anything unrecognised → `100`, via Puck's exported `transformProps`.

**Where the migration runs — the important part.** There are eight render paths: seven public `<Render>` call sites plus `<Puck>`. `withBreite` is applied ad-hoc at each, and `apps/web/app/ueber-uns/page.tsx:47` skips it entirely. That is harmless today (the root falls back to `schmal` anyway) but would be a real bug here: a legacy `halb` image on that page would reach `render` unmigrated.

So `withBreite` becomes `normalizeContent(data, fallback)`, doing both jobs — root `breite` seeding and the `Bild` prop migration — and **all eight paths route through it**, including the one that currently skips normalisation. One seam, one place to test.

No `PuckDataSchema` change: props are `z.record(z.unknown())`.

## 4. Rendering

A lookup of literal class strings with the mobile rule folded in:

| Step | Classes           |
| ---- | ----------------- |
| 25   | `w-full sm:w-1/4` |
| 50   | `w-full sm:w-1/2` |
| 75   | `w-full sm:w-3/4` |
| 100  | `w-full`          |

Static strings in a lookup object, never template-interpolated. The same lookup serves the inline `Fliesstext` images, so the two surfaces cannot drift apart.

## 5. The handle

New client component `apps/web/app/_content/BildGroesseGriff.tsx`, rendered by `Bild.render` **only when `puck.isEditing`** — so the public page never ships it.

- `registerOverlayPortal(ref, { disableDrag: true })` marks the handle interactive so dnd-kit does not turn the gesture into a block drag. This is the documented purpose of `disableDrag`.
- Pointer handlers track x against the container, snap to the nearest step, and show the current step as a badge while dragging.
- The new value is written with `usePuck()` → `dispatch({ type: "replace", destinationIndex, destinationZone, data })`. The overlay-portals documentation names this exact combination: _"combined with `usePuck()` to create an inline form input."_
- **Handles appear on the selected image only.** This is standard editor behaviour and is also how the component learns its own index and zone for the dispatch.

## 6. Interaction with Ausrichtung

See `2026-08-10-block-ausrichtung-design.md`. Today only `halb` images can be moved by alignment; after this change every step below 100 is alignable, so `Ausrichtung` stops being a no-op on most images. The two features compose; neither depends on the other shipping first.

## 7. Testing

**Unit** (node env):

- Snapping: pointer x → step, including both clamped ends.
- Step → class lookup, all four steps.
- Migration: `voll` → 100, `halb` → 50, unrecognised → 100, already-numeric passes through.

**Render:** `renderToStaticMarkup` with `isEditing: false` emits no handle markup.

**E2E:** cover the _data_ path through the sidebar select — set a size, publish, assert the public page carries the expected class. The drag gesture itself is **not** covered end-to-end: driving a pointer sequence inside the preview iframe is expensive and thin on value once snapping and dispatch are unit-tested. This is a deliberate gap, recorded here rather than left implicit.

## 8. Open questions

None.
