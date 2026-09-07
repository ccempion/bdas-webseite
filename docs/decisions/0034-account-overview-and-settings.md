# ADR 0034 — Mein Konto splits into an overview and a settings page

**Status:** Accepted
**Date:** 2026-09-06

## Context

`/account` was the only personal destination in the signed-in header, and it
rendered a settings form. Once a member had filled in their profile there was no
reason to open it again. Four alert banners could stack above the content; the
member's name carried the same visual weight as "Passwort ändern"; the page knew
the member's group slug and did not link it; and role grants — which the page
already had in `getCurrentMember().grants` — were never shown, so a member
learned they could organise events only by noticing a button.

## Decision

Split the surface.

- `/account` becomes a personal overview: a fixed identity column (status,
  group, joined date, roles) beside a content column carrying open items,
  upcoming event registrations, attendance, the group, and the profile record.
- `/account/einstellungen` becomes the settings surface: e-mail address,
  password, a reserved slot for notification preferences, and the GDPR export.

Only an `active` member gets the two-column page. Every other status, and a user
with no member row, gets a plain single column — correct, not designed. New
sign-ups pass through that path, so it stays on the live route.

Reads cross module boundaries through each module's `index.ts` (CLAUDE.md §1).
Two new read functions in `@bdas/events-module` and a shared role-label map in
`@bdas/members` are the whole cost. No new tables.

## Consequences

- The identity column permanently answers "who am I here and what may I do".
- Later blocks (files, notification preferences) slot into the content column
  and the fixed settings order without another restructuring.
- Two states of the page must be maintained instead of one.
- **Deliberately not built: session management.** Changing the password is the
  accepted remedy for a lost device. `auth_sessions` keeps recording `ip` and
  `user_agent`; nothing surfaces them, and no session list is planned.
- Notification preferences remain unbuilt, so
  `apps/web/content/faq/allgemein.ts:99` — which tells members they manage
  E-Mail-Präferenzen here — stays inaccurate until they ship.

## Alternatives considered

- **Keep one page, reorder it.** Smaller change, but the page stays long and the
  identity scrolls out of view.
- **A grid of tiles.** Looks most like a dashboard, but a tile is a promise of a
  destination, and the destinations (attendance history, files, role history) do
  not exist. Without them it is a grid of decorated text.
