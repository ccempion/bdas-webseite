# 0011 — Defer consolidation of the email/Notifier concern into core/

- Status: Accepted
- Date: 2026-06-11
- Supersedes: —

## Context

Two modules independently implement an email-sending stack:

- `modules/auth/src/notifier.ts` + `notifier-resend.ts` (fixed message kinds:
  verify, password-reset)
- `modules/notifications/src/notifier.ts` + `notifier-resend.ts` (carries an
  already-rendered subject/text/html)

CLAUDE.md §1 rule 4 says shared concerns belong in `core/`. A review (2026-06)
flagged the duplication: any Resend behavior change (idempotency keys, retries,
the error-handling fix, a GDPR-mandated footer) must be applied in two drivers
and two composition sites and will drift.

The two `Notifier` interfaces are not identical: auth's takes a typed
`AuthMessage` and renders internally; notifications' takes a pre-rendered
`OutboundEmail`. A correct shared abstraction must reconcile these, which is
coupled to the planned "auth-email absorption into notifications" work that the
build plan already defers.

## Decision

Keep the two stacks separate for now. Do **not** extract a shared `core/email`
concern in the notifications review-fix PR. Consolidation is deferred until the
auth-email absorption work, at which point a single `core/email` Notifier +
Resend driver + composition seam will be introduced and both modules migrated.

Correctness fixes that apply to both drivers (e.g. throwing on Resend's error
result) are applied per-module in the meantime; the auth driver's identical
error-discard bug is tracked as a separate auth PR.

## Consequences

- Short term: one known duplication, accepted and recorded here rather than
  silently carried.
- The error-handling fix from the 2026-06 review was applied to
  `modules/notifications` first and has now been mirrored into `modules/auth`
  (the driver throws on Resend errors; the auth Server Actions log and
  continue). The two drivers remain separate pending consolidation.
- When consolidation happens, this ADR is the entry point; the unified concern
  supersedes both per-module drivers.
