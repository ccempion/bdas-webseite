# @bdas/content

Board-editable content pages stored as Puck JSON documents
(spec: `docs/superpowers/specs/2026-07-14-content-pages-design.md`, ADR 0023).

## Owned tables

| Table           | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `content_pages` | One row per editable page: slug → Puck JSON document |

## Public surface

- `getPage(db, slug)` — read a page (public; no auth).
- `savePage(db, { slug, data, actor })` — upsert a page. Throws `ForbiddenError`
  unless the actor's grants include `federal_board`; validates the Puck `Data`
  shape (zod) and caps the document at 512 KB.
- `PuckDataSchema`, types `ContentPage`, `PageData`, `ContentActor`, `ActorGrant`.
- Event `content.page.saved` via `core/events`.

The module never imports Puck — it stores documents opaquely. The Puck editor,
block palette, and rendering live in `apps/web` (`app/_content/`).

## Tests

Integration tests against Docker Postgres: `docker compose up -d`, then
`pnpm --filter @bdas/content test`. Tests skip when the DB is unreachable.
