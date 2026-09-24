# @bdas/files

Role-scoped file repository (spec §11). Owns `folders`, `files`,
`file_access_log`, `folder_member_grants`. Backend only — UI lives in the Phase 3 dashboard.

## Scopes

| Scope               | Cardinality | Read                                | Write              |
| ------------------- | ----------- | ----------------------------------- | ------------------ |
| `members_all`       | 1           | BDAS members + federal board        | federal board      |
| `group_members:[g]` | 1 per group | active members of g                 | g's local board    |
| `local_board:[g]`   | 1 per group | g's local board + federal           | g's local board    |
| `federal_board`     | 1           | federal board                       | federal board      |
| `board_broadcast`   | 1           | every group's local board + federal | federal board only |

`board_broadcast` is the federal board's central distribution folder to every
local Vorstand — shown as its own root on every group's page (alongside
`local_board`), read-only for local boards. Only the federal board may add or
remove documents in it; no local board, Lead, or file_manager may write here.

The five scopes above are **root** folders, system-provisioned by `ensureFolders`
at boot and by the `groups.group.created` subscriber. Roots cannot be renamed or
deleted. Per-group folders exist only for a Hochschulgruppe: a `netzwerk` or
`affiliate` group has neither a board nor members (ADR 0045).

Inside a root, anyone who manages it (`canManage` — the scope rule: the group's
board, its Datei-Manager for the members folder, or federal board) may create subfolders up to `MAX_FOLDER_DEPTH` (5) levels deep.
A subfolder permanently **inherits** its parent's `scope` and `group_id`; there is
no per-folder permission setting, and a database trigger
(`folders_inherit_trg`) rejects any row that diverges. Deletion is refused while a
folder still contains files or subfolders.

## Per-person grants

`folder_member_grants` opens one folder to one person on top of the scope rule
(Spec 2026-09-16 §5.3) — the path for BDAJ officials who work with single
groups without being members. A grant covers the folder and all its
subfolders, read-only unless `can_write`. A write grant lets the grantee upload
and delete **their own** files — nothing more (ADR 0047): creating, renaming or
deleting folders and deleting other people's files stay with the scope rule
(`canManage`). It never takes away what the scope already allows. Accept first,
then grant: only an `active` account can receive a grant, and a grant has no
effect while the account is not active. Only the federal board may
`grantFolderAccess`, `revokeFolderAccess`, `listFolderAccess`,
`listAllFolderGrants` and `listFolderTree` (every folder regardless of read
access — the federal board grants folders it cannot open); revoked rows stay as a
record. Every file and folder service loads the caller's grants itself; pages ask
`getFolderRights` (`canUpload`, `canManage`) and `mayDeleteFile` per file. The app's
grant page is `/federal/files/freigaben`.

## Uploads are two-phase (the app never proxies bytes)

1. `requestUpload(folderId, {filename, mimeType, sizeBytes}, byMember)` →
   permission + MIME + 25 MB cap + 5 GB quota check on the declared size;
   inserts a `pending` row; returns a signed PUT URL.
2. Client PUTs bytes direct to Supabase Storage.
3. `confirmUpload(fileId, byMember)` → re-checks the real object size via the
   storage driver, promotes the row to `ready`, logs the upload. On mismatch the
   object + row are removed.

`sweepStalePendingUploads(olderThan)` clears abandoned pending rows (unwired;
Phase 3 cron).

## Public surface

`listFolders`, `getFolder`, `createFolder`, `renameFolder`, `deleteFolder`,
`listFiles`, `getDownloadUrl`, `requestUpload`, `confirmUpload`, `deleteFile`,
`sweepStalePendingUploads`, `ensureFolders`, `registerFilesSubscribers`,
`grantFolderAccess`, `revokeFolderAccess`, `listFolderAccess`,
`listAllFolderGrants`, `listFolderTree`, `getFolderRights`, the pure
predicates `canReadFolder` and `mayDeleteFile`, `deleteFilesByMember`,
`exportForUser`, `type FileExportRow`, `getMemberIdResolver`,
`setMemberIdResolver`, and `type MemberIdResolver`. Every service enforces
permission internally.

## Dependencies

`core/storage` (object I/O), `core/events` (group provisioning), `@bdas/members`
(role primitives), `@bdas/groups` (group list/lookup). No cross-module table
reads.

This module reads neither `members` nor `auth_users` directly (rule 1) — the
GDPR functions below translate a caller-supplied `userId` to this module's
own `member_id` via the composed `MemberIdResolver`, wired in `apps/web` from
`members.getMemberByUserId` at boot, the same pattern `@bdas/notifications`
uses for its own `MemberIdResolver`/`RecipientResolver`.

`file_access_log.member_id` is `ON DELETE SET NULL` (was `CASCADE`,
`migrations/0006_access_log_retention.sql`), so the 90-day access-log
retention (spec §2 decision 2) survives a member's account deletion instead
of being erased along with them.

## GDPR self-service (Art. 15/17)

`exportForUser(db, userId)` and `deleteFilesByMember(db, userId)` are this
module's contribution to the account-deletion feature
(`docs/superpowers/specs/2026-09-22-account-deletion-design.md`). Both
resolve `userId` via the `MemberIdResolver` and return/act on nothing when
the member can't be resolved. `deleteFilesByMember` deletes the Storage
object and row for every file the member uploaded, then removes folders they
created that the deletion leaves empty — a folder with foreign content left
inside (anywhere in its descendant chain) is never touched. It fails loud: a
genuine Storage error (auth, timeout, 5xx) keeps that file's row and is
collected into a single `Error` thrown after the rest of the run completes,
so the orchestrator sees a rejected promise and a retry only re-attempts
what actually failed. Idempotent, same contract as
`notifications.deleteLogForMember`. Each folder is removed under a `FOR UPDATE`
lock on its row before the emptiness check, so a file another member is
uploading at that moment is never cascaded away. `deleteFolder` still has the
unlocked form of that race (separate follow-up, ADR 0055).

## Tests

`pnpm --filter @bdas/files test`. Pure permission/constant tests always run;
integration tests need Docker Postgres (`pnpm db:up`).
