# `@bdas/notifications`

Outbound transactional email (spec §16, Phase 2 core slice). Subscribes to the
module event bus and sends the email that matches each event, logging every
send for audit.

## Owned tables

| Table              | Purpose                                    |
| ------------------ | ------------------------------------------ |
| `notification_log` | One audit row per send (`sent` / `failed`) |

Migration: `migrations/0001_init.sql`, runs after `members` (the FK target) per
the `infra/migrations` manifest.

## Public surface

```ts
import {
  sendTransactional,
  registerNotificationSubscribers,
  // composition seams (wired in apps/web at boot)
  setNotifier,
  createResendNotifier,
  consoleNotifier,
  getNotifier,
  type Notifier,
  type OutboundEmail,
  type ResendNotifierOptions,
  setRecipientResolver,
  getRecipientResolver,
  type RecipientResolver,
  // types
  type TransactionalTemplate,
  type TemplateData,
  type SendResult,
  type RecipientContact,
} from "@bdas/notifications";
```

Anything not re-exported from `src/index.ts` is private (rule 8) — including
`schema.ts`, `templates.ts`, and the `unregisterNotificationSubscribers` test
helper.

## How it works

`registerNotificationSubscribers(db)` (called once at boot) subscribes to three
`events`-module bus events and calls `sendTransactional`, which resolves the
recipient via the composed `RecipientResolver`, renders a German template,
sends through the composed `Notifier`, and writes a `notification_log` row.

| Bus event (`@bdas/events`)                   | Template                         |
| -------------------------------------------- | -------------------------------- |
| `events.event.registered` (waitlisted=false) | `event_registration_confirmed`   |
| `events.event.registered` (waitlisted=true)  | `event_waitlisted`               |
| `events.event.deregistered`                  | `event_deregistration_confirmed` |
| `events.waitlist.promoted`                   | `event_waitlist_promoted`        |

The bus events carry `memberId` and `eventId` but not the event title, so each
handler resolves the title at runtime via the `events` module's public
`getEvent` service (passing a system viewer). This is a **runtime** dependency
on `@bdas/events-module`, not types-only — `subscribers.ts` calls `getEvent` to
render a meaningful subject/body. The lookup is wrapped so a read failure falls
back to a generic title, and each handler is wrapped in `safe()` so it can never
throw into the bus. (The events producer publishes after its transaction
commits, so an escaping error would not roll anything back — it would just fail
the originating action after its write already succeeded.)

## Cross-module boundaries (rule 1)

Email is owned by `auth`, identity by `members`. This module reads neither
table — it depends on the `RecipientResolver` interface, wired in `apps/web`
from `members.getMember` + `auth.getUserExport`. Event titles come only through
`events`' public `getEvent` service, never a direct `events` table read.
Transactional mail is non-optional (§16), so there is no preference check.

## Testing

`src/index.test.ts` is a Postgres integration test (no DB mocks, per §4): it
applies auth + members + notifications migrations, fakes the Notifier and
Resolver, and asserts both direct `sendTransactional` calls and bus-driven
sends write the right `notification_log` row. `src/templates.test.ts` covers
render output.

## Deferred (future PRs)

`events.event.published` / `events.event.cancelled` fan-out (needs an `events`
registrant-list service — rule 1), `broadcastToGroup` / `broadcastFederal`,
per-user preferences, absorbing auth's verify/reset email (future ADR).
