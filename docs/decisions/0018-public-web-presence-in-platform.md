# 0018 — Public web presence lives in the platform

**Status:** Accepted 2026-07-05
**Supersedes:** the spec §3 non-goal "public marketing/blog website out of scope"

## Context

The platform (dashboard.bdas.de) and the federation's public site (WordPress at
bdas.de) were separate products. The session cookie is host-only (ADR 0003), so
public pages on a different host can never see the login. The product vision is
progressive disclosure: the same public pages reveal more to logged-in users by
role (blog visibility tiers, members-only events in the public calendar, member
details on group pages — issues #50, #24).

## Decision

1. **One host.** Public pages and the logged-in platform both live on
   **bdas.de** in `apps/web`. WordPress is fully retired (DNS cutover; hosting
   cancelled after MX/email is confirmed independent — issue #32).
2. **Public shell** (navigation, landing, static pages, SEO) ships behind
   `BDAS_FLAG_PUBLIC_SHELL`; flipping it on is the go-live, coordinated with
   the DNS cutover.
3. **New dependency:** Schedule-X (MIT) renders the landing-page event
   calendar. Chosen over FullCalendar for bundle size and CSS-variable
   theming that consumes our design tokens.
4. A `blog` feature flag is reserved now so the navigation can reference the
   future blog module (issue #50) without dead links.

## Consequences

- The spec's §3 non-goal is reversed; the platform is the federation's entire
  web presence.
- All sessions invalidate once at the domain move (host-only cookie).
- Legacy WordPress URLs get a redirect map in the app so indexed links keep
  resolving.
