# ADR 0032 — The lead owns the group profile; `/admin/gruppen` is removed

- **Status:** Accepted
- **Date:** 2026-08-08
- **Extends:** ADR 0013 (lead delegation), ADR 0026 (group page editors)
- **Issue:** #62

## Context

A group's master data — name, city, contact address, socials, meeting location
— lived on `/admin/gruppen/[slug]/bearbeiten`, a federal surface. The board
page `/gruppe/[slug]/profile` edited only three of those fields, so a lead who
wanted to change a contact address had to ask the federal board. Meanwhile the
public page body has been lead-editable since ADR 0026, but nothing in the
dashboard pointed at that editor. Groups also had no picture anywhere.

`/admin/gruppen` had already been superseded in part: `(board)/federal/groups`
creates and archives groups. Keeping both surfaces meant two forms writing the
same table with different field sets and different authorization.

## Decision

- **The group's `local_board_lead` owns the group's master data.**
  `/gruppe/[slug]/profil` (renamed from `profile`) edits name, city, contact
  email, Instagram, website, location and banner image. Gate is
  `canGrantLocalBoard` = federal board ∨ the group's own lead — the same
  authority ADR 0013 gives delegation, and a superset of nothing else. Plain
  `local_board` no longer edits, matching ADR 0026's "the lead delegates
  explicitly" rule. The Server Action carries the identical check.
- **`slug` and `status` are not on that surface.** The slug is the immutable
  public URL; status stays federal (`archiveGroup` on `/federal/groups`).
- **`/admin/gruppen` is deleted outright**, not redirected. Creation keeps
  name/city/slug on `/federal/groups`; every other field is filled in afterwards
  on the group's own profile page, which the federal board can reach for any
  group.
- **Group banner images reuse the public `content-media` bucket** through the
  existing `POST /api/content/upload-url` with the group's content slug
  (`gruppen/<slug>`). That route already authorizes per group via
  `canEditGroupPage` (ADR 0026) and already enforces the `CONTENT_IMAGE` cap, so
  the feature needs no new bucket, route, or environment variable. `groups`
  stores an opaque `image_key` and never a URL, keeping the module free of a
  storage dependency (CLAUDE.md §1 rule 2).
- **The banner renders as server chrome, not authored content** — a 16:9 image
  above the fixed header of `/gruppen/<slug>`. ADR 0026's rule that the header
  is structurally non-Puck is preserved.

## Consequences

- Switching a group between `active` / `dormant` / `new` has no UI left.
  Accepted deliberately: the federal group-administration surface is to be
  rebuilt later. `archiveGroup` remains the only status writer in the app.
- Creating a group is a two-step flow (create with name/city/slug, then complete
  the profile) instead of one long federal form.
- A member holding only `local_board` loses the ability to edit name, city and
  location, which the old `/gruppe/[slug]/profile` allowed.
- `updateGroup` and `upsertGroupBySlug` now treat an omitted `imageKey` as
  "leave as stored" and an explicit `null` as "clear", mirroring `location`, so
  a seed re-run cannot wipe a lead's banner.
- Replacing a banner leaves the previous object in `content-media`. Same as
  every other media surface today; a sweeper is out of scope.
- Migration `groups/0005_image_key.sql` adds a nullable `image_key` column.
- `instagramUrl` / `websiteUrl` are now scheme-checked (`HttpUrlInput`). Moving
  these fields onto the lead's form made this action their only writer, and
  `z.string().url()` alone accepts `javascript:` — which React 18 renders as a
  live `<a href>` on the public page. Migration
  `groups/0006_link_scheme_guard.sql` clears any stored non-`http(s)` value and
  adds a CHECK as a structural backstop.
- Revalidation of the statically renderable `/gruppen` list moved out of the
  deleted admin actions into `group-actions.ts` (create/archive) and
  `group-profile-actions.ts` (edit); without it a renamed or archived group
  stays stale there until the next deploy.
