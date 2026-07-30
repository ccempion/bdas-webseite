# @bdas/files

Role-scoped file repository (spec §11). Owns `folders`, `files`,
`file_access_log`. Backend only — UI lives in the Phase 3 dashboard.

## Scopes

| Scope               | Cardinality | Read                      | Write           |
| ------------------- | ----------- | ------------------------- | --------------- |
| `members_all`       | 1           | every active member       | federal board   |
| `group_members:[g]` | 1 per group | active members of g       | g's local board |
| `local_board:[g]`   | 1 per group | g's local board + federal | g's local board |
| `federal_board`     | 1           | federal board             | federal board   |

The four scopes above are **root** folders, system-provisioned by `ensureFolders`
at boot and by the `groups.group.created` subscriber. Roots cannot be renamed or
deleted.

Inside a root, anyone with write permission on it (`canWrite` — the group's board
or federal board) may create subfolders up to `MAX_FOLDER_DEPTH` (5) levels deep.
A subfolder permanently **inherits** its parent's `scope` and `group_id`; there is
no per-folder permission setting, and a database trigger
(`folders_inherit_trg`) rejects any row that diverges. Deletion is refused while a
folder still contains files or subfolders.

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
`sweepStalePendingUploads`, `ensureFolders`, `registerFilesSubscribers`. Every
method enforces permission internally.

## Dependencies

`core/storage` (object I/O), `core/events` (group provisioning), `@bdas/members`
(role primitives), `@bdas/groups` (group list/lookup). No cross-module table
reads.

## Tests

`pnpm --filter @bdas/files test`. Pure permission/constant tests always run;
integration tests need Docker Postgres (`pnpm db:up`).
