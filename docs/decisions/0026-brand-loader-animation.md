# ADR 0026 — Brand loader animation

- **Status:** Accepted
- **Date:** 2026-07-21
- **Supersedes:** —
- **Superseded by:** —

## Context

The platform had no branded loading indicator. Loading UI was ad-hoc
`animate-pulse` grey boxes (the only real instance was the group map skeleton in
`apps/web/app/_groups/GroupMapLazy.tsx`) and there was no route-level loading
fallback at all. The design language (`core/design-system/README.md`) explicitly
lists "Animations beyond `fadeSlideDown` and the lift-on-hover pattern" under
_What is NOT in the language_, so adding a loop animation is a deliberate
extension that needs recording.

The BDAS logo (`apps/web/public/bdas-logo.png`) is a dove/phoenix in flight made
of flowing red ribbons, wearing a graduation cap. It exists only as a raster PNG
— there is no SVG in the repo — so its individual shapes cannot be animated as
vector paths without re-tracing.

## Decision

- Add a brand loader: a white highlight sweeps along the logo silhouette from
  tail (lower-left) to head (upper-right); as it arrives the graduation cap bobs
  and flicks its tassel, then the loop repeats. The motion encodes the BDAS
  mission — momentum flowing along the bird _toward graduation_.
- **Realisation is library-free and hybrid, not a full re-trace.** No animation
  library is installed and none is added. The body stays the pixel-identical
  PNG. The shine is a CSS gradient masked to the logo silhouette via
  `mask-image`. The moving cap is a **cap-clipped copy of the same PNG** (via
  `clip-path` + a small transform) rather than a hand-traced SVG — identical art,
  so there is no traced-shape or colour mismatch and no double-cap seam beyond a
  sub-pixel edge at the small motion amplitude. Re-tracing the logo to SVG was
  rejected as disproportionate and mismatch-prone.
- **Animations are design-system tokens, not ad-hoc CSS.** A `motion.durationLoop`
  (1600ms) and `loaderSweep` / `loaderCap` keyframes are added to
  `core/design-system/src/tokens.ts` and surfaced as `animate-bdas-loader-sweep`
  / `animate-bdas-loader-cap` through `tailwind-preset.ts` — the same path
  `bdas-fade-slide-down` already takes. Only `ease` easing is used; the swept
  highlight is a tokenised gradient (`colors.surface.overlay.loaderShine` →
  `bg-bdas-loader-shine`) alongside the existing hero-scrim gradient, so no
  colour is inlined ad-hoc in the component.
- Accessibility: `role="status"`, `aria-label="Wird geladen"`, and
  `prefers-reduced-motion` drops both animations, leaving the static logo.
- Consumed in a reusable `apps/web/components/BdasLoader.tsx` (`sm`/`md`/`lg`),
  wired into the group-map skeleton and a new root `apps/web/app/loading.tsx`
  full-page overlay.

## Consequences

- The design language now sanctions the loader animations; the README's
  _What is NOT in the language_ note is updated accordingly.
- The loader is available app-wide; future loading states should use
  `<BdasLoader>` instead of new `animate-pulse` boxes.
