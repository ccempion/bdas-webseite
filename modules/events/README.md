# `@bdas/events-module`

Event creation, registration, and waitlisting (spec §10, Phase 2 core slice).

> **Package name:** `@bdas/events-module`, not `@bdas/events`. The latter is the
> core event **bus** (`core/events`). Renaming the bus would touch auth/groups/
> members, so the business module takes the suffixed name (ADR-free decision —
> folder stays `modules/events` to match the migration manifest).

## Owned tables

| Table                 | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `events`              | Event row; `group_id` null = federation-wide                    |
| `event_registrations` | One active row per member; `waitlist_position` null = confirmed |
| `event_attendance`    | Day-of check-in (table only this PR; service/UI deferred)       |

Migration: `migrations/0001_init.sql`, run after `groups` + `members` (the FK
targets) per `infra/migrations` manifest.

## Public surface

```ts
import {
  // reads (viewer-scoped)
  listUpcomingEvents,
  listManagedEvents,
  getEvent,
  getMyRegistration,
  // lifecycle (board-gated at the app layer)
  createEvent,
  updateEvent,
  publishEvent,
  cancelEvent,
  EventInput,
  // registration (member self-service)
  registerMember,
  cancelRegistration,
  // authorization predicates + viewer
  canView,
  canManage,
  ANON,
  type Viewer,
  // types
  type EventItem,
  type EventWithCounts,
  type RegistrationResult,
  type EventsEvent,
} from "@bdas/events-module";
```

Anything not re-exported from `src/index.ts` is private (rule 8).

## Authorization

Services are **auth-agnostic** (same as `groups`): callers gate at the app
action layer using `@bdas/members` (`getCurrentMember`, `canManageGroup`,
`isFederalBoard`). Build a `Viewer` from the current member and pass it to the
read services for visibility filtering; pass `ANON` for anonymous visitors.

- Create/edit/publish/cancel: group-scoped event → `canManageGroup(grants,
groupId)`; federation-wide (null group) → `isFederalBoard(grants)`.
- Register/cancel: the current member acts on themselves.

## Visibility

`public` → everyone · `members_only` → active members · `group_only` → members
of that group. Drafts and cancelled events are visible only to managers.

## Registration & waitlist

`registerMember` confirms a seat when capacity allows, else assigns the next
`waitlist_position`. `cancelRegistration` frees the seat and, if a _confirmed_
seat opened before the event starts, auto-promotes the waitlist head (emitting
`events.waitlist.promoted`) and closes the position gap. All in one transaction.

## Events emitted (consumed later by `notifications`)

`events.event.published` · `events.event.cancelled` · `events.event.registered`
· `events.event.deregistered` · `events.waitlist.promoted`. No subscriber yet.

## Testing

`src/index.test.ts` is a Postgres integration test (no DB mocks, per §4). It
applies the auth + groups + members + events migrations into a throwaway schema
and exercises create → publish → register → waitlist → cancel → auto-promote.

## Deferred (future events PRs)

ICS feeds, check-in/attendance marking, post-event metrics (dashboard, Phase 3),
richer filtering.
