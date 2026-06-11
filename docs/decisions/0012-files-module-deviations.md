# 0012 — Files module: deviations from spec §11

- Status: Accepted
- Date: 2026-06-11
- Supersedes: —

## Context

Implementing the `files` module (spec §11) surfaced points where the §11 sketch
could not be followed literally, plus deliberate scope choices. Per CLAUDE.md §4,
decisions are recorded here rather than in chat. Design:
`docs/superpowers/specs/2026-06-11-files-module-design.md`.

## Decisions

1. **Backend + storage engine only.** All UI (member-facing and the access-log
   admin tables) is deferred to the Phase 3 dashboard. Keeps this a one-module
   PR; the build plan's "folders go live" is met at the data/engine layer.
2. **Two-phase upload replaces `uploadFile(folderId, file, …)`.** The §11 rule
   "the app never proxies file bytes" makes the original signature impossible.
   `requestUpload` + `confirmUpload` gate on declared size then verify the real
   object size. Adds a `files.status ('pending'|'ready')` column.
3. **Idempotent boot provisioning** (`ensureFolders`) + a `groups.group.created`
   subscriber; existing groups are backfilled via `groups.listGroups()`.
   Self-healing on the next boot.
4. **Supabase driver in `core/storage/src/supabase.ts`**, injected at `apps/web`
   composition (mirrors the Resend driver). `core/storage` gains a `statObject`
   method on `StorageClient` (needed by `confirmUpload`).
5. **`members` exports `isFederalBoard` + `canManageGroup`** — a deliberate
   second-module touch so files reuses role semantics instead of duplicating
   them (cf. ADR 0011 on driver duplication).
6. **Size cap / quota as code constants** (25 MB / 5 GB). The §11 "configurable
   per scope by federal board" is a Phase 3 dashboard action; override columns
   are YAGNI now.
7. **`file_access_log.action` = download|upload|delete.** The §11 `'view'` action
   has no meaning in a signed-URL backend; added in Phase 3 if a preview surface
   needs it. `file_id` is `ON DELETE SET NULL` so deletion preserves the trail.
8. **No `replaceFile`.** The §11 public-interface list omits it; `deleteFile` +
   `requestUpload` compose to a replace.
9. **`groups.group.archived` is a no-op** for folders; documents persist across a
   group's lifecycle (matches the handover principle).
10. **Full-text search deferred and unscheduled.** Not in the build plan; a future
    milestone whose cost is a content-extraction/OCR pipeline + a new async worker
    tier, not the search itself. Nothing here forecloses it.

## Consequences

- The §11 interface text is superseded by the reshaped surface above; this ADR is
  the record.
- Deleting a file nulls `file_id` on its audit rows (actor/action/time survive);
  acceptable for v1, revisit if Phase 3 needs per-file delete history.
