# @bdas/newsletter

Collects and documents newsletter consents (spec:
`docs/superpowers/specs/2026-09-06-newsletter-modul-design.md`). **It sends
nothing.** No Resend, no import of `@bdas/notifications` — the module publishes
typed events and the delivery side is built separately.

## Owned tables

| Table                    | Purpose                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| `newsletter_subscribers` | One row per address. `email` is the unique duplicate key, `user_id` optional |
| `newsletter_consent_log` | Append-only proof of every consent event, cascading from the subscriber      |
| `newsletter_rate_limits` | Fixed-window counters that cap confirmation mail per address                 |
| `newsletter_prompts`     | Per-account memory of how often the signup hint was dismissed                |

Nothing outside this module reads or writes them (CLAUDE.md §1 rule 1). The app
layer calls services from `@bdas/newsletter` and never touches `newsletter_*`.

## Two ways into the list, plus one

**Logged in (§3.1) — `subscribeAsUser`.** One click, straight to `subscribed`,
no confirmation mail. Authentication has already supplied the second factor
that double opt-in exists to establish: a logged and timestamped click inside
an authenticated session proves the address holder's consent more strongly than
a click in a mail anyone can forward.

**Anonymous (§3.2) — `subscribePublicly`.** Full double opt-in. A `pending` row
with a hashed, single-use, seven-day token, and a
`newsletter.confirmation_requested` event asking for the mail. Returns `void`
in every case: new, known, unsubscribed or an account holder are
indistinguishable from the outside (§8 no. 4), otherwise the form becomes a
tool for checking who is close to the federation.

**At registration (§3.3) — `subscribeAtRegistration`.** The checkbox on
`/registrieren` writes a `pending` row and publishes **nothing**: the
platform's own verification mail is the double opt-in for both. The
`auth.user.verified` handler lifts the row to `subscribed`. Never verified
means never on the list.

## Surface

Everything importable lives in `src/index.ts` (rule 8). `schema.ts`,
`tokens.ts`, `rate-limit.ts`, `consent-log.ts`, `test-db.ts` and the resolver
_getter_ are private — consumers wire a resolver, they never read one. Every
service takes the `Db` handle as its first argument and is **auth-agnostic**:
it validates, it does not authorize.

| Service                                    | What it does                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `subscribeAsUser(db, input)`               | One-click subscribe for an authenticated account, idempotent            |
| `subscribePublicly(db, input)`             | Anonymous double-opt-in signup; always resolves to `void`               |
| `subscribeAtRegistration(db, input)`       | `pending` row from the registration checkbox, publishes nothing         |
| `confirmSubscription(db, token, context?)` | Redeems a confirmation link → `confirmed`/`already_confirmed`/`expired` |
| `unsubscribeByToken(db, token, context?)`  | The permanent link from the mail; `NotFoundError` on an unknown token   |
| `unsubscribeAsUser(db, input)`             | The switch under "Mein Konto"; quiet when there is nothing to end       |
| `getSubscriptionForUser(db, userId)`       | The account's row, whatever its status                                  |
| `listSubscribers(db, filter?)`             | Board list: address-resolved, deduplicated, newest first                |
| `countSubscribers(db)`                     | Per-status counters over the _same_ pipeline as the list                |
| `declineForUser(db, input)`                | One dismissal; the third writes `declined` and ends the asking          |
| `shouldPrompt(db, userId)`                 | Whether an interrupting hint may be shown at all                        |
| `registerNewsletterSubscribers(db)`        | Wires the bus handlers; idempotent                                      |
| `setAccountEmailResolver(resolver)`        | Composition-time wiring of the address resolver                         |

`listSubscribers` and `countSubscribers` share one pipeline on purpose: a
`GROUP BY status` counter would be one query cheaper but could disagree with
the table beneath it by the number of duplicates, and a tile that contradicts
its own table is a bug report.

## Events

**Published** — `newsletter.confirmation_requested` (carries the token _in
plaintext_; consumers must not log the event verbatim) and
`newsletter.already_subscribed`. Both are answered identically on screen; only
the inbox tells them apart.

**Subscribed** — `auth.user.verified`, matched structurally rather than by
importing `@bdas/auth`.

`core/events` is synchronous and rethrows into the publisher, and
`auth.user.verified` fires inside the verification path. **A handler here must
never throw** (spec §7): a failure would cost someone their email verification
over a newsletter row. Every handler body is wrapped in `safe()` and can only
log.

## The account address is resolved, not stored

`email` on a row with a `user_id` is a _duplicate key_, not necessarily the
current login address. Email is owned by `modules/auth` and identity by
`modules/members`, so the current address is resolved through the
composition-time `AccountEmailResolver` that `apps/web` wires at boot — no
import of either module (rule 2). The interface is batched
(`readonly string[] → Map`) so the board list and the CSV export never fan out
into N+1 queries.

The resolver slot is backed by `globalThis` via `Symbol.for`, for the same
reason as the event bus in `965b043`: Next bundles `instrumentation.ts`
separately from route handlers, so a module-level `let` written at boot would
be invisible to a Server Action.

Deduplication therefore happens on read, and the row carrying `user_id` wins:
its address follows the person, the other one is a dead key.

## Flag and migrations

Feature flag `newsletter` (`core/feature-flags`), off in production until the
module is acceptance-complete. Migrations live in
`modules/newsletter/migrations/` and are registered in
`infra/migrations/src/manifest.ts` — never applied by directory walk.

## Tests

Integration tests against real Postgres, no database mocks:

```bash
pnpm db:up
pnpm vitest run modules/newsletter
```

Each test file provisions its own schema through the private `test-db.ts`
harness. When Postgres is unreachable the suites skip rather than fail.
