# Files Module — Consumer Experience & Operational Glue

**Date:** 2026-06-25
**Status:** Approved design, pending implementation plan
**Module:** `@bdas/files` (spec §11)

## Summary

The files module's backend service layer is complete and clean: it owns
`folders`, `files`, `file_access_log`; enforces every permission server-side;
and exposes a two-step upload, download, list, and delete surface. What is
missing is everything a user can see or touch, plus the operational pieces that
make it safe to serve real documents:

1. A **member-facing** read/download area (rank-and-file members currently have
   no way to reach files they are entitled to).
2. A **board-facing** management experience (upload, delete) — today only a
   read-only folder list exists.
3. **Operational glue**: Row-Level Security lockdown, a scheduled cleanup job,
   and a hermetic storage driver so integration tests can run in Continuous
   Integration without a real cloud bucket.

Folders remain **system-provisioned and not user-creatable** (spec §11). User
folder creation/deletion was considered and explicitly dropped from this round.

## Audience & navigation

Both **members and boards** get a file experience this round.

Navigation model: **folder index → drill-in.** A folder-index page lists the
folders a member may read; clicking a folder opens a dedicated file-list page
with its own web address. One shared file-list component serves both audiences;
boards layer write affordances on top. This scales to the federal board's many
folders and gives every folder a deep-linkable web address.

## Architecture & routes

**Feature flag.** Add `app/_files/flag.ts` exporting `requireFilesFlag()`
(mirrors `requireEventsFlag`). Every file route — member and board — calls it.
Go-live is `BDAS_FLAG_FILES=true` in production. (Board file pages today ride
only the dashboard flag; they will also gate on the files flag so the whole
surface flips atomically.)

| Surface | Route | Purpose |
|---|---|---|
| Member | `/dateien` | Folder index — all readable folders (`members_all` + the member's group) via `listFolders` |
| Member | `/dateien/[folderId]` | File list, read/download only |
| Board | `(board)/federal/files` *(exists)* | Folder index (federal: all folders) |
| Board | `(board)/federal/files/[folderId]` | File list + upload/delete |
| Board | `(board)/gruppe/[slug]/files` *(exists)* | Folder index (that group's folders) |
| Board | `(board)/gruppe/[slug]/files/[folderId]` | File list + upload/delete |

**Session & permission.** Member pages load the member with
`getCurrentMember(db, readSessionCookie())`; board pages keep `loadCurrentMember`
plus the existing scope guards. Both pass the resulting `CurrentMember` straight
into the service. No new permission logic lives in the app layer — the service
methods gate internally, so forging a `folderId` in the web address yields a
`ForbiddenError`.

**Writes via server actions.** A new `app/_files/file-actions.ts` wraps
`requestUpload`, `confirmUpload`, `getDownloadUrl`, and `deleteFile`. Clients
never call the service directly.

## Module-surface additions

Two small additions, keeping all permission and table logic inside the module
(rule 1 — one module owns its tables and their rules):

- `canWriteFolder(folder, member): boolean` — a pure predicate (no database
  access) so the UI can render write affordances truthfully. Example: the
  federal board may *read* a group's `local_board` folder but not write it, so
  it must not see upload/delete controls there. Read-only routes do not need it.
- `folderFileCounts(db, folderIds, forMember): Record<id, number>` — a single
  grouped query (no N+1) powering the file counts shown on the folder index.

## Shared components

Home: `app/_files/` — co-located with `flag.ts` and `file-actions.ts`. Both the
member surface and the board surface import from here, so neither route group
reaches into the other's `_components`.

- **`FolderIndex`** (server-rendered) — rows with name, scope label, group, file
  count, and a `›` link to the file-list page. Replaces the current read-only
  `FoldersTable`.
- **`FileList`** (presentational) — rows with a file-type icon, filename, size,
  uploaded date, and a download action. Takes a `canWrite` prop; when true it
  also renders per-row delete and the upload dropzone. Member pages pass
  `canWrite={false}`.
- **`FileUploader`** (client) — the drag-and-drop dropzone and upload manager.
- **`DeleteFileButton`** (client) — confirm dialog, then the delete action.

File-type icons map the file's Multipurpose Internet Mail Extensions (MIME) type
— the standard label for what kind of file it is (PDF, image, document,
spreadsheet, generic). No in-app previews beyond icons (spec §11).

## Data flows

**Download** (the app never proxies file bytes):

1. Click → client calls `getDownloadUrlAction(fileId)`.
2. Action → `getDownloadUrl(db, fileId, me)` logs a `download` entry and returns
   a signed (time-limited, authorized) web address.
3. Client opens it; the browser fetches the bytes directly from Supabase
   Storage.

**Upload** (multi-file drag-and-drop — the most stateful piece):

1. User drops N files. Per file, the client calls
   `requestUploadAction(folderId, {filename, mimeType, sizeBytes})` →
   `{fileId, uploadUrl}`, or a `ValidationError` whose German message is shown
   on that file's row.
2. Client uploads the bytes directly to `uploadUrl` (using XMLHttpRequest so it
   can show progress).
3. On success → `confirmUploadAction(fileId)` → the server re-checks the real
   object size, promotes the row to `ready`, and logs an `upload` entry.
4. Each file's row shows: queued → uploading (%) → done / failed. Uploads run
   with bounded concurrency (3 at a time). When all settle, the list refreshes.

**Delete:** confirm dialog → `deleteFileAction(fileId)` → `deleteFile` (logs a
`delete` entry, removes the storage object, then the row) → refresh.

**Empty/error states:** empty-folder and empty-index messages; service
validation errors (wrong type, over the 25 MB file cap, over the 5 GB folder
quota) surfaced inline from the service's existing German messages.

## Operational glue

### A. Row-Level Security lockdown

Row-Level Security (RLS) is a PostgreSQL feature that decides, per table row, who
may read or write it. It is currently **off** on `folders`, `files`, and
`file_access_log`. The app does not depend on it — it connects with a privileged
service-role database key and enforces every permission in code — but leaving it
off is the documented security gate that must close before real documents are
stored.

Plan: a migration namespaced under `modules/files/migrations/` that turns
Row-Level Security **on** for all three tables and adds a **deny-all** policy for
the anonymous and logged-in-user key types, while the service-role key (which the
app uses, and which bypasses these policies) keeps full access. Net effect: the
tables are unreachable except through the app's enforced path — defense in depth
with effectively zero behavior change.

### B. Scheduled cleanup job (Vercel Cron)

The upload flow inserts a `pending` row before the bytes arrive; if a user
abandons an upload, that row is orphaned. The module already has
`sweepStalePendingUploads(olderThan)`; it needs a scheduled caller.

Vercel Cron is a hosting feature that fires scheduled web requests. Plan: a route
handler at `app/api/cron/files-sweep/route.ts` that verifies a shared secret
header (so only Vercel can trigger it), then calls `sweepStalePendingUploads`
for rows older than ~24 hours. Registered in `vercel.json` to run once daily.

### C. In-memory storage driver + integration tests

Continuous Integration (CI) is the automated test run that fires on every change
(GitHub Actions). The integration tests need object storage (where file bytes
live) to exercise the two-step upload, but should not talk to a real cloud bucket
(slow, flaky, requires secrets).

Plan: an **in-memory storage driver** implementing the same `core/storage`
interface as the real Supabase driver — it stores bytes in a map, reports their
true size (so `confirmUpload`'s size re-check is genuinely tested), and returns
fake signed web addresses. Tests wire it in and run against **real Docker
PostgreSQL** (the database is never mocked, per the working agreement).

## Pull request breakdown

1. **PR 1 — Foundation (backend only).** Row-Level Security lockdown migration;
   `canWriteFolder` and `folderFileCounts`; the in-memory storage driver; the
   integration-test suite; and the Vercel scheduled cleanup job. Gets a
   `/security-review`. Feature flag stays off.
2. **PR 2 — Read experience.** Folder-index and file-list pages with download,
   for members and boards (read/download only), built on the new shared
   components and the download server action. Flag still off in production.
3. **PR 3 — Write experience.** Multi-file drag-and-drop upload (request/confirm)
   and delete-with-confirm, for boards on folders they can write. Gets a
   `/security-review`.
4. **Go-live.** After PR 3 is verified, set `BDAS_FLAG_FILES=true` in production
   — a config change, not new code.

## Testing

- **Integration** (real Docker PostgreSQL + in-memory storage): the full path —
  request → "PUT" bytes → confirm → list → download-URL → delete; plus
  rejections (wrong file type, over 25 MB, over the 5 GB quota, no permission),
  the orphan-sweep, and a smoke check that the service-role path still works
  after Row-Level Security is locked down.
- **Unit**: the `canWriteFolder` predicate, the file-type→icon map, and the
  client upload-manager's state transitions.
- **End-to-end** (existing Playwright browser tests): one light smoke — a member
  opens a folder and downloads; a board uploads a file.

## Out of scope this round

- Folder creation/deletion (considered and dropped — folders stay
  system-provisioned).
- The access-log viewing UI (deferred to its own slice; backend already logs
  every action).
- File **replace** — spec §11 lists it as a capability, but the backend has no
  `replaceFile` method, so it is not buildable now; replacing means delete +
  re-upload. Flagged as a gap rather than silently scoped in.
- Spec's stated v1 exclusions: versioning, full-text search, public share links,
  in-app previews beyond type icons, comments on files, nested folders.
- Per-folder custom permissions.

## Suggested Architecture Decision Record

One short, dated decision note in `docs/decisions/` capturing the Row-Level
Security deny-all posture and the in-memory-storage-for-tests choice, since both
are notable and the working agreement keeps decisions in Architecture Decision
Records rather than chat or commit messages.
