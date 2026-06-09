What I built

modules/groups (the module owns this):

- archived added to GroupStatus; new GroupArchived event (groups.group.archived) — both were in the spec's public interface but
  missing.
- services/manage.ts: createGroup (rejects duplicate slug → ConflictError), updateGroup (by id, slug immutable), archiveGroup (by id).
  Auth-agnostic — gated at the app layer like members, so groups stays decoupled (CLAUDE.md §1 rule 2).
- migrations/0002_status_check.sql: DB CHECK constraint on status — closes the free-text weakness you flagged. No manifest edit
  needed.
- 7 new integration tests against real Postgres (create+event, duplicate-slug conflict, update by id, NOT_FOUND,
  archive+event+excluded-from-active, the CHECK rejects bad status).

apps/web (mirrors the /admin/pending-members stopgap):

- /admin/gruppen (list), /admin/gruppen/neu (create), /admin/gruppen/[slug]/bearbeiten (edit + archive). federal_board-gated, German
  copy, design-system primitives only.
- /gruppen/[slug] now notFound()s an archived group.

Verification

┌───────────────────┬───────────────────────────────────────────┐
│ Gate │ Result │
├───────────────────┼───────────────────────────────────────────┤
│ pnpm typecheck │ ✅ whole monorepo │
├───────────────────┼───────────────────────────────────────────┤
│ pnpm test │ ✅ 67/67 (groups 11/11, against Postgres) │
├───────────────────┼───────────────────────────────────────────┤
│ pnpm format:check │ ✅ my files clean │
├───────────────────┼───────────────────────────────────────────┤
│ pnpm lint │ ⚠️ see below │
└───────────────────┴───────────────────────────────────────────┘

Two pre-existing issues, NOT from this work, that will still fail branch CI:

1. apps/web/app/abmelden/route.ts:3 — unused COOKIE_MAX_AGE_SECONDS import (lint error). This file was already modified (uncommitted)
   before this session — it's from the SSO-logout work. One-line fix but it's your in-progress file, so I didn't touch it.
2. .claude/settings.local.json — prettier flags it; it's local harness settings, unrelated to the app.

Want me to remove that unused import in abmelden/route.ts so the branch goes green, or leave it to you?

How to test it yourself

Postgres is up (docker-compose). Then:

2. Migrate + seed: pnpm db:migrate then the groups seed CLI (or create via the UI).
3. pnpm --filter @bdas/web dev, then register/verify/login at /anmelden with that email.
4. Go to /admin/gruppen → create a group → confirm it appears at /gruppen and /gruppen/[slug] → edit it → archive it → confirm it
   vanishes from /gruppen and the public detail URL 404s.

Tell me what you see and I'll fix anything that's off. After this lands, the next item is the local-board-edit-own-group §23 row
(needs the per-group role-scoping design we deferred).

    Recommendation: test on local Docker now (~2 min, disposable, zero risk), then /review + /security-review, then it reaches prod

through the normal commit → push → flagged-rollout path. The deployed site is the last step, not a shortcut around local.
