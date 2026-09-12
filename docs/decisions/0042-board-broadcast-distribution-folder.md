# ADR 0042 — Bundesvorstand keeps OneDrive; the platform gets a one-way distribution folder instead

**Status:** Accepted
**Date:** 2026-09-12

## Context

`/gruppen/[slug]` shows each group's own `group_members`/`local_board` folders
plus the federation-wide `members_all` singleton (ADR-less, shipped
2026-09-09, commit 664b8ac). The `federal_board` singleton — the Bundesvorstand's
own file folder — was deliberately left out of that page pending a decision on
who should see it there (tracked as an open item, not decided at the time).

## Decision

- **The `federal_board` folder does not need to appear on group pages.** The
  Bundesvorstand already stores its own working documents in Microsoft
  OneDrive; there is no unmet need to surface that folder inside the platform.
- **Instead, the federal board gets a one-way distribution folder** —
  `board_broadcast`, a fourth federation-wide singleton alongside
  `members_all`/`federal_board` (`groupId: null`). It appears as its own root
  on every group's page, next to that group's own `local_board` folder.
- **Only the federal board may write to it.** Every group's Lead
  (`local_board_lead`) — and federal — may read it, regardless of which group
  they lead. No local board, Lead, or `file_manager` may add, rename, or
  delete anything in it; it is a push channel, not a shared drop box.

## Consequences

- `modules/files` gains a fifth `FolderScope` value; see `modules/files/README.md`
  for the updated scope table. `ensureFolders()` self-provisions the singleton
  at boot, same as the two existing ones — no manual prod seeding step.
- The board's own `/gruppe/[slug]/files` management page is unchanged: like
  `members_all`, `board_broadcast` is not manageable there — it is
  federally-owned content, only ever created/edited from `/federal/files`.
- The old "should `federal_board` show on group pages" question is closed by
  this ADR — it does not need to be revisited.
