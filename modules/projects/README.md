# `@bdas/projects`

Showcase local initiatives so other groups can discover and reuse them
(spec §12). A project is owned by one Hochschulgruppe; any authenticated
member can browse projects across all groups at `/projekte`.

## Owned tables

| Table      | Purpose                                                   |
| ---------- | --------------------------------------------------------- |
| `projects` | Title, description, status, topic, contact, artifact refs |

`project_updates` (the changelog feature) is deliberately omitted this
PR — it lands as a separate follow-up. No other module reads or writes
`projects` (CLAUDE.md §1 rule 1).

## Public surface

```ts
import {
  createProject,
  updateProject,
  adoptProject,
  getProject,
  listProjects,
  ProjectInput,
  CreateProjectInput,
  type Project,
  type ProjectSummary,
  type ProjectStatus,
  type ProjectsEvent,
} from "@bdas/projects";
```

## Capabilities (this PR)

- **Create / edit.** A group's local board posts a project (title,
  description, `status`, `topic`, `contact`, optional artifact file
  references). The owning group is immutable after creation.
- **Browse.** `listProjects(db, { groupId?, topic? })` — cross-group
  discovery, newest first, filterable by owning group and topic.
- **Get one.** `getProject(db, id)` → the project enriched with its
  owning group's name/slug.
- **Adopt this project.** `adoptProject(db, sourceId, targetGroupId,
adoptedBy)` forks a copy scoped to the adopting group. The copy keeps
  title/description/topic/contact, resets `status` to the default, starts
  with no artifacts (the originals live in the source group's
  `local_board` folder), and records `adoptedFromProjectId` for
  provenance.

`status` is one of `planned` | `active` | `completed` | `archived`
(default `active`), enforced by a DB CHECK.

## Authorization

Services are **auth-agnostic** (same convention as `events`/`groups`):
they take no grants and never check permissions. The app action layer
gates before calling, via `@bdas/members`:

| Operation     | Gate                                            |
| ------------- | ----------------------------------------------- |
| create / edit | `canManageGroup(grants, project.groupId)`       |
| adopt         | `canManageGroup(grants, targetGroupId)`         |
| list / get    | any authenticated member (no group restriction) |

## Dependencies

- `core/events` — emits `projects.project.{created,updated,adopted}`
  (no consumer yet).
- `@bdas/groups` — group existence is validated on create/adopt and
  name/slug are resolved for display, **only** through the public
  interface (`getGroup`, `listGroups`); never a direct table read.
- `@bdas/files` — artifacts are **references** (file ids) to objects
  already stored via the files module. This module stores no bytes and
  no file metadata; the app resolves ids to URLs with
  `getDownloadUrl` at render time (permissions enforced there).

## Routes (in `apps/web`)

| Path        | Behavior                                                  |
| ----------- | --------------------------------------------------------- |
| `/projekte` | Cross-group browse. 404 unless `BDAS_FLAG_PROJECTS=true`. |

The route pages are a follow-up PR; they call `requireProjectsFlag()`
(`apps/web/app/_projects/flag.ts`). The flag defaults OFF.

## Tests

`pnpm --filter @bdas/projects test`. Integration tests apply the real
`groups` + `projects` migrations into a throwaway schema (no DB mocks,
CLAUDE.md §3); they skip when `DATABASE_URL` is unreachable. CI brings up
a Postgres service (`pnpm db:up`).
