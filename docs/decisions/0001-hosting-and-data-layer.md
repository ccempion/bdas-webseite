# ADR 0001 — Hosting and Data Layer

- **Status:** Accepted
- **Date:** 2026-05-10
- **Supersedes:** —
- **Superseded by:** —

## Context

The platform spec (`docs/bdas-platform-spec.md` §6) names Vercel for app hosting and Supabase or Neon for managed Postgres, but leaves the choice between these and alternatives open. Railway was raised as a candidate during planning and warrants explicit consideration: it can host the database, the Next.js apps, workers, and cron jobs on a single platform with predictable flat-rate pricing.

The decision affects:

- Where the public site (`apps/web`), the dashboard (`apps/dashboard`), and the database physically run.
- Where files uploaded through the `files` module (Phase 2) are stored.
- Whether the architecture stays full-stack Next.js (Server Components reading directly from the DB, Server Actions writing) or splits into a frontend + separate backend service.
- The federation's monthly operating cost.

Three interpretations of "use Railway" were evaluated:

1. Railway Postgres only — Vercel still hosts the apps.
2. Railway for both apps and Postgres — single-platform setup.
3. Split Next.js into a frontend-only Vercel app plus a separate backend service on Railway.

## Decision

The platform will be hosted on:

- **Vercel** for `apps/web` and `apps/dashboard` (two Vercel projects, one per app).
- **Supabase Pro** for managed Postgres and object storage (used by the `files` module from Phase 2 onward).
- **Cloudflare R2** (separate account) for daily `pg_dump` backup retention beyond Supabase Pro's included 7 days, satisfying the spec's 30-day retention NFR (§20).
- **Resend** for transactional and broadcast email.
- **Stripe** for payments.
- **WordPress** stays on its existing host; only the SSO bridge cookie connects it.

The Next.js apps remain full-stack — Server Components and Server Actions, no separate backend service. Modules are TypeScript libraries imported by the apps, not network services.

## Alternatives considered

### Railway Postgres only (interpretation 1)

Cheaper at small scale (~$5/month flat for the DB) but requires adding Cloudflare R2 or AWS S3 for object storage and reimplementing what Supabase provides out of the box: signed URL generation, storage RLS, and a managed dashboard. Net saving versus Supabase Pro is roughly €220/year — small for a federation budget.

**Rejected** because the build-it-yourself overhead exceeds the saving.

### Railway for everything (interpretation 2)

Single bill, single control plane, fits if cost predictability matters more than edge performance. Tradeoffs:

- Vercel's edge CDN benefits the public site's cacheable pages (`/gruppen/[slug]`, event lists) more than Railway's Node-server hosting model.
- Vercel-native Next.js features (ISR, edge middleware, image optimization) are first-class on Vercel; on Railway they degrade.

**Rejected** because the public site is read-heavy and benefits materially from Vercel's edge.

### Split frontend + backend service (interpretation 3)

Would require rewriting modules as network services, losing Server Components' direct DB access and Server Actions' typed write path. Adds a fourth deployable on top of two Next.js apps and the WordPress SSO plugin. Complicates the SSO cookie flow with another domain to authorize.

**Rejected** because it undoes the §5 modular model — modules become RPC services rather than typed library imports — for no concrete current benefit. If a separate backend is ever needed (e.g. mobile apps, third-party API), service interfaces can be extracted at that point.

### Neon for Postgres

Comparable to Supabase on the database axis but lacks bundled object storage. Would require pairing with R2/S3 anyway, increasing vendor count without a corresponding gain.

**Rejected** because Supabase's bundled storage simplifies the `files` module wiring.

## Consequences

### Positive

- Server Components and Server Actions remain the data-access primitives, matching the spec.
- Public-site cacheability is maximized via Vercel's edge.
- Object storage for Phase 2's `files` module ships with Supabase — no additional vendor needed for storage.
- Single hosted Postgres, single object store, single auth-helper toolkit (Supabase JS client where useful, though Lucia handles sessions).

### Negative

- Vendor count is higher than Railway-only would have been: Vercel + Supabase + Resend + Stripe + Cloudflare R2 + the existing WordPress host.
- Vercel's Hobby plan is "non-commercial" — a registered nonprofit (e.V.) site is a gray area. If legal counsel requires commercial-tier hosting, that adds ~$20/month per app.
- Supabase Pro includes only 7-day backup retention; the spec requires 30 days. A daily `pg_dump` GitHub Action pushing to Cloudflare R2 closes the gap and is mandatory before Phase 1 production launch.

### Cost estimate

Realistic monthly steady-state for this stack:

| Item                                                     | Cost  |
| -------------------------------------------------------- | ----- |
| Supabase Pro (production)                                | $25   |
| Supabase Free (staging)                                  | $0    |
| Cloudflare R2 (backup dumps)                             | ~$1   |
| Resend (free tier covers Phase 1 volume)                 | $0    |
| Stripe (transaction fees only, 1.5% + €0.25 per EU card) | usage |
| Vercel (Hobby if eligible, else Pro)                     | $0–40 |

**Total: ~$25–65/month (~€280–730/year)**, dominated by Supabase Pro. This is acceptable for a federation funded by voluntary dues.

## Follow-ups

- Add the daily `pg_dump → R2` backup job before Phase 1 production launch.
- Confirm Vercel Hobby eligibility for an e.V. site with the federation's legal contact; if Pro is required, factor into the budget and update this ADR.
- Re-evaluate this decision at the end of Phase 3 when the dashboard is live and real traffic data exists. If costs trend differently than estimated, supersede with a new ADR.
