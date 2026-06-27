# Design: Proper Event Pages + Event Management

**Date:** 2026-06-26
**Status:** Approved design, pre-plan
**Module:** `events` (+ `apps/web` consumer UI, `notifications`, `core/storage`, `members` role grants)
**Feature flag:** rides the existing events flag (`requireEventsFlag`) — no new flag.

---

## 1. Problem

Event organizers cannot build a real event page. The `events` table has a single
`description_md` field that the public page renders as **plain text**
(`whitespace-pre-wrap`) — no formatting, no images. There is no cover image, no
structured location, and no way for a non-board member to be delegated the running
of a single event. The board dashboard shows event _counts_ but no way to drill into
an event or see who registered.

This design delivers: a formatted, image-capable event page; a single operational
home for managing one event; a delegable per-event organizer role; and an attendee
roster.

## 2. Goals

- Organizers compose a "proper" event page: cover image, rich formatted description
  (with inline images), and a searchable, pinned location that renders as a tappable
  button.
- A single home — `/admin/events/<id>` — for managing one event (edit page + roster),
  reachable by board members **and** delegated organizers.
- A delegable `event_organizer` role scoped to one event, granted by a board member,
  with an email notification to the new organizer.
- The board dashboard remains a read-only overview that links into the management home.
- Organizers can reach their attendees: email all confirmed registrants, and registrants
  are auto-notified on material change (date/time/location) and cancellation.
- Organizers manage the roster: cancel a registration on someone's behalf (auto-promoting
  the waitlist), add a walk-in, and export the roster as CSV.
- Per-event **opt-in guest registration** so events that don't require membership accept
  non-member sign-ups.
- Attendee-facing polish: "Add to calendar" (ICS) on the public page, and a draft
  preview ("view as public") before publishing.

## 3. Non-goals (v1)

- **Check-in / attendance tracking.** Knowing who physically attended is overhead
  nobody maintains. The `event_attendance` table stays dormant (already in schema; no
  migration needed to revisit later).
- **Embedded interactive map** or static-map thumbnail. A keyless location button is
  the v1 scope. Leaflet/OSM embed or Geoapify static maps are explicit future options.
- **Google Places Autocomplete.** Rejected for v1: requires a billing-enabled API key
  and pulls Google tracking cookies, conflicting with the GDPR posture (ADR 0008).
- **Full block/page builder** (Notion-style). The editor is a constrained toolbar on a
  fixed set of slots, not arbitrary block composition.
- Attendance-over-time dashboard chart (possible fast follow, not in scope).
- **Auto reminder email** before the event. Real need, but requires a scheduled job
  (cron is deferred elsewhere in the project) — flagged and deferred as its own job.
- **Custom registration questions** (dietary, +1 guests, workshop choice) — its own
  feature; v1 registration captures identity only.
- **Event duplication** ("copy last year's event").

## 4. Locked decisions

| Decision                      | Choice                                                                                                                                           | Rationale                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rich-text engine              | **Tiptap**                                                                                                                                       | Constrained, batteries-included (image/link extensions), first-class server-side `generateHTML` for RSC rendering; perf gap vs Lexical irrelevant at event-content sizes. |
| Page model                    | **Cover image + rich body + optional named prose slots + functional fields**                                                                     | "Proper page" without a full builder; empty slots don't render.                                                                                                           |
| Image storage                 | **Separate public-read bucket (`event-media`)** via `core/storage`                                                                               | Event pages are public + cacheable → plain public URLs, not per-render signed GETs. Distinct from the private `files` bucket.                                             |
| Body content storage          | **`content` jsonb** holding Tiptap docs; retire `description_md`                                                                                 | One extensible column; adding/removing a slot is a shape change, not a migration.                                                                                         |
| Location search               | **Photon (keyless OSM geocoder), type-ahead**                                                                                                    | Free, no API key, no Google cookies/consent.                                                                                                                              |
| Location button               | **Keyless Google Maps directions URL** (`maps/search/?api=1&query=<lat>,<lng>`)                                                                  | Familiar Google directions on click without any API key.                                                                                                                  |
| Management home               | **`/admin/events/<id>`**, gated **board OR `event_organizer:<id>`**                                                                              | The `(board)` dashboard requires board grants, so non-board organizers can't live there. Co-locates manage with create.                                                   |
| Organizer delegation          | **New scoped role `event_organizer:<event_id>`** (ADR 0007 pattern)                                                                              | Rides existing grant/audit machinery; scoped to one event.                                                                                                                |
| Organizer notification        | **`organizer.granted` event → `notifications` email** with deep link to editor                                                                   | Matches existing event-email pattern.                                                                                                                                     |
| Organizer permission boundary | **`event_organizer` may edit page + manage roster + email registrants + export; cancel/delete the event and grant co-organizers are board-only** | Delegation without handing over destructive or escalation powers.                                                                                                         |
| Guest registration            | **Per-event opt-in `allow_guest_registration`; member-less registration via name + email**                                                       | Some events don't require membership; default stays member-only.                                                                                                          |
| Registrant changes            | **`event.updated` event on date/time/location change + cancellation → `notifications`**                                                          | Registrants (members and guests) hear about material changes.                                                                                                             |

## 5. Data model changes (`events` module owns these)

New columns on `events`:

- `cover_image_key` (text, nullable) — key in the `event-media` bucket.
- `summary` (text, nullable) — 1–2 line teaser for list cards + page meta description.
- `registration_deadline` (timestamptz, nullable) — gates the register button
  independently of `starts_at`.
- `content` (jsonb, nullable) — `{ body, agenda?, directions?, bring? }`, each value a
  Tiptap JSON document.
- Structured location (replaces freeform `location` / `location_url`):
  - `location_name` (text, nullable)
  - `location_address` (text, nullable)
  - `location_lat` (double precision, nullable)
  - `location_lng` (double precision, nullable)
- `allow_guest_registration` (boolean, not null, default false) — opt-in non-member
  sign-ups. Only meaningful when the event is publicly viewable.

Changes to `event_registrations` (for guest registration):

- `member_id` becomes **nullable**.
- `guest_name` (text, nullable), `guest_email` (text, nullable) added.
- CHECK constraint: exactly one of (`member_id`) or (`guest_email`) is set — a
  registration is either a member or a guest, never both or neither.
- Capacity, waitlist, and roster counts include guest registrations.

Migration:

- Wrap existing plain-text `description_md` into a minimal Tiptap doc stored at
  `content.body`; then drop/retire `description_md`.
- Carry existing `location` text into `location_name`; `location_url` is superseded by
  the generated maps link (preserve any existing value into `location_address` if
  non-empty, else discard).

The migration lives in `modules/events/migrations/` and is registered in the
`infra/migrations` manifest (rule 7).

## 6. Editor (Tiptap)

- A reusable constrained toolbar component: headings, bold/italic, lists, links,
  **image**. Reused for each rich slot (body + optional Agenda / Anfahrt / Mitbringen).
- Empty slots are omitted on the public page — a simple event stays title + cover + one
  paragraph.
- **Image pipeline (shared by cover + inline images):** organizer picks/drops an image
  → signed PUT upload via `core/storage` to the `event-media` bucket → editor inserts
  the returned public URL.
- **Public rendering:** event pages are React Server Components. `content` is rendered
  to **sanitized** HTML on the server via Tiptap `generateHTML`; the editor JS never
  ships to public visitors.
- **Draft preview:** while an event is `draft`, organizers/board can open the public
  page via a "view as public" preview (the page already supports `draft` state); public
  visitors still get 404 until published.
- **Add to calendar:** the public page offers an ICS download for the single event.
  ICS generation is **not yet implemented** (the per-group feed is specced but unbuilt),
  so Slice 1 adds a small single-event ICS serializer in the events module — designed so
  the per-group/federation feed can reuse it later.

## 7. Location

- A `LocationPicker` in the editor: a type-ahead search backed by **Photon** (keyless).
  Selecting a result stores `location_name`, `location_address`, `location_lat`,
  `location_lng`.
- Public page renders a **location button**: "📍 [name] — Route öffnen", deep-linking
  to a keyless Google Maps directions URL built from lat/lng.

## 8. Roles, permissions, IA

- **`/admin/events/<id>`** = single management home: page editor (cover + Tiptap slots +
  functional fields + location) and attendee roster. Gated by **board member OR
  `event_organizer:<id>`** for this event.
- New role value **`event_organizer`**, scoped to `event_id` (ADR 0007 scoped grants).
  Granted from the manage page by a board member (member search → `members.grantRole`).
  Grant can only be issued after the event row exists (create, then delegate).
- **Permission boundary.** An `event_organizer` may edit the page, manage the roster
  (cancel/add registrations), email registrants, and export. **Cancelling or deleting
  the event, and granting co-organizers, are board-only.** Multiple co-organizers are
  supported (the grant can be issued to several members) but only by a board member.
- On grant, the events flow emits **`organizer.granted`**; `notifications` consumes it
  and sends a transactional email with a deep link to `/admin/events/<id>`.
- The **`(board)` dashboard stays read-only overview**. `EventsTable` rows become links
  into `/admin/events/<id>` (both `/federal/events` and `/gruppe/[slug]/events`).

## 9. Attendees

- **Roster** on the manage page: confirmed + waitlist, with name (member or guest),
  status, registered-at. New service `listRegistrations(eventId, viewer)` enforcing
  board-or-organizer permission internally; includes guest registrations.
- **Manual roster control:** organizer can **cancel a registration** on a registrant's
  behalf (auto-promotes the next waitlisted person, same path as self-cancel) and **add
  a walk-in** (member or guest). New services `cancelRegistrationFor` and
  `addRegistration`, permission-gated.
- **Email all confirmed registrants:** an action on the manage page that sends a
  one-off message to confirmed registrants (members by account email, guests by
  `guest_email`). Delegates to `notifications`; logged in `notification_log`.
- **CSV export** of the roster (name, email, status, registered-at) for door lists /
  catering / badges.
- **Change notifications:** editing date/time/location of a published event emits
  `event.updated`; cancellation emits the existing cancel event. `notifications` emails
  affected registrants — members and guests.
- Surfaced metric: registered count (already computed). No attended count.

## 10. Module-rule adherence (CLAUDE.md §1, §3)

- `events` owns all event tables; the manage UI and dashboard read via the events
  public interface (`index.ts`), never raw SQL on its tables (rule 1, hard rule §13).
- New services (`listRegistrations`, location/content writes, organizer-grant trigger)
  are exported from the events `index.ts` (rule 8).
- Cross-module side effects go through events (`organizer.granted`) consumed by
  `notifications` via `core/events` (rule 2, §3). Role grants delegate to
  `members.grantRole` (no direct writes to members' tables).
- `core/storage` owns object-store interaction for the `event-media` bucket; the app
  never proxies bytes (signed URLs).
- Tests ship in the same PR as code, integration-tested against real Postgres (§4).

## 11. Slicing (one mergeable PR each, all under the events flag)

1. **Event page + editor.** Schema migration; `event-media` public bucket via
   `core/storage`; Tiptap editor + image pipeline; structured fields; `LocationPicker`
   (Photon) + location button; public RSC rendering of `content`; draft "view as public"
   preview; per-event ICS "add to calendar".
2. **Attendees + roster management.** `listRegistrations` + roster on
   `/admin/events/<id>`; manual cancel-for / add-walk-in; email-all-registrants; CSV
   export; `event.updated` change notifications; `EventsTable` dashboard rows link into
   the manage home.
3. **Organizer role.** `event_organizer` value + guards (board-or-organizer, with
   cancel/delete/grant board-only); grant UI on the manage page; `organizer.granted`
   event + notifications email template.
4. **Guest registration (opt-in).** `allow_guest_registration` + nullable-member /
   guest-fields migration on `event_registrations`; public guest sign-up form; guest
   handling across roster, counts, CSV, and notifications.

Slice 1 stands alone and delivers the visible win. Slices 2–4 build on it; Slice 4
depends on the roster/notification paths from Slice 2.

## 12. Open items (not blockers)

- Confirm Photon hosted endpoint usage limits are acceptable, or choose a freemium
  fallback (Geoapify/LocationIQ) if results are thin. Decided at implementation time in
  Slice 1.
- German copy for the new fields/sections and the organizer email — native-speaker pass
  before merge (build-plan §6).
- Guest registration stores name + email of non-members → GDPR consent checkbox on the
  guest sign-up form and a retention/purge story (ADR 0008 posture). Settle in Slice 4.
- `allow_guest_registration` should only be enabled when the event is publicly viewable;
  enforce the coupling in the editor and server-side in Slice 4.
