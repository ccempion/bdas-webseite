# ADR 0004 — Content Bridge

- **Status:** Superseded by ADR 0009
- **Date:** 2026-05-10
- **Supersedes:** —
- **Superseded by:** ADR 0009 — the platform is standalone; the content bridge and its WordPress plugin are removed. Retained as historical record.

## Context

The federation's existing public site at `bdas.de` (WordPress) is the source of truth for marketing/news content (Posts) and the primary navigation. The new Next.js app at `dashboard.bdas.de` is the member-facing surface (auth, account, group profiles, board approvals).

Two integration points are required for Sprint 4:

1. **Cross-site SSO** — a member who logs in on `dashboard.bdas.de` is recognised as logged-in when they navigate to `bdas.de`. JWT cookie design locked in ADR 0002.
2. **Shared chrome** — the navigation on `dashboard.bdas.de` must reflect the WordPress nav so members don't see two visually-different sites.

This ADR fixes the boundary of the WordPress integration: what we read, how we read it, what happens when WordPress is unavailable.

## Decision

### Direction of data flow

**Read-only from WordPress.** The Next app never writes to WP. The only WordPress-side writes are inside the SSO plugin (creating placeholder subscribers on first SSO match). The federation continues to author content in WP-admin; the Next app consumes it.

### What we read

| Endpoint                                                      | Purpose                                                                                                      | Cache              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------ |
| `GET /wp-json/bdas/v1/menu` (custom, in `wp-plugin/bdas-sso`) | Primary navigation items used as the SiteHeader on `dashboard.bdas.de`                                       | `revalidate: 3600` |
| `GET /wp-json/wp/v2/posts?per_page=N`                         | Latest news section on the dashboard homepage                                                                | `revalidate: 3600` |
| `GET /wp-json/wp/v2/posts/{idOrSlug}`                         | Individual post (used only if we surface a "latest news" deep-link in Phase 1; otherwise unused)             | `revalidate: 3600` |
| `GET /wp-json/wp/v2/pages/{slug}`                             | Available for group-profile intros if the federation chooses to author them in WP. Not consumed in Sprint 4. | `revalidate: 3600` |

The custom menu endpoint exists because WordPress's built-in REST API does not expose classic-menu items; with the block editor in use on `bdas.de`, exposing the primary navigation requires a small plugin endpoint. The plugin already needs PHP for SSO; one extra endpoint adds ~30 LoC.

### Caching

- All bridge reads use Next 14 `fetch(url, { next: { revalidate: 3600 } })`. The cache lives in Next's data cache and is invalidated by time, not by webhook in v1. An hour of staleness is acceptable for nav and news.
- `revalidatePath('/')` can be called from a future Server Action if the federation wants instant invalidation; not in Phase 1.

### Failure modes

- **WP unreachable / 5xx:** the bridge returns an empty array (or null for single resources) and **never throws**. Pages render with a fallback ("Aktuelles wird geladen…" or no nav). The dashboard's own routes must keep working when WordPress is down.
- **Malformed JSON:** Same. Validate the shape; log; degrade gracefully.
- **Custom menu endpoint missing** (plugin not installed yet): bridge returns an empty menu; SiteHeader collapses to the BDAS logo and a link to bdas.de.

### What we do NOT do

- Sync WP content into our Postgres. The bridge is read-through, not replication. If we ever need full-text search across WP+app data, that's a separate ADR.
- Authenticate WP REST calls. All consumed endpoints are public.
- Write back to WP. The Next app's content (member profiles, group entries) does not flow into WordPress.

### Module boundaries

- `modules/content-bridge` owns the typed REST client, the services, the failure-mode logic, and the type definitions for nav/post/page shapes.
- `apps/web` consumes the services. It does not call `fetch` against `bdas.de` directly.
- `wp-plugin/bdas-sso` owns the `bdas/v1/menu` endpoint and the SSO cookie verifier. The plugin is the only PHP we ship.

## Alternatives considered

### GraphQL (WPGraphQL)

A single endpoint, typed. But adds a plugin dependency on the WP side that the federation has to maintain, and our needs (3 endpoints, light traffic) don't justify the extra surface. Reconsider if Phase 3 demands richer queries.

**Rejected for v1.**

### Headless WordPress / replace WP entirely

Not within scope. ADR 0001 keeps WordPress as the public-facing site; this ADR is about co-existence, not replacement.

### Server-side mirror of WP content

Pull every WP post into our Postgres on a schedule. More operational surface, more failure modes, no read benefit at our scale. Revisit if `revalidate: 3600` ends up being too coarse and we need webhook-driven invalidation.

**Rejected for v1.**

## Consequences

### Positive

- The federation edits content in WP-admin (familiar tool); the dashboard reflects it within an hour.
- WordPress outages don't take down the dashboard.
- The bridge is small enough (~150 LoC) to read and audit in one sitting.
- The custom menu endpoint is the only deviation from off-the-shelf WP REST — easy to drop or replace.

### Negative

- One-hour cache window means urgent nav changes aren't reflected immediately. Mitigation: documented runbook to redeploy or call `revalidatePath` from a board-only action.
- If the SSO plugin is deactivated, `bdas/v1/menu` disappears and the dashboard nav goes empty. Mitigation: SiteHeader's empty-state degrades gracefully (logo + "Zur Hauptseite" link).
- We carry a tiny PHP plugin alongside our TypeScript stack. Mitigation: kept ~150 LoC, no Composer, no build step.

## Follow-ups

- Phase 2 can add webhook-driven cache invalidation if `revalidate: 3600` proves too coarse.
- Phase 5 will add role mapping (BDAS roles → WP roles) — a separate ADR. The plugin currently only does "logged in vs not".
- If we ever need authenticated WP REST calls, we'll add an application-password mechanism and document it here.
