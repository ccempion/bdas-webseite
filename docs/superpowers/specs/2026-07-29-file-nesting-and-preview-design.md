# Dateien: Ordner-Verschachtelung und Inline-Vorschau

**Date:** 2026-07-29
**Module:** `@bdas/files`, `apps/web/app/_files`, `apps/web/app/dateien`
**Status:** Design approved, awaiting implementation plan

## Problem

`modules/files` ships a flat, system-provisioned folder set: two singletons plus
two folders per group, created by `ensureFolders` and the `groups.group.created`
subscriber. Boards cannot organise their documents — every protocol, form and
photo lands in one undifferentiated list. Members cannot preview anything; every
file is a download.

## Rejected: adopting a third-party file manager

Evaluated before designing. Two shapes exist and neither improves this codebase:

**Full applications** (Nextcloud, Seafile, Filestash, Pydio) each bring their own
server, database and ACL system. Adopting one requires a synchronisation layer
mapping BDAS role grants onto foreign ACLs, producing two sources of truth about
who holds a Vorstand seat. This violates modular rule 1 (a module owns its
tables) and rule 2 (depend on interfaces, not implementations).

**UI component libraries** (Uppy, cubone `react-file-manager`, shadcn file-tree
primitives) are libraries rather than structure. They would replace a working UI
and still require restyling to the design tokens. No permission behaviour comes
with them.

The bespoke part of this system — "Vorstand of *this* group, lead, federal
board" — is BDAS-specific and no repository supplies it. The actual gap is
narrow: `folders` has no `parent_id` and there is no `createFolder` service.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Subfolders **always** inherit the parent's `scope` and `group_id`, permanently | No per-folder permission UI, nothing new to audit, a folder cannot leak by being nested wrong |
| D2 | Create/rename/delete right = existing `canWrite(parent)` | No new role logic. `local_board` + `local_board_lead` in their own group, `federal_board` everywhere |
| D3 | `event_organizer` gains **no** file rights | Would widen who can place documents before a whole group; needs its own ADR if ever wanted |
| D4 | Delete refused while a folder holds files or subfolders | No cascade code, no orphaned storage objects, no single click destroying a year of protocols |
| D5 | Root folders stay system-owned — not renamable, not deletable | `ensureFolders` remains authoritative for the four scopes |
| D6 | Inline preview covers PDF, images, text/CSV | Matches what boards actually share; zero new dependencies |
| D7 | Office formats get a metadata + download card, never a third-party viewer | MS/Google online viewers require a publicly reachable URL — unacceptable for members-only documents |
| D8 | Preview logs a new `view` action, distinct from `download` | Keeps the download audit trail meaningful once clicking previews |

## PR 1 — Folder nesting

### Schema

```sql
ALTER TABLE folders ADD COLUMN parent_id text REFERENCES folders(id);
ALTER TABLE folders ADD COLUMN depth int NOT NULL DEFAULT 0;

ALTER TABLE folders DROP CONSTRAINT folders_scope_group_uq;
CREATE UNIQUE INDEX folders_root_scope_group_uq
  ON folders (scope, group_id) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX folders_sibling_slug_uq
  ON folders (parent_id, slug) WHERE parent_id IS NOT NULL;
CREATE INDEX folders_parent_idx ON folders (parent_id);
```

The existing `folders_scope_group_uq` on `(scope, group_id)` makes a second
folder of the same scope impossible and must become partial. Roots keep
exactly-one-per-scope-per-group; siblings get unique slugs.

A child **copies** `scope` and `group_id` from its parent, enforced by a CHECK
trigger. Because inherited scope is denormalised onto every row, `permissions.ts`
needs no changes at all — `canRead`/`canWrite` already behave correctly for a
folder five levels deep. This is the central property of the design.

`depth` is capped at 5. There is no move operation, so cycles are structurally
impossible and no recursive integrity check is needed.

### Services (added to the public `index.ts`)

| Service | Rule |
|---|---|
| `createFolder(db, {parentId, name, description}, by)` | `canWrite(parent, by)`; copies parent scope/group; rejects `depth > 5`; slugifies name, rejects sibling collision |
| `renameFolder(db, folderId, {name, description}, by)` | `canWrite`; rejects when `parent_id IS NULL` |
| `deleteFolder(db, folderId, by)` | `canWrite`; rejects when `parent_id IS NULL`; rejects when any file or child folder row exists (`Ordner ist nicht leer.`) |

`listFolders` continues to return the flat readable set; the tree is assembled
from `parent_id` client-side. `listFiles`, `requestUpload` and `getDownloadUrl`
are untouched — a subfolder is just another `folder_id` to them.

### UI

`FolderIndex.tsx` gains breadcrumbs and a nested list. A "Neuer Ordner" button
renders only where the server has already computed write permission. Folder
`description` (column exists at `schema.ts:14`, never rendered) is shown under
the folder title and is editable in the create/rename form.

All values from `core/design-system` tokens — no inline hex, radius, shadow or
duration.

### Deployment

⚠️ Vercel deploys do not run the migration runner. This migration needs a manual
apply against the production project plus the `_bdas_migrations` tracking insert,
or every files page fails with `column parent_id does not exist`.

## PR 2 — Inline preview

### Routing

`/dateien/[fileId]` is a real route rendered two ways: as an overlay via a
`@viewer` parallel slot with a `(.)dateien/[fileId]` intercepting segment when
navigated from the list, and as a full page on direct visit or refresh. One
`FilePreview` component serves both. The URL is shareable, survives refresh, and
back/Escape closes the overlay.

### Dispatch on stored `mimeType`

```
application/pdf        → <iframe src={signedUrl}>   native toolbar: print + download
image/png|jpeg|gif|webp→ <img>                       fit/actual toggle, window.print()
text/plain, text/csv   → server-fetched text / table window.print()
everything else        → metadata card + Download
```

Overlay chrome is identical across all four — filename, size, uploader, date,
Download, Close — so unsupported types do not read as a dead end.

### Constraints found during research

- `core/storage/src/supabase.ts:48` calls `createSignedUrl` **without** the
  `download` option, so Supabase serves objects inline with their stored
  content-type. PDFs and images render as-is; no storage change required.
- `iframe.contentWindow.print()` is blocked cross-origin (files on
  `*.supabase.co`, app on `bdas.de`). No custom print button for PDFs — the
  native viewer toolbar supplies print and download. Images and text render in
  our own DOM, so `window.print()` with a print stylesheet works normally.
- `DEFAULT_DOWNLOAD_TTL = 300` (`supabase.ts:6`) would expire a preview left open
  five minutes. Preview passes `ttlSeconds: 900` explicitly; the 300s default
  stays for plain downloads.
- CSP needs `frame-src` for the Supabase storage host.

### Authorisation

The signed URL is minted server-side per request. The shareable artefact is
`/dateien/[fileId]`, which re-checks `canRead` on every visit; a member without
folder access gets the same NotFound as `listFiles` would produce.

Adds `view` to the `file_access_log` action values (additive, no migration).

## PR 3 — Search, quota, recency

- **Filename search** across every folder the member may read: indexed `ILIKE`
  filtered through the existing `canRead` folder set, results showing folder
  path. Nesting creates the need — a five-level tree hides things.
- **Quota bar** on the folder header: `SUM(size_bytes)` against
  `FOLDER_QUOTA_BYTES` (5 GB), which is currently invisible and surfaces only as
  a mystery upload failure.
- **"Neu" badge** on files under 7 days old, so `/dateien` shows what changed.

No migration. Read-only additions.

## PR 4 — Trash

Deletion today is permanent (`files.ts:225` removes the storage object and the
row). Combined with D4 — empty a folder before deleting it — clearing a folder
means permanently destroying each file individually, often by someone who did not
upload it.

- `deleted_at timestamptz` on `files`; `deleteFile` sets it and leaves the object
  in the bucket.
- Every file query filters `deleted_at IS NULL`.
- Papierkorb view per folder, restore within 30 days, `canWrite` required.
- Sweep job removes object + row past 30 days. The Phase 2 files cron was
  deferred, so this wiring is part of this PR's cost.

⚠️ Second manual production migration apply.

## Explicitly out of scope

- **Bulk ZIP download** — server-side zipping of private objects; cost exceeds payoff.
- **External share links** — spec §11 is role-scoped throughout; opening files to
  non-members is a federation decision (§25), not one to invent here.
- **File versioning** — module-sized; uploading a new file covers the real need.
- **Access-log viewer** — `file_access_log` is personal data under ADR 0008;
  exposing it is a GDPR question for the federation.
- **New-file notifications** — highest value of anything considered, but
  notification fan-out was deferred in Phase 2 and must be built first. Its own
  project.

## Testing

Same PR as the code, per the working agreement.

- Pure unit: scope inheritance, depth cap, sibling-slug collision, delete-refusal
  predicate, mime→renderer dispatch, quota arithmetic, recency threshold.
- Integration against Docker Postgres: partial-unique behaviour (roots stay
  unique, siblings coexist), non-empty delete refusal, `canRead` filtering of
  search results, trash filtering and restore.
- No database mocks in multi-module flows.

## Review

`/review` **and** `/security-review` on each PR — the working agreement requires
a security review on every files PR, and that holds even though nesting reuses
`canWrite` and preview reuses `canRead` unchanged.

Points to put in front of the security review:

- Inherited scope is denormalised onto child rows. The CHECK trigger keeping
  `(scope, group_id)` equal to the parent's is the only thing preventing a
  subfolder from diverging from its parent's permissions.
- The signed preview URL has a 900s TTL instead of 300s, and appears in an
  `iframe src`. Confirm it is not logged, referred, or otherwise leaked.
- `/dateien/[fileId]` is directly addressable and must re-check `canRead` on the
  full-page render, not only on the intercepted overlay.
- Trash keeps objects in the bucket after a user-visible delete for 30 days.
  Confirm this against the ADR 0008 GDPR posture before PR 4 ships.
