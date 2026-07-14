# `@bdas/groups`

Hochschulgruppen — the public face of the federation. Each group has a
slug-based URL (`/gruppen/aachen`) and a small profile.

## Owned tables

| Table    | Purpose                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| `groups` | Slug, display name, city, contacts, status, optional map location (name/address editor-only; lat/lng public) |

`join_fee_*` columns deliberately omitted (Phase 6 per spec). The
join-policy service returns `{ required: false }` for every group until
the payments module ships.

## Public surface

```ts
import {
  listGroups,
  getGroupBySlug,
  getGroup,
  getJoinPolicy,
  upsertGroupBySlug,
  type Group,
  type GroupSummary,
  type GroupEvent,
} from "@bdas/groups";
```

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

| Path              | Behavior                                         |
| ----------------- | ------------------------------------------------ |
| `/gruppen`        | Public list. 404 unless `BDAS_FLAG_GROUPS=true`. |
| `/gruppen/[slug]` | Public profile. 404 unless flag on.              |

The list shows active groups by default. Dormant groups are hidden from
the public list but reachable by direct URL (per spec §17 — alumni links
should not 404).
