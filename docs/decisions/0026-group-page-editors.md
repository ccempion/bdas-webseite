# ADR 0026 — Group pages: page_editor role and scoped content saves

- **Status:** Accepted
- **Date:** 2026-07-18
- **Extends:** ADR 0013 (lead delegation), ADR 0023 (Puck content pages)

> Numbering note: the design brief for this work (issue #48) drafted this
> decision as "ADR 0025". That number was taken in the meantime by the
> unrelated Puck-palette-expansion ADR merged from `main`. This document is
> the same decision, filed as **0026**; in-code comments written during
> implementation (migration `members/0007_page_editor.sql`,
> `modules/members/src/roles.ts` and `services/roles.ts`,
> `modules/content/src/types.ts` and `index.test.ts`,
> `apps/web/lib/content-scope.ts`, `apps/web/app/_content/content-slug-context.ts`)
> still say "ADR 0025" and should be relabelled to 0026 in a follow-up —
> out of scope here (docs-only task).

## Context

Local groups need to author their own public page (`/gruppen/[slug]`) without a
developer round-trip. The content module's save-authorization was federal-only;
the grant system already lets a `local_board_lead` delegate group-scoped roles
(`local_board`, `event_organizer` — ADR 0013).

## Decision

- New group-scoped role `page_editor`, grantable/revocable by federal board or
  the group's own `local_board_lead` (same delegation branch as
  `event_organizer`). Plain `local_board` does not edit — the lead delegates
  explicitly. Editing authority = `federal_board` ∨ (`local_board_lead` ∨
  `page_editor` scoped to the group) — `canEditGroupPage` in `@bdas/members`.
- `savePage` gains an optional `scope: { groupId }`. The route layer resolves
  `gruppen/<slug>` → group and passes the id; the content module checks the
  actor's grants against it and stays groups-agnostic. Unscoped saves remain
  federal-only. The `content-media` upload route authorizes the same way via
  the request's content slug.
- The page keeps a fixed server-rendered header (BDAS name + city) and contact
  card; only the section between them and the events list is Puck-authored.
  The group's name is therefore structurally not editable.

## Consequences

- A new editable page type costs one route pair + a `groupNav` entry; the
  content schema is unchanged (slug-keyed).
- Migration `members/0007_page_editor.sql` widens the role CHECK domain.
- The events section is live data (`listUpcomingEvents`), not authored content
  — groups cannot fabricate events on their page.
