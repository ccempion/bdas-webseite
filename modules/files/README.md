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

Inside a root, anyone with write permission on it (`canWrite` — the group's board
or federal board) may create subfolders up to `MAX_FOLDER_DEPTH` (5) levels deep.
A subfolder permanently **inherits** its parent's `scope` and `group_id`; there is
no per-folder permission setting, and a database trigger
(`folders_inherit_trg`) rejects any row that diverges. Deletion is refused while a
folder still contains files or subfolders.

## Per-person grants

`folder_member_grants` opens one folder to one person on top of the scope rule
(Spec 2026-09-16 §5.3) — the path for BDAJ officials who work with single
groups without being members. A grant covers the folder and all its
subfolders, read-only unless `can_write`. A write grant opens the folder's
contents, not the folder itself: renaming or deleting a folder needs write
access to its parent, so the grantee cannot rename or delete the shared folder. It never takes away what the scope
already allows. Accept first, then grant: only an `active` account can receive
a grant, and a grant has no effect while the account is not active. Only the federal board may `grantFolderAccess`,
`revokeFolderAccess` or `listFolderAccess`; revoked rows stay as a record.
Every file and folder service loads the caller's grants itself. The public
`canReadFolder`/`canWriteFolder` accept them as an optional third argument, but
the app does not pass them yet — there is no UI for grants until the BDAJ PR.

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
`grantFolderAccess`, `revokeFolderAccess`, `listFolderAccess`. Every
method enforces permission internally.

## Dependencies

`core/storage` (object I/O), `core/events` (group provisioning), `@bdas/members`
(role primitives), `@bdas/groups` (group list/lookup). No cross-module table
reads.

## Tests

`pnpm --filter @bdas/files test`. Pure permission/constant tests always run;
integration tests need Docker Postgres (`pnpm db:up`).
