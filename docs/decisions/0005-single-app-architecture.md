# ADR 0005 — Single Next.js App for Member and Board Surfaces

- **Status:** Accepted
- **Date:** 2026-05-10
- **Supersedes:** Section 13 of `docs/bdas-platform-spec.md` (the two-app split)
- **Superseded by:** ADR 0009 — *WordPress references only* (the WP/dashboard split diagram and the "WordPress retains exclusive ownership of public content" clause are void; the platform is standalone). The single-app decision otherwise stands.

## Context

`docs/bdas-platform-spec.md` §13 (and the sketch in §3 "Architecture overview") prescribes a **two-app split**:

- `apps/web` — public-facing Next.js site for members (auth, `/account`, `/gruppen`, etc.)
- `apps/dashboard` — separate Next.js app at `dashboard.bdas.de` for **boards only** (local + federal)
- `bdas.de` — WordPress, content only

The spec also requires that "the public site never renders dashboard pages, and the dashboard never renders public marketing pages" (§13), with routing-by-domain as the hard separation.

Through Sprints 0–4 we built `apps/web` with member-facing routes (`/registrieren`, `/anmelden`, `/account`, `/gruppen`) and one board-facing route (`/admin/pending-members`), and deployed it to `dashboard.bdas.de` because no other Next.js surface existed yet. `apps/dashboard` was never bootstrapped beyond an empty folder.

Continuing the spec's two-app design would require, at minimum:

1. A **second Next.js app** (`apps/dashboard`) with its own deploy pipeline, design-system import, auth wiring, build, and CI surface.
2. A **path/host routing scheme** so `bdas.de` (WordPress) and the member-facing Next.js app can coexist on the public domain — typically Next.js Multi-Zones, a reverse proxy, or a sibling subdomain like `app.bdas.de`.
3. **Duplicated layout/shell code** across two apps (header, footer, theming, role-aware nav) or a shared shell module that both apps consume.

For a federation of student groups maintained by volunteer developers, this is heavy.

## Decision

**One Next.js app at `dashboard.bdas.de`, serving every authenticated surface.** Members and boards use the same app; what each user sees is determined by their role grants in `members.member_role_grants` (the role model from spec §6 is unchanged).

```
bdas.de  (WordPress) ──────────► public content, blog, group profile pages
   │
   └─ "Mitglieder-Login" / "Anmelden" link in the WP nav
      │
      ▼
dashboard.bdas.de  (Next.js: apps/web)
   ├─ /anmelden, /registrieren, /passwort-zuruecksetzen      (everyone)
   ├─ /account                                                (Member+)
   ├─ /gruppen, /gruppen/[slug]                               (everyone — public group pages)
   ├─ /admin/*                                                (Local Board grant required)
   └─ /federal/*                                              (Federal Board grant required)
```

Concretely:

- `apps/web` is the only Next.js app. The empty `apps/dashboard` folder will be deleted.
- The domain name `dashboard.bdas.de` is kept even though the app now serves members too. Renaming the subdomain has no architectural value and creates DNS churn.
- Board-only routes (`/admin/*`, `/federal/*`) live as **route groups** inside `apps/web`, gated by middleware that checks for the required role grant. A user without the grant gets `notFound()` or a redirect to `/account`.
- The spec's prescription that "non-board users hitting `dashboard.bdas.de` are bounced to `/account` on the public site" is **dropped**. Non-board users see the member portal at `dashboard.bdas.de/account` directly.
- WordPress retains exclusive ownership of public content (blog, marketing, group landing pages). The Next app does not render content pages. The split between "structured-data layer" (Next) and "content layer" (WP) from spec §3 stands.

## Alternatives considered

### Two apps as the spec prescribes (`apps/web` + `apps/dashboard`)

The literal spec design. Hard separation by domain. Strong security posture (a board-route bug can't accidentally render member content and vice versa).

**Rejected for v1.** Doubles the build, deploy, and maintenance surface. Volunteer-developer scale. The same security guarantees can be achieved with role-gated middleware in a single app, which we already have for the existing flag-gated routes.

Reconsider if (a) the dashboard grows to hundreds of routes with materially different security postures, (b) the federation hires a second developer team with strict ownership boundaries, or (c) we need radically different release cadences (e.g., daily dashboard ships vs. quarterly public-site updates).

### Embed member workflows inside WordPress as plugins

Author `/account`, `/gruppen`, etc. as PHP plugins on `bdas.de`. Eliminates the cross-domain SSO requirement.

**Rejected.** Spec §3 explicitly puts WordPress as the content layer, with structured workflows in the custom app. Auth, member CRUD, and group state in PHP plugins would re-create exactly the WP plugin sprawl the spec is trying to avoid. ADR 0001 also locks Postgres + Drizzle as the data layer; routing those reads/writes through PHP defeats that.

### Multi-zones with `bdas.de/app/*` proxied to Next.js

Keep `bdas.de` as the canonical domain. Use Next.js Multi-Zones to proxy `/app/*` (or similar) to the Next app, with WordPress serving everything else.

**Rejected for v1.** Adds a reverse-proxy layer that the federation has to operate. The existing `dashboard.bdas.de` subdomain is already provisioned, the SSO cookie is already shared via `.bdas.de`, and the user experience of clicking "Login" → `dashboard.bdas.de` is fine. Reconsider if SEO / link-sharing surface a strong reason to keep everything under one host.

## Consequences

### Positive

- One Next.js app to build, deploy, monitor, type-check, and reason about.
- The SSO bridge (ADR 0002) already targets one domain pair (`bdas.de` ↔ `dashboard.bdas.de`); no second pair to wire up.
- Sprint 0–4 work survives unchanged. No reorg of `apps/web`.
- Shared shell components (SiteHeader, navigation, theming) live in one place; no risk of dashboard and public-site visuals drifting.
- The role-gating pattern that already exists for feature flags scales to board scopes — same primitive (`requireXFlag` → `requireRoleGrant`).

### Negative

- The line between "member surface" and "board surface" is now a **convention enforced by middleware**, not a domain boundary. A regression in role middleware could leak board UI to a member. Mitigation: `/security-review` on every PR that touches role gating; integration test that asserts a member without grants gets 404 on `/admin/*`.
- We diverge from the platform spec §13 in writing. Anyone reading the spec without this ADR will assume two apps still. Mitigation: this ADR; CLAUDE.md §8 already states ADRs win on conflicts.
- If the federation later wants strict domain isolation (e.g., to apply a different WAF / CSP profile to the boards admin), splitting back into two apps is a refactor — not a redeploy. Mitigation: keep board-route code under a clear `app/(board)/` segment so a future split is mechanical.

### Neutral

- The empty `apps/dashboard` folder will be removed in a follow-up commit; nothing depends on it.
- The CLAUDE.md "One module per PR" rule is unchanged. Member-vs-board routes in `apps/web` are not separate modules — they consume the same modules (auth, members, groups).

## Follow-ups

- Delete the empty `apps/dashboard/` folder.
- Add a `requireRoleGrant(scope)` helper alongside the existing flag-gating helpers (`requireAuthFlag`, `requireMembersFlag`) in `apps/web/app/_*/`. Use it in the board route groups.
- When `/admin/*` board routes are formalised in a future sprint, restructure them under `apps/web/app/(board)/` so the convention is grep-able.
- Update spec §13 with a margin note pointing to this ADR (or rewrite once we're certain the single-app shape is permanent).
- Coordinate with the WP-side update (the `bdas.de` site needs a "Mitglieder-Login" / "Anmelden" link in the primary nav pointing to `https://dashboard.bdas.de/anmelden`). Owned by the WordPress site editor, not this codebase.
