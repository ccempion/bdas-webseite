# `@bdas/events-module`

Event creation, registration, and waitlisting (spec §10, Phase 2 core slice).

> **Package name:** `@bdas/events-module`, not `@bdas/events`. The latter is the
> core event **bus** (`core/events`). Renaming the bus would touch auth/groups/
> members, so the business module takes the suffixed name (ADR-free decision —
> folder stays `modules/events` to match the migration manifest).

## Owned tables

| Table                 | Purpose                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `events`              | Event row; `group_id` null = federation-wide                                 |
| `event_registrations` | One active row per member **or** guest; `waitlist_position` null = confirmed |
| `event_attendance`    | Day-of check-in (table only this PR; service/UI deferred)                    |

Migrations:

- `migrations/0001_init.sql` — base schema, run after `groups` + `members`
- `migrations/0002_event_pages.sql` — adds `content`, `cover_image_key`,
  `summary`, `registration_deadline`, `location_name`, `location_address`,
  `location_lat`, `location_lng`
- `migrations/0003_guest_registration.sql` — adds `allow_guest_registration` on
  `events`; makes `event_registrations.member_id` nullable and adds `guest_name`,
  `guest_email`, `guest_cancel_token` with a member-XOR-guest CHECK (Slice 4)

### Guest registration columns (added in Slice 4)

| Column                            | Table                 | Purpose                                                                       |
| --------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| `events.allow_guest_registration` | `events`              | Per-event opt-in; only valid on `public` events (enforced in service/editor)  |
| `member_id` (now nullable)        | `event_registrations` | Null for a guest; a CHECK enforces exactly one of `member_id` / `guest_email` |
| `guest_name`, `guest_email`       | `event_registrations` | Non-member identity captured on the public sign-up form (consent required)    |
| `guest_cancel_token`              | `event_registrations` | Single-use, unguessable token backing the guest self-cancel link in email     |

### Event page columns (added in Slice 1)

| Column                  | Type               | Purpose                                                                                                   |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| `content`               | `jsonb`            | Structured Tiptap JSON: `{ body, agenda?, directions?, bring? }` — each slot is an independent Tiptap doc |
| `cover_image_key`       | `text`             | Storage key in the `event-media` bucket for the cover image                                               |
| `summary`               | `text`             | Short plain-text teaser (shown on cards + `<meta>` description)                                           |
| `registration_deadline` | `timestamptz`      | UI-only gate this slice; server-side enforcement lands in Slice 2                                         |
| `location_name`         | `text`             | Human-readable venue name (e.g. "Stadtbibliothek München")                                                |
| `location_address`      | `text`             | Full street address (drives the Google Maps button)                                                       |
| `location_lat`          | `double precision` | Latitude from Photon geocoder                                                                             |
| `location_lng`          | `double precision` | Longitude from Photon geocoder                                                                            |

> **Deploy note:** `description_md` is retained in the schema (nullable, no
> longer written by new code). A cleanup migration that drops it is deferred to
> after all active deployments have flushed old writes (ADR 0010 deploy safety).

## Public surface

```ts
import {
  // reads (viewer-scoped)
  listUpcomingEvents,
  listPastEvents, // published events with startsAt < now, newest-first, visibility-filtered
  listManagedEvents,
  getEvent,
  getMyRegistration,
  // lifecycle (board-gated at the app layer)
  createEvent,
  updateEvent,
  publishEvent,
  cancelEvent,
  EventInput,
  // registration (member self-service + guest, Slice 4)
  registerMember,
  registerGuest, // non-member sign-up on public, opt-in events
  cancelRegistration,
  cancelGuestByToken, // guest self-cancel via the emailed token
  listRegistrations, // roster incl. guests (name/email on the row)
  // authorization predicates + viewer
  canView,
  canManage,
  ANON,
  type Viewer,
  // rich content (Slice 1)
  renderEventContentHtml,
  plainTextToDoc,
  eventToIcs,
  // types
  type EventItem,
  type EventWithCounts,
  type RegistrationResult,
  type EventsEvent,
  type TiptapDoc,
  type EventContent,
} from "@bdas/events-module";
```

Anything not re-exported from `src/index.ts` is private (rule 8).

### `renderEventContentHtml(doc: TiptapDoc | null | undefined): string`

Server-side Tiptap→HTML renderer. Converts a single content slot (e.g.
`event.content.body`) to sanitized HTML safe for `dangerouslySetInnerHTML`.
Allowed tags: `p br strong em u s h2 h3 h4 ul ol li blockquote a img hr`.
Returns `""` for null/empty docs.

### `plainTextToDoc(text: string): TiptapDoc`

Wraps a plain string in a single-paragraph Tiptap doc. Useful for seeds and
preview fixtures.

### `eventToIcs(event): string`

Produces a minimal RFC 5545 VCALENDAR string for a single event (uses `id`,
`title`, `summary`, `startsAt`, `endsAt`, `locationName`, `locationAddress`).
Serve as `text/calendar; charset=utf-8` with a `.ics` filename.

### `EventContent`

```ts
type EventContent = {
  body?: TiptapDoc | null;
  agenda?: TiptapDoc | null;
  directions?: TiptapDoc | null;
  bring?: TiptapDoc | null;
};
```

Each slot is rendered independently with `renderEventContentHtml`. Omitted
slots produce no section on the public page.

## `event-media` storage bucket

Cover images and inline body images are stored in a **public** Supabase Storage
bucket. The bucket must be created manually in Supabase before enabling the
event-pages feature.

**Manual Supabase setup (once per environment):**

1. In Supabase → Storage → New bucket, create `event-media`.
2. Set **Public** = on (anonymous GET is allowed; no signed download needed).
3. Under Policies, restrict uploads to service-role only (the route handler
   uses the service-role key).
4. Set allowed MIME types: `image/*`.
5. Set max upload size: **10 MB**.

**Environment variable:**

```
SUPABASE_EVENT_MEDIA_BUCKET=event-media   # optional; this is the default
```

`getEventMediaStorage()` (from `@bdas/storage`) returns the Supabase driver
wired to this bucket. It reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` —
same keys used by the files module. `publicUrl(key)` returns the stable CDN URL
for a stored image (no expiry, since the bucket is public).

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

**Guests (Slice 4).** On a published, `public` event with
`allow_guest_registration`, `registerGuest(eventId, { name, email })` signs up a
non-member — sharing the same capacity/waitlist path as members and minting a
`guest_cancel_token`. Guests self-cancel with `cancelGuestByToken(eventId,
token)` (the emailed link). One active registration per guest email per event
(case-insensitive). `listRegistrations` and the counts include guests; a roster
row is a member (`memberId` set) or a guest (`guestName`/`guestEmail` set).

## Events emitted (consumed by `notifications`)

`events.event.published` · `events.event.cancelled` · `events.event.registered`
· `events.event.deregistered` · `events.waitlist.promoted`. The registrant
events carry either `memberId` **or** guest fields (`guestEmail`, `guestName`,
and `guestCancelToken` on registered/promoted) so subscribers resolve the right
recipient.

## Testing

Integration tests (no DB mocks, per §4) run against a real Postgres instance.
Each test file creates a throwaway schema and tears it down after:

| File                  | Covers                                                         |
| --------------------- | -------------------------------------------------------------- |
| `src/index.test.ts`   | create → publish → register → waitlist → cancel → auto-promote |
| `src/content.test.ts` | `renderEventContentHtml` + `plainTextToDoc` round-trips        |
| `src/ics.test.ts`     | `eventToIcs` RFC 5545 output                                   |

Set `DATABASE_URL=postgres://…` to run the DB-backed tests. Without it they
skip gracefully. In CI, Postgres is provided by the GitHub Actions service.

## Deferred (future events PRs)

- `description_md` column drop (cleanup migration, after deploy-safety window per ADR 0010)
- Registration-deadline server-side enforcement in `registerMember` (Slice 2)
- Roster management, CSV export, change notifications (Slice 2)
- `event_organizer` role (Slice 3)
- Guest registration / `allow_guest_registration` flag (Slice 4)
- Check-in / attendance marking, post-event metrics (Phase 3)
