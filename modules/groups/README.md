# `@bdas/groups`

Hochschulgruppen — the public face of the federation. Each group has a
slug-based URL (`/gruppen/aachen`) and a small profile.

## Owned tables

| Table    | Purpose                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groups` | Slug, display name, city, contacts, status, optional map location (name/address editor-only; lat/lng public), optional `image_key` banner reference (ADR 0032) |

`join_fee_*` columns deliberately omitted (Phase 6 per spec). The
join-policy service returns `{ required: false }` for every group until
the payments module ships.

## Public surface

```ts
import {
  listGroups,
  getGroupBySlug,
  getGroup,
  getGroupKind,
  getJoinPolicy,
  upsertGroupBySlug,
  type Group,
  type GroupSummary,
  type GroupKind,
  type GroupEvent,
} from "@bdas/groups";
```

## Art einer Gruppe (`kind`)

Every group has a kind (migration `0007_group_kind.sql`, spec
`docs/superpowers/specs/2026-09-12-nutzertypen-fundament-design.md` §3):

| `kind`            | Meaning                                                                     | `city`       |
| ----------------- | --------------------------------------------------------------------------- | ------------ |
| `hochschulgruppe` | A university group — the default, and every existing row                    | required     |
| `affiliate`       | A partner organisation (BDAJ and others): a home for accounts without scope | must be NULL |
| `netzwerk`        | Förderer and network contacts; joining is decided by the federal board      | must be NULL |

`groups_kind_city_check` enforces the `city` column both ways — there is no
Hochschulgruppe without a city. `netzwerk` is the home for Förderer accounts;
it has no board, so the federal board decides who joins (ADR 0046).

`createGroup` (the board form) still only ever creates a `hochschulgruppe`;
`upsertGroupBySlug` now takes `kind` and the seed uses it for the `netzwerk`
row, but creating an `affiliate` row is still the job of the spec that
introduces the concrete account type. `getGroupKind` is the one accessor meant for other
modules. Note for the BDAJ implementation: the flag that spec calls
`isAffiliate` is `hasGroupScope` here, and it lives on `CurrentMember`
(`@bdas/members`), not in this module.

## Adding a group ("peu à peu" workflow)

The federation adds groups one at a time as data arrives. The seed file
`infra/seeds/groups.json` is the source of truth — edit it, then run:

```bash
pnpm groups:seed
```

The CLI upserts each entry by slug. Re-running is idempotent — only changed
fields are written, no duplicates. The JSON lives in version control so
adding a group is a regular pull-request flow.

Required JSON fields per entry: `slug`, `name`, `city`. Everything else
(`university`, `description`, `contactEmail`, `instagramUrl`, `websiteUrl`,
`status`) is optional. `status` defaults to `active`.

## Routes (in `apps/web`)

| Path                         | Behavior                                                                                                                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/gruppen`                   | Public list. 404 unless `BDAS_FLAG_GROUPS=true`.                                                                                                                                                                                                                                   |
| `/gruppen/[slug]`            | Public profile. 404 unless flag on. Renders the fixed header/contact card, then the group's Puck-authored content (`@bdas/content`, when the `content` flag is on), then a "Kommende Events" section (when `events` is on). Shows a "Seite bearbeiten" link to authorized viewers. |
| `/gruppen/[slug]/bearbeiten` | Editor. 404 unless `groups` and `content` flags are on, the group exists/is not archived, and the viewer passes `canEditGroupPage` (lead, `page_editor`, or federal board) — 404, not 403, to avoid an existence leak (ADR 0026).                                                  |

The list shows active groups by default. Dormant groups are hidden from
the public list but reachable by direct URL (per spec §17 — alumni links
should not 404).
