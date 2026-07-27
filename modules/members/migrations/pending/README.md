# Held-back migrations

Migrations in this folder are **finished and tested, but must not be applied
yet**. The runner (`pnpm db:migrate`) discovers `*.sql` files directly inside
`modules/<name>/migrations/` and does not descend into subdirectories, so a file
parked here is invisible to it. The test harness references it by explicit path,
so tests still run against the final schema.

Moving a file up one level is what schedules it. Do that only when its stated
precondition is met, and in the same change that makes it true.

## `0009_reason_required.sql`

Enforces that a rejected group-change request carries a reason
(`(status = 'rejected') = (reason_category IS NOT NULL)`).

**Precondition: the code that always writes a reason on rejection must be
deployed first.** Applying this against a deployment whose `decideGroupChange`
does not set a reason makes every rejection fail with a constraint violation —
for as long as it takes someone to notice, because migrations here are applied by
hand and are decoupled from deploys.

The columns themselves, and the backfill of existing rows, are in
`0008_application_reasons.sql`, which is safe against the currently deployed code
and can be applied at any time. This split is the expand/contract half of ADR
0031; see `docs/superpowers/specs/2026-07-27-membership-application-lifecycle-design.md`.

Move it up when Phase 2 of that plan is deployed.
