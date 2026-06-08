# ADR 0009 — Standalone platform: decouple from WordPress

- **Status:** Accepted
- **Date:** 2026-06-08
- **Supersedes:** ADR 0004 (entirely); ADR 0002 (cross-domain cookie scheme only); the WordPress clauses of ADR 0001 and ADR 0005; ADR 0008 §3 (legal-content location)
- **Superseded by:** —

## Context

The platform was originally conceived as a **hybrid**: WordPress at `bdas.de`
would remain the public content layer, and the Next.js app would be the
structured-data layer, stitched together by (a) a cross-domain SSO cookie
scoped to `.bdas.de` and read by a WordPress plugin, and (b) a content bridge
pulling the WordPress nav and posts into the app. The spec (§2, §17, §18),
the build plan (Sprint 4), and ADRs 0001/0002/0004/0005/0008 were written
around that integration.

The federation has decided the platform should be a **fully standalone
product** — a separate service with its own audience (members and boards),
with **no runtime or design dependency on bdas.de**. The public marketing
website is now a distinct product, out of scope for this repository.

## Decision

1. **No cross-domain SSO.** The session cookie (`bdas_session`) is **host-only**
   — it carries the same signed JWT (HS256, claims per ADR 0002) but is scoped
   to the app's own host, never `.bdas.de`. The JWT secret (`SSO_JWT_SECRET`)
   is an internal app secret; the token is verified by nothing outside the app.
   The `SSO_COOKIE_DOMAIN` env var and the production guard requiring it are
   removed.

2. **No content bridge.** The `modules/content-bridge` module and the
   `wp-plugin/bdas-sso` WordPress plugin (SSO verifier + `bdas/v1/menu`
   endpoint) are deleted, along with the `content_bridge` feature flag and the
   `WORDPRESS_REST_BASE_URL` env var. The `SiteHeader` uses a static in-app nav;
   the landing page no longer renders a WordPress news section.

3. **Legal pages are in-app routes.** The Datenschutzerklärung and Impressum
   are served by the app at `/datenschutz` and `/impressum` (amending ADR 0008
   §3, which placed them in WordPress). The `LEGAL_PRIVACY_URL` /
   `LEGAL_IMPRINT_URL` env vars are removed. The placeholder copy in those
   routes must be replaced with the federation's reviewed legal text before
   production launch.

4. **Visual identity is self-owned.** The design system (`core/design-system`)
   defines the platform's brand end to end. It is no longer constrained to be
   "indistinguishable from the WordPress site"; the existing tokens are retained
   unchanged, but the framing is now a cohesive standalone BDAS brand identity.

## What is retained

- The `auth` module's JWT issue/verify mechanism, session table, and claim
  shape from ADR 0002 — only the cross-domain cookie scope is dropped.
- ADR 0003 (hand-rolled session layer), 0006, 0007 are unaffected.
- ADR 0008 §1 (consent at registration), §2 (cookie notice), §4 (data export)
  are unaffected; only §3 (legal-content location) is amended.

## Consequences

### Positive

- A whole class of cross-system coupling disappears: shared cookies, content
  fetching, role mirroring, and a PHP plugin to version and deploy.
- The app has no runtime dependency on bdas.de availability or schema.
- The federation's public web presence can evolve independently.

### Negative

- The federation must host its own legal text in the app (placeholder routes
  ship until the reviewed copy is supplied).
- Any "single login across the website and the platform" UX is gone by design;
  the two are separate products.
- Several ADRs are now partially historical; this ADR is the source of truth
  on the points listed under **Supersedes**.

## Follow-ups

- Replace the placeholder Datenschutzerklärung / Impressum copy before launch.
- At the next spec revision, the WordPress-integration sections (already
  reworded in this change) can be pruned further if desired.
