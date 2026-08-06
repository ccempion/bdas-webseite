# `@bdas/design-system`

Tokens and primitives for the BDAS platform — its cohesive, self-owned brand
identity. (The token values were originally distilled from the federation's
established visual language and are retained as the platform's own.)

**Source of truth: `src/tokens.ts`. Do not introduce raw colors, radii,
shadows, or motion values in app code.** If a value is missing here, it
is intentionally not part of the language — propose an addition, don't
ad-hoc.

## The visual language at a glance

| Concept                                        | Token                                                     |
| ---------------------------------------------- | --------------------------------------------------------- |
| Brand accent (active/open)                     | `colors.brand.red` `#d12020`                              |
| Red accent halo                                | `shadows.redGlow`                                         |
| Body ink scale                                 | `colors.ink.strong / body / muted` (`#333 / #555 / #888`) |
| Card / dropdown / accordion radius             | `radii.md` (`12px`)                                       |
| Desktop nav pill radius                        | `radii.pill` (`20px`)                                     |
| Inner-item radius (dropdown links)             | `radii.sm` (`6px`)                                        |
| Circular controls (nav buttons, markers, dots) | `radii.full` (`9999px`)                                   |
| Card shadow at rest                            | `shadows.cardResting`                                     |
| Card shadow on hover (default)                 | `shadows.cardLiftMd`                                      |
| Accordion shadow on hover                      | `shadows.cardLiftSm`                                      |
| Hero card shadow on hover                      | `shadows.cardLiftLg`                                      |
| Dropdown panel float                           | `shadows.dropdown`                                        |
| Color/background transition                    | `motion.durationQuick` (`200ms`)                          |
| Transform/shadow transition                    | `motion.durationSoft` (`300ms`)                           |
| Expand/fade-in                                 | `motion.durationSlow` (`400ms`)                           |
| Hover lift (cards/accordions)                  | `motion.lift.sm` (`-2px`)                                 |
| Hover lift (hero cards)                        | `motion.lift.md` (`-5px`)                                 |

## Component recipes

These are the patterns the source CSS encodes. Match them when building
the equivalent components across the app. Names refer to tokens in
`src/tokens.ts`.

- **Card** — white surface, `radii.md`, `border.soft`, `shadows.cardResting`. On
  hover _or keyboard focus-visible_ (via `group`/`group-focus-visible:` — see
  `Card.tsx`), translateY(`lift.sm`) and shadow upgrade to `cardLiftMd`; a
  consumer-owned title may opt into turning `brand.red` the same way.
  Transition `durationSoft`.
- **Hero card** — same shape; resting shadow `cardLow`, hover/focus-visible
  lift `lift.md`, hover/focus-visible shadow `cardLiftLg`.
- **Nav pill (desktop)** — `radii.pill`, padding `4px 12px`, transparent at rest;
  on hover background `surface.overlay.hover`.
- **Dropdown panel** — white, `radii.md`, padding `8px`, `shadows.dropdown`,
  min-width `240px`, hairline border on three sides only (the top is the
  invisible "hover bridge").
- **Dropdown link** — `radii.sm`, padding `8px 12px`, hover background
  `surface.hover`, color `ink.strong → black`.
- **Combobox** — the pattern for any list too long to scan. The trigger matches
  `Input`'s shape (`radii.md`, `border.soft`, red focus ring); the popup follows
  the **dropdown panel** recipe above (`radii.md`, `shadows.dropdown`, `8px`
  padding) and fades in via `keyframes.fadeSlideDown`; each option follows
  **dropdown link** (`radii.sm`, hover `surface.hover`), with the selected one in
  `brand.red`. Past `SEARCH_THRESHOLD` (30) options it grows a filter field —
  below that the field is noise, so a short list is just the list. Use it instead
  of a native `<select>` whenever the option count is data-driven and can grow;
  keep `<select>` for fixed enums of a handful of values.
- **Accordion (`<details>`)** — styled as a card. On `[open]`:
  - 4 px left border in `brand.red`
  - shadow upgrades to `redGlow`
  - summary color → `brand.red`, hairline divider under summary
  - `+` rotates 45° into `×` (also turns `brand.red`)
  - body fades in via `keyframes.fadeSlideDown`

## How to consume

### From a Tailwind app (Sprint 1 onward)

```ts
// apps/web/tailwind.config.ts
import { tailwindPreset } from "@bdas/design-system/tailwind-preset";
export default {
  presets: [tailwindPreset],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
};
```

Resulting utility namespace: `bg-bdas-surface`, `text-bdas-ink`,
`text-bdas-red`, `rounded-bdas`, `rounded-bdas-pill`, `shadow-bdas-card`,
`shadow-bdas-lift-sm`, `shadow-bdas-dropdown`, `shadow-bdas-red-glow`,
`-translate-y-bdas-lift-sm`, `animate-bdas-fade-slide-down`, etc.

### From plain TypeScript (e.g. inline styles, server components)

```ts
import { colors, shadows, radii } from "@bdas/design-system/tokens";

const cardStyle = {
  background: colors.surface.base,
  borderRadius: radii.md,
  boxShadow: shadows.cardResting,
};
```

## What is NOT in the language

- Drop shadows other than the seven listed above
- Border radii outside `{6, 12, 20}` px — circular elements use the sanctioned
  `radii.full` instead of an ad-hoc value
- Custom-tuned easing curves (we use plain `ease`)
- Reds other than `#d12020` and the `redGlow` rgba
- Animations beyond `fadeSlideDown`, the lift-on-hover pattern, and the brand
  loader (`loaderSweep` / `loaderCap`, see ADR 0026)

If a screen needs more, raise it — don't quietly add it.
