# Held-back migrations

Migrations in this folder are **finished and tested, but must not be applied
yet**. The runner (`pnpm db:migrate`) discovers `*.sql` files directly inside
`modules/<name>/migrations/` and does not descend into subdirectories, so a file
parked here is invisible to it. The test harness references it by explicit path,
so tests still run against the final schema.

Moving a file up one level is what schedules it. Do that only when its stated
precondition is met, and in the same change that makes it true.

Currently empty. The folder is kept because the mechanism is part of how ADR 0031
was rolled out and will be reused for the next expand/contract split.

## History

`0009_reason_required.sql` was parked here until the code that always writes a
reason on rejection was deployed, then moved up and applied to production on
2026-07-29.
