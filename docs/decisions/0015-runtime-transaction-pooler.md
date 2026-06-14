# ADR 0015 — Runtime connects through the Supabase transaction pooler

- **Status:** Accepted
- **Date:** 2026-06-14
- **Supersedes:** —
- **Superseded by:** —

## Context

Production threw `EMAXCONNSESSION` — "max clients reached in session mode,
pool_size: 15" (`XX000`, FATAL) — on member-approval and other write paths
once the Phase 3 dashboard went live and raised concurrency.

Root cause: the Vercel **runtime** `DATABASE_URL` pointed at Supabase's
**session pooler** (port 5432). In session mode each client connection pins a
dedicated server connection for its whole lifetime, capped at `pool_size` (15).
The runtime client (`core/db`) opens up to `max` connections per process, and
Vercel Fluid Compute keeps several instances warm — each with its own pool. Two
warm instances holding their pools already exceed 15, so the cap was hit under
ordinary traffic.

Session mode is the wrong pooling mode for serverless. The transaction pooler
(port 6543) releases the server connection after each transaction, so 15 server
slots multiplex across a large number of short-lived clients.

The app uses no session-pinned features (no `LISTEN`, advisory locks,
session-level `SET`, or cross-statement prepared statements), so it is fully
compatible with transaction pooling.

## Decision

The **runtime** connects through the Supabase **transaction pooler (port 6543)**. The Vercel production `DATABASE_URL` is set to the transaction-pooler
URI.

- `core/db` sets `prepare: false`: postgres.js uses prepared statements by
  default, which transaction pooling does not support.
- The production per-instance pool ceiling drops from `max: 10` to `max: 3` so
  concurrent warm instances do not exhaust the pooler.
- **Migrations are unchanged.** They keep using the **session pooler (5432)**
  via the separate `PRODUCTION_DATABASE_URL` GitHub Environment secret and the
  migration runner's own client (`infra/migrations`, `max: 1`). DDL requires
  session mode (ADR 0010); that split is intentional and stays.

## Consequences

- The runtime no longer pins server connections for the request lifetime;
  `EMAXCONNSESSION` from session-mode exhaustion cannot recur from the app.
- Two distinct connection strings now exist by design: runtime → 6543,
  migrations → 5432. Operators must not collapse them into one value.
- `prepare: false` forgoes prepared-statement caching. For this app's query
  shapes the effect is negligible and is the required trade-off for transaction
  pooling.

## Operator setup (one-time)

In Vercel → Project → Settings → Environment Variables, set the **Production**
`DATABASE_URL` to the Supabase **transaction-pooler** URI: same host, user, and
password as before, but port **6543** (Supabase Dashboard → Database →
Connection string → **Transaction** mode → URI). Redeploy production for the
change to take effect. Leave `PRODUCTION_DATABASE_URL` (GitHub `production`
environment) on port 5432.
