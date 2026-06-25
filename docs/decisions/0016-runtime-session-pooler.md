# ADR 0016 — Runtime connects through the Supabase session pooler

- **Status:** Accepted
- **Date:** 2026-06-25
- **Supersedes:** 0015
- **Superseded by:** —

## Context

ADR 0015 moved the Vercel **runtime** `DATABASE_URL` to Supabase's **transaction
pooler** (port 6543) to fix an `EMAXCONNSESSION` outage. That ADR bundled two
changes into one decision and drew the wrong conclusion about which one fixed the
outage.

Reproduction against the real production pooler (2026-06-25) shows:

- The **transaction pooler (6543) hangs `postgres.js` the moment concurrent
  queries exceed the pool `max`** — i.e. as soon as the driver must queue or
  pipeline a query. Even **2** concurrent page renders at `max: 3` hang for the
  full request budget; `fetch_types: false` does not help; it only stops hanging
  when `max` ≥ peak concurrent queries (verified clean at `max: 30`). Under Fluid
  Compute a single pool is multiplexed across many concurrent requests, so a
  bounded `max` cannot satisfy that — the hang is unavoidable in practice.
- The **session pooler (5432) handles the identical concurrent load fine, even
  at `max: 3`** (sub-600ms vs a 15–20s hang on 6543).

Symptom in production: `/federal/overview` and `/federal/roles` "never load"
while lighter pages do. Those two pages issue the most queries per render (a
4-way `Promise.all` plus the layout's member-read chain), so they are the first
to push the driver past `max` into the pipelining path. In `pg_stat_activity`
the stuck queries sit `state=active, wait_event=ClientRead` — the server has
finished and is waiting on a client/pooler that never reads. The database itself
is healthy throughout (`max_connections=60`, ~10 in use): this is **not** a
slow query and **not** connection exhaustion.

### Correcting ADR 0015

The original `EMAXCONNSESSION` ("max clients reached in session mode,
pool_size: 15") was caused by the **old `max: 10`** per-instance ceiling — warm
Fluid instances each holding up to 10 session-pinned connections quickly exceeded
the session pool cap. **`max: 3` is what actually cured it.** The session pooler
was never the problem; the 5432→6543 swap that rode along is what introduced the
concurrency hang.

The app uses no session-pinned features that would *require* the transaction
pooler's per-transaction recycling (no `LISTEN`, no advisory locks, no
session-level `SET`, no cross-request prepared statements), so the session
pooler is fully compatible.

## Decision

The **runtime** connects through the Supabase **session pooler (port 5432)**,
with the per-instance ceiling kept at **`max: 3`** and the fail-fast timeouts
from ADR 0015 (`connect_timeout: 10`, `idle_timeout: 20`) retained.

- This is an environment change only: the Vercel production `DATABASE_URL` host
  port changes `:6543` → `:5432`. No `core/db` code change.
- `prepare: false` is left in place. It is unnecessary on the session pooler
  (which supports prepared statements) but harmless, and avoids a code change;
  re-enabling prepared statements can be revisited separately.
- `max: 3` keeps session-mode connection use bounded: at most 3 server
  connections per warm instance, released after `idle_timeout`. Real concurrency
  for this org is small. If a future load profile approaches the session pool
  cap, raise the Supavisor session pool size in the Supabase dashboard rather
  than reverting to the transaction pooler.
- **Migrations are unchanged.** They already use the session pooler (5432) via
  the separate `PRODUCTION_DATABASE_URL` secret.

## Consequences

- `/federal/overview` and `/federal/roles` (and any future high-fan-out page)
  load reliably under concurrency; the platform-wide stall clears.
- Reverting is a one-line env change back to `:6543` (not recommended — it
  reintroduces the hang).
- Watch for `EMAXCONNSESSION` recurrence as a signal that warm-instance count ×
  `max` is approaching the session pool cap; the lever is the Supavisor pool
  size, not the pooler mode.

## Verification

Reproduced with `postgres.js` against the production pooler: a client at a given
`max` running N concurrent "renders" (3 sequential member reads + a 4-way
`Promise.all`) raced against a hard timeout. Transaction pooler hung at
`max:3 ×2`, `max:10 ×6`, and with `fetch_types:false`; passed only at `max:30`.
Session pooler passed at `max:3 ×6` and `max:10 ×6`.
