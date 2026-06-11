# Files Module — Design Spec

**Date:** 2026-06-11
**Phase:** 2 (events + notifications + **files**) — last remaining Phase 2 slice
**Status:** Approved (brainstorm); pending implementation plan
**Governs:** the `modules/files` module + the concrete Supabase Storage driver in `core/storage` + composition wiring.
**Source of truth:** `docs/bdas-platform-spec.md` §11. This doc records the design decisions and the deliberate deviations from the §11 sketch, with rationale.

---

## 1. Scope & delivery boundary

**In scope (this work):**

- `modules/files` — owns `folders`, `files`, `file_access_log`; schema, migrations, services, permission gating, events, tests.
- The concrete `SupabaseStorageClient` implementation of the existing `core/storage` `StorageClient` interface.
- Composition: idempotent folder provisioning + event subscription, wired behind the `files` feature flag in `apps/web` startup.

**Explicitly deferred to Phase 3 (dashboard):** all user-facing UI — both the member-facing file surface and the federal/local access-log admin tables. Nothing in this work is visible to members; the flag stays **off** in production until Phase 3 surfaces it.

**Rationale:** keeps this a clean one-module PR (CLAUDE.md §4). The build plan's "folders go live" is satisfied at the data/engine layer; the dashboard (Phase 3) is where folders become usable and logs are surfaced.

---

## 2. Architecture

Backend-only module. Bytes never touch the module or the app — every transfer is a signed URL minted server-side (spec §11 hard rule). The module's services are the **only** place permission is decided; no caller can bypass by forging IDs.

**Dependencies (public surfaces only — no deep imports, CLAUDE.md §1 rules 1, 4):**

- `core/storage` — object I/O (`StorageClient`: `signedUploadUrl`, `signedDownloadUrl`, `deleteObject`).
- `core/events` — subscribe to `groups.group.created` for per-group folder provisioning.
- `core/errors` — `ForbiddenError`, `NotFoundError`.
- `members` (public surface) — `getCurrentMember`/`CurrentMember`, `Grant`, plus two role primitives newly exported (see §4).
- `groups` (public surface) — `listGroups` for provisioning backfill.

**Supabase driver location (decision):** `core/storage` keeps the `StorageClient` interface; the concrete `SupabaseStorageClient` lands at `core/storage/src/supabase.ts`, instantiated and injected via `setStorage()` in `apps/web` bootstrap. Mirrors how `modules/notifications/src/notifier-resend.ts` is wired at composition. `core/storage` stays the single home for object-store concerns and is unit-testable in isolation.
_Rejected alternative:_ implementation in `apps/web/lib` — scatters storage logic out of its owning package.

---

## 3. Schema

Extends the spec §11 sketch with two additions, both forced by approved decisions. **These deviations from §11 (interface reshape in §5, `status` column, dropped `'view'` action) should be ratified as a short ADR during implementation** (CLAUDE.md §4: decisions go in `docs/decisions/`).

```
folders
  id            uuid pk
  slug          text unique
  name          text
  scope         enum('members_all' | 'group_members' | 'local_board' | 'federal_board')
  group_id      uuid null    -- required when scope in (group_members, local_board); null otherwise
  description   text
  created_at    timestamptz
  created_by    uuid null    -- system-provisioned folders have no member author
  unique (scope, group_id)   -- makes idempotent ensureFolders() a safe upsert

files
  id               uuid pk
  folder_id        uuid fk -> folders.id
  filename         text
  storage_key      text unique
  mime_type        text
  size_bytes       bigint
  status           enum('pending' | 'ready')   -- NEW: two-phase upload
  uploaded_by      uuid
  uploaded_at      timestamptz
  last_modified_at timestamptz

file_access_log
  id         uuid pk
  file_id    uuid fk -> files.id
  member_id  uuid
  action     enum('download' | 'upload' | 'delete')   -- 'view' dropped (see below)
  at         timestamptz
```

**Decisions baked into the schema:**

- **`files.status`** — required by two-phase commit (§5). Only `ready` rows count toward quota and appear in `listFiles`. `pending` rows are in-flight or abandoned.
- **`unique(scope, group_id)`** — lets `ensureFolders()` upsert without dup-checking; the four-scope taxonomy is exactly keyed by this pair (`group_id` null for the two singletons).
- **Size cap & quota are code constants, not columns:** `MAX_FILE_BYTES = 25 * 1024 * 1024`, `FOLDER_QUOTA_BYTES = 5 * 1024 * 1024 * 1024`. Spec §11's "configurable per scope by federal board" is a Phase 3 dashboard action; adding override columns now is YAGNI. Revisit when Phase 3 builds the config UI.
- **`action` enum drops `'view'`:** in a backend with signed URLs, the only access event is minting a download URL (`'download'`). `'view'` (opening/previewing in the dashboard) is a Phase 3 concern; add it when that surface exists rather than carry a never-written value now.

---

## 4. Permission model

Authorization is a pure function over a folder + the caller's `CurrentMember`. Reuses `members`' role primitives rather than re-deriving role semantics.

**Required `members` export (decision):** promote `isFederalBoard` and `canManageGroup` from `modules/members/src/roles.ts` onto `modules/members/src/index.ts`. They are pure functions over `Grant[]`. This is a deliberate second-module touch in the files PR; justified because `members` owns role semantics and duplicating them in `files` would drift (cf. the email-driver duplication recorded in ADR 0011).
_Rejected alternative:_ reimplement both checks inside `files` to keep a strict one-module diff — rejected to avoid role-logic drift.

**Permission matrix (spec §11 taxonomy):**

| Scope               | Read                                                        | Write (upload/delete)       |
| ------------------- | ----------------------------------------------------------- | --------------------------- |
| `members_all`       | any `active` member                                         | `isFederalBoard(grants)`    |
| `group_members:[g]` | `member.status === 'active' && member.primaryGroupId === g` | `canManageGroup(grants, g)` |
| `local_board:[g]`   | `canManageGroup(grants, g)` ∨ `isFederalBoard(grants)`      | `canManageGroup(grants, g)` |
| `federal_board`     | `isFederalBoard(grants)`                                    | `isFederalBoard(grants)`    |

(`canManageGroup` already returns true for federal board, so the `local_board` read row's explicit `isFederalBoard` is belt-and-suspenders / documents intent.)

Every service resolves the folder, runs `canRead`/`canWrite`, and throws `ForbiddenError` on failure — identical response whether the folder/file is missing or forbidden, so existence is never leaked.

---

## 5. Public interface (`modules/files/src/index.ts`)

Reshaped from the §11 sketch to honor the no-proxy rule. The spec's `uploadFile(folderId, file, byMember)` **cannot exist** — the module never receives bytes — so upload becomes a two-phase commit.

```ts
listFolders(db, forMember): Promise<Folder[]>
  // returns only folders forMember can read

listFiles(db, folderId, forMember): Promise<FileMeta[]>
  // read-gated; returns status='ready' rows only

getDownloadUrl(db, fileId, forMember): Promise<SignedUrl>
  // read-gated on the file's folder; writes a 'download' file_access_log row

requestUpload(db, folderId, { filename, mimeType, sizeBytes }, byMember)
  : Promise<{ fileId: string; uploadUrl: SignedUrl }>
  // write-gated; enforces MIME allowlist + MAX_FILE_BYTES + folder quota
  // against the DECLARED sizeBytes; inserts a status='pending' files row;
  // returns a signed PUT URL. Client PUTs bytes direct to Supabase.

confirmUpload(db, fileId, byMember): Promise<FileMeta>
  // write-gated; HEADs the object via StorageClient, verifies REAL size
  // <= MAX_FILE_BYTES and within quota; on success marks status='ready',
  // sets last_modified_at, writes an 'upload' log row; on mismatch deletes
  // the object + the pending row and throws.

deleteFile(db, fileId, byMember): Promise<void>
  // write-gated; deletes the object then the row; writes a 'delete' log row
```

**Two-phase upload rationale:** with direct client→store PUTs the module can't trust the declared size. `requestUpload` gates on the declared size (fast rejection of obvious over-cap); `confirmUpload` re-checks the _actual_ object size server-side via `StorageClient` HEAD before the file is ever visible (`ready`). Closes the "declare 1 MB, PUT 100 MB" hole.

**MIME allowlist (decision):** a constant set of document/image/archive types (PDF, common Office formats, PNG/JPG/GIF/WebP, txt/csv, zip). Reject executables and unknown types at `requestUpload`. Conservative default; the federation can widen it later.

**No `replaceFile` in v1 (decision):** the spec's _public-interface list_ omits it (only its prose capability list says "replace"); `deleteFile` + `requestUpload` already compose to a replace. Going with the interface list.

**Abandoned `pending` rows:** `confirmUpload` is the happy path. Provide `sweepStalePendingUploads(db, olderThan)` (deletes objects + rows for `pending` files past a TTL) but leave it **unwired** — Phase 3 attaches it to a cron. Pending rows never count toward quota or appear in listings, so they are harmless until swept.

---

## 6. Provisioning & events

Folders are system-provisioned, never user-creatable in v1 (spec §11).

- **`ensureFolders(db)`** — idempotent: upserts the 2 singletons (`members_all`, `federal_board`) + one `group_members` and one `local_board` folder per existing group (group IDs read via `groups.listGroups()`). Keyed on `unique(scope, group_id)`, so re-running is a no-op. Runs at `files` boot (behind the flag), in the same `apps/web/instrumentation.ts` startup path notifications uses.
- **Subscriber on `groups.group.created`** `{ groupId, slug, at }` → provisions that group's two folders. Self-healing: a missed event is repaired on the next boot's `ensureFolders` pass.
- **`groups.group.archived`** → **no-op**. Folders and their documents persist when a group is archived, matching the handover principle (spec §13/§400: knowledge survives role/lifecycle transitions). Cleanup, if ever wanted, is a separate deliberate decision.

---

## 7. Testing

Integration tests against **Docker Postgres**, not mocks (CLAUDE.md §3; spec §5 rule 5). The `StorageClient` is the one seam faked (no live bucket in hermetic tests).

- **Permission matrix** — table-driven over every (scope × actor-role × read|write) cell, asserting allow/deny. Highest-value surface.
- **Two-phase upload** — `requestUpload` inserts `pending` and rejects over-cap declared size / over-quota / disallowed MIME; `confirmUpload` promotes to `ready` on a matching faked HEAD size and rolls back (object delete + row delete + throw) on a real-size mismatch.
- **Provisioning idempotency** — `ensureFolders` run twice yields no duplicates; a `groups.group.created` publish yields exactly the two per-group folders.
- **Audit log** — download/upload/delete each write exactly one `file_access_log` row with the right action.
- **Quota accounting** — only `ready` rows count toward `FOLDER_QUOTA_BYTES`; `pending` rows don't.
- **Supabase driver** — unit-tested against the `StorageClient` interface with the Supabase SDK mocked (signed-URL shape, TTL, key handling). The real bucket is a manual/CI smoke check, since hermetic tests can't hit live Supabase.

**Security review:** `/security-review` is mandatory before merge (CLAUDE.md §4; build-plan:128) — files is an access-controlled, object-storage module.

---

## 8. Out of scope (v1)

Per spec §11, plus decisions above:

- **Full-text search — deferred, not planned.** Not in the build plan; would be a dedicated future milestone. ~90% of its cost is a content-extraction/OCR pipeline + a new async worker tier the project deliberately does not have (today everything is synchronous request/response + an in-process event bus). The search half (a `tsvector`/`pg_trgm` index + query, filtered through `canRead`) is small and module-local; the extraction half is the real work. Nothing in this design forecloses it; the schema simply doesn't build toward it.
- Versioning, public share links, in-app previews beyond MIME-type icons, comments on files, nested folders, user-created folders.
- Per-scope quota/cap configuration (Phase 3 dashboard).
- The `'view'` access action (Phase 3, when a preview surface exists).
- All UI — member-facing and admin (Phase 3 dashboard).

---

## 9. Decision log (for the implementation-time ADR)

1. Backend + storage engine only; all UI deferred to Phase 3.
2. Two-phase upload (`requestUpload` + `confirmUpload`) replacing the §11 `uploadFile`; adds `files.status`.
3. Idempotent boot provisioning (`ensureFolders`) + `groups.group.created` subscriber; backfill via `groups.listGroups()`.
4. Supabase driver implemented in `core/storage/src/supabase.ts`, injected at `apps/web` composition.
5. `members` exports `isFederalBoard` + `canManageGroup` (deliberate second-module touch).
6. Size cap / quota as code constants; per-scope config deferred.
7. `action` enum = download|upload|delete; `'view'` dropped until Phase 3.
8. No `replaceFile` (delete + upload composes it).
9. `groups.group.archived` is a no-op for folders (documents persist).
10. Full-text search deferred and unscheduled — future milestone, extraction pipeline is the cost.
