# ADR 0010 — Apply database migrations automatically on deploy

- **Status:** Accepted
- **Date:** 2026-06-09
- **Supersedes:** —
- **Superseded by:** —

## Context

The production schema is managed by the per-module migration runner in
`infra/migrations` (`pnpm db:migrate`), tracked in the `_bdas_migrations`
ledger. Nothing ran that command on deploy. Vercel builds and serves the app,
but never applies migrations, so every migration merged after the initial
production setup stayed unapplied until run by hand.

This drift broke production login **twice**:

1. `auth_users.consent_at` missing (`42703`) — migration `auth/0002` unapplied.
2. `member_role_grants` missing (`42P01`) — migration `members/0002` unapplied.

Both were hand-fixed against the live database via the Supabase MCP. That is not
a process — the next new migration would reproduce the incident.

## Decision

Run `pnpm db:migrate` against production automatically, in CI, after a
successful build.

- A dedicated workflow, `.github/workflows/deploy-migrations.yml`, triggers on
  `workflow_run` of the **CI** workflow completing on `main`, and runs only when
  `conclusion == 'success'`. Migrations therefore apply only after lint,
  typecheck, tests, the DB-less build, and Lighthouse have all passed on `main`.
- The job checks out the exact `head_sha` that CI validated, installs, and runs
  `pnpm db:migrate` with `DATABASE_URL` from a **`production` GitHub
  Environment** secret named `PRODUCTION_DATABASE_URL`.
- `DATABASE_URL` must be the Supabase **session-pooler** connection string
  (port 5432). The transaction pooler (6543) cannot run the DDL/transactions the
  migrations use.
- The runner is idempotent — it skips IDs already in `_bdas_migrations` — so a
  run with nothing pending is a no-op, and re-runs are safe.

## Consequences

- The production schema tracks `main` automatically; the two incident classes
  above cannot recur from drift.
- Migrations land **after** the deploy of the code that needs them can begin, so
  expansion/contraction migrations should stay backward-compatible with the
  currently-running code for the brief overlap (already our practice: additive
  columns first, drops in a later migration).
- Applying schema changes requires the `PRODUCTION_DATABASE_URL` secret to be
  present in the `production` environment. If it is unset the job fails loudly
  rather than drifting silently — the desired failure mode.
- A manual-approval gate can be added later via the `production` environment's
  protection rules without touching the workflow.

## Operator setup (one-time)

In the GitHub repo: **Settings → Environments → `production` → Add secret**
`PRODUCTION_DATABASE_URL` = the Supabase session-pooler URI (port 5432) with the
database password. After that, every push to `main` whose CI passes applies any
pending migrations automatically.
