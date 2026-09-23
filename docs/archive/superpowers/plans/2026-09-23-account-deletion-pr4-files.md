# Konto-Löschung — PR4: Files-Modul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `files` its purge/export contribution to the account-deletion sweep: `deleteFilesByMember(db, userId)` (real Storage-blob + row deletion, replacing reliance on the leaky `uploaded_by` cascade), the `file_access_log` retention fix (`ON DELETE CASCADE` → `ON DELETE SET NULL` on `member_id`, per spec §2 decision 2), and `exportForUser(db, userId)` (Art. 15, metadata only). No orchestrator wiring, no cron, no UI — those are PR8/PR3 already-built and PR8-not-yet-built territory.

**Architecture:** `files` owns `folders`/`files`/`file_access_log` (Rule 1), so both the migration and the new service live here, not in `auth`. The orchestrator (a later PR) only ever holds a `userId` (the identity `auth`/`account_deletion_requests` track); `files` keys everything by `members.id`. Same cross-module-boundary shape `notifications` already established in PR2: a composed `MemberIdResolver` interface (`modules/files/src/resolver.ts`, mirroring `modules/notifications/src/resolver.ts`), wired at boot in `apps/web/lib/files-bootstrap.ts` from `@bdas/members.getMemberByUserId`, instead of `files` reading `members` directly.

**Folder cleanup — confirmed scope (see below):** `deleteFilesByMember` deletes every file the member uploaded (Storage object then row) and then deletes folders _this member created that the deletion leaves empty_ — reusing the exact "empty" check `deleteFolder`'s D4 invariant already uses (`folder-writes.ts`). It never deletes a folder that still holds another member's files or subfolders. `folders.scope` has no private/personal variant — every scope (`members_all`/`group_members`/`local_board`/`federal_board`/`board_broadcast`) is a shared, organizational space, and `created_by` is metadata about who happened to click "create", not ownership of the contents. A literal "delete every folder this member created, recursively, regardless of contents" would break the exact guarantee `deleteFolder` was built to protect ("no click destroys a year of protocols") and could take other members' files down with it. Confirmed with the user 2026-09-23 before writing this plan — this is the resolved reading of design-spec §5 step 1's "Storage-Blobs + Zeilen + Ordner", not a literal one.

**Export scope:** `exportForUser` returns file _metadata_ the member uploaded (filename, folder, size, MIME type, status, upload date) — matches spec §6 ("nur Metadaten, keine Blob-Inhalte") and the `notifications.exportForUser` precedent's shape (a flat readonly row array, no CSV/ZIP — that bundling is a later export-completion PR). It does **not** include `file_access_log` rows (download/upload/delete history): the spec calls out file metadata explicitly and treats the access log purely as a retention/audit construct (§2 decision 2), never as export content. Flagging this so it's a visible call, not a silent omission — easy to add later if the federation wants it.

**Tech Stack:** TypeScript, Drizzle ORM (raw SQL migrations are authoritative; `schema.ts` mirrors them), Vitest + real Postgres (Docker) for integration tests, `@bdas/db`, `@bdas/storage`, `@bdas/members` (only from `apps/web`'s bootstrap wiring, never from inside `modules/files`).

**Spec:** `docs/superpowers/specs/2026-09-22-account-deletion-design.md` — this plan implements the `files`-owned half of §3 (migration), §5 step 1 (`deleteFilesByMember`), and the `files` slice of §6 (`exportForUser`).

## Global Constraints

- Rule 1 (CLAUDE.md §1): `modules/files/src/**` never imports `@bdas/members` to read a member row directly. `userId → memberId` resolution goes through the composed `MemberIdResolver`, wired by `apps/web` at boot — same shape as `modules/notifications/src/resolver.ts`.
- Rule 5: integration tests run against real Postgres (Docker), never mocked. Use `describeIfDb`, matching every other test file in this module (`index.test.ts`, `folder-access.test.ts`, …). `getStorage()` is faked per-test with the existing `fakeStorage()` helper pattern from `index.test.ts` — never a real bucket.
- Rule 7: the new migration is `modules/files/migrations/0006_access_log_retention.sql`, runnable in isolation, filename-ordered after `0005_folder_member_grants.sql`. No `infra/migrations/manifest.ts` change needed (`files` is already in the manifest; files within a module run in filename order).
- Rule 8: only symbols re-exported from `modules/files/src/index.ts` are public.
- `file_access_log.member_id`'s FK target is `members(id)`, not `auth_users(id)` (confirmed in `migrations/0001_init.sql`) — the retention fix changes that FK's `ON DELETE` behavior, not its target.
- `deleteFilesByMember` and `exportForUser` are idempotent / defined-on-missing-member, matching `notifications.deleteLogForMember`/`exportForUser`'s contract exactly: an unresolvable `userId` returns `[]` / no-ops rather than throwing (orchestrator retry-safety, spec §5 — a retried sweep step must never fail because a previous run already finished it).
- Per user memory: run `pnpm format` before every commit.
- This PR does not touch the orchestrator, the cron sweep, or any route (PR8). `deleteFilesByMember`/`exportForUser` are built and exported but not called from anywhere yet — same "foundation only" shape PR1 used for `auth`.
- `/security-review` runs on this PR before it's considered done, per explicit user instruction — this is the PR that deletes real Storage objects irreversibly.

---

### Task 1: `file_access_log` retention migration

**Files:**

- Create: `modules/files/migrations/0006_access_log_retention.sql`
- Modify: `modules/files/src/schema.ts`
- Test: `modules/files/src/index.test.ts` (extend the existing `"files schema"` describe block + its `applyMigrations` helper)

**Interfaces:**

- Produces: `fileAccessLog.memberId` becomes `string | null` in the Drizzle-inferred row type (was `string`).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

In `modules/files/src/index.test.ts`, add `"0006_access_log_retention.sql"` to the `applyMigrations` file list (after `"0005_folder_member_grants.sql"`):

```ts
async function applyMigrations(t: TestDb): Promise<void> {
  for (const file of [
    ["..", "..", "auth", "migrations", "0001_init.sql"],
    ["..", "..", "groups", "migrations", "0001_init.sql"],
    ["..", "..", "groups", "migrations", "0004_location.sql"],
    ["..", "..", "groups", "migrations", "0005_image_key.sql"],
    ["..", "..", "groups", "migrations", "0007_group_kind.sql"],
    ["..", "..", "groups", "migrations", "0008_group_kind_netzwerk.sql"],
    ["..", "..", "members", "migrations", "0001_init.sql"],
    ["..", "migrations", "0001_init.sql"],
    ["..", "migrations", "0002_rls_lockdown.sql"],
    ["..", "migrations", "0003_folder_nesting.sql"],
    ["..", "migrations", "0004_board_broadcast_scope.sql"],
    ["..", "migrations", "0005_folder_member_grants.sql"],
    ["..", "migrations", "0006_access_log_retention.sql"],
  ]) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
}
```

Then add this test inside the existing `describeIfDb("files schema", ...)` block, after `"enforces one folder per (scope, group_id)"`:

```ts
it("anonymizes file_access_log.member_id instead of deleting the row when the member is purged", async () => {
  const { groupId, memberId } = await seedGroupAndMember(t, {
    userId: "usr_del",
    memberId: "mbr_del",
  });
  await t.client`INSERT INTO folders (id, slug, name, scope, group_id) VALUES ('fld_x', 'x', 'X', 'local_board', ${groupId})`;
  await t.client`
    INSERT INTO files (id, folder_id, filename, storage_key, mime_type, size_bytes, status, uploaded_by)
    VALUES ('fil_x', 'fld_x', 'a.pdf', 'k/a.pdf', 'application/pdf', 10, 'ready', ${memberId})`;
  await t.db.insert(fileAccessLog).values({
    id: "fal_x",
    fileId: "fil_x",
    memberId,
    action: "download",
  });

  await t.client`DELETE FROM auth_users WHERE id = 'usr_del'`;

  const [log] = await t.db.select().from(fileAccessLog).where(eq(fileAccessLog.id, "fal_x"));
  expect(log).toBeDefined();
  expect(log?.memberId).toBeNull();
});
```

Add `eq` to the existing `drizzle-orm` import at the top of the file (it currently has none — add `import { eq } from "drizzle-orm";`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/files test index`
Expected: FAIL — `ENOENT` reading `0006_access_log_retention.sql` (file doesn't exist yet).

- [ ] **Step 3: Write the migration**

Create `modules/files/migrations/0006_access_log_retention.sql`:

```sql
-- 90-day file-access-log retention must survive account deletion (design
-- spec §2 decision 2, docs/superpowers/specs/2026-09-22-account-deletion-design.md).
-- member_id previously cascaded, so hard-deleting a member erased their
-- access history along with them, in conflict with the retention
-- requirement — regardless of who or what triggered the deletion. The log
-- entry now survives with member_id anonymized to NULL instead.

ALTER TABLE file_access_log ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE file_access_log DROP CONSTRAINT file_access_log_member_id_fkey;
ALTER TABLE file_access_log
  ADD CONSTRAINT file_access_log_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
```

`file_access_log_member_id_fkey` is Postgres's default auto-generated name for an inline, unnamed `REFERENCES` on that column (`<table>_<column>_fkey`) — `0001_init.sql` defines it exactly that way (`member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE`, no explicit `CONSTRAINT` keyword), so this should be correct against a database built fresh from these migrations. If Step 5's test run fails on the `DROP CONSTRAINT` line with "constraint does not exist", find the real name first — `SELECT conname FROM pg_constraint WHERE conrelid = 'file_access_log'::regclass AND contype = 'f';` — and use that instead.

- [ ] **Step 4: Update `schema.ts`**

In `modules/files/src/schema.ts`, in the `fileAccessLog` table definition, change:

```ts
    memberId: text("member_id").notNull(),
```

to:

```ts
    memberId: text("member_id"),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bdas/files test index`
Expected: PASS. If the DB is unreachable, start it first: `pnpm db:up`.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @bdas/files typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add modules/files/migrations/0006_access_log_retention.sql modules/files/src/schema.ts modules/files/src/index.test.ts
git commit -m "fix(files): anonymize file_access_log.member_id instead of cascading

file_access_log.member_id was ON DELETE CASCADE against members(id), so a
hard account deletion erased the 90-day access-log retention along with the
member. Switches to ON DELETE SET NULL — the log entry survives, only the
person is anonymized (design spec §2 decision 2).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `MemberIdResolver` + `exportForUser`

**Files:**

- Create: `modules/files/src/resolver.ts`
- Create: `modules/files/src/services/gdpr.ts`
- Test: `modules/files/src/services/gdpr.test.ts`

**Interfaces:**

- Consumes: `files` from `../schema`; `Db` from `@bdas/db`.
- Produces:
  - `interface MemberIdResolver { resolveMemberId(db: Db, userId: string): Promise<string | null> }`
  - `getMemberIdResolver(): MemberIdResolver`
  - `setMemberIdResolver(r: MemberIdResolver): void`
  - `type FileExportRow = { id, folderId, filename, mimeType, sizeBytes, status, uploadedAt }`
  - `exportForUser(db: Db, userId: string): Promise<readonly FileExportRow[]>`

- [ ] **Step 1: Write `resolver.ts`**

Create `modules/files/src/resolver.ts` (no test — mirrors `modules/notifications/src/resolver.ts`'s `MemberIdResolver` half exactly; exercised through `gdpr.test.ts` via `setMemberIdResolver`, same as that precedent):

```ts
/**
 * Resolves a userId (the identity the account-deletion orchestrator holds)
 * to this member's id (the identity `files`/`folders`/`file_access_log`
 * actually key on). `files` doesn't read `members` directly (CLAUDE.md §1
 * rule 1) — apps/web composes the real resolver at boot from
 * members.getMemberByUserId, same shape as
 * modules/notifications/src/resolver.ts's MemberIdResolver.
 */
import type { Db } from "@bdas/db";

export interface MemberIdResolver {
  resolveMemberId(db: Db, userId: string): Promise<string | null>;
}

const unconfigured: MemberIdResolver = {
  async resolveMemberId(): Promise<string | null> {
    return null;
  },
};

// Backed by globalThis (Symbol.for) for the same reason as the notifications
// resolver: a direct call from a cron route runs in a different module
// instance than the `instrumentation.ts` boot that wired this, so a
// module-level `let` would read `unconfigured` and silently no-op every purge.
const RESOLVER_KEY = Symbol.for("@bdas/files:member-id-resolver");
type ResolverStore = { [RESOLVER_KEY]?: MemberIdResolver };
function resolverStore(): ResolverStore {
  return globalThis as unknown as ResolverStore;
}

export function getMemberIdResolver(): MemberIdResolver {
  return resolverStore()[RESOLVER_KEY] ?? unconfigured;
}

/** Composition-time wiring. apps/web calls this at boot. */
export function setMemberIdResolver(r: MemberIdResolver): void {
  resolverStore()[RESOLVER_KEY] = r;
}
```

- [ ] **Step 2: Write the failing test**

Create `modules/files/src/services/gdpr.test.ts`:

```ts
/**
 * Integration tests for this module's GDPR functions (exportForUser,
 * deleteFilesByMember) against a real Postgres schema. Skips when
 * DATABASE_URL is unreachable, matching index.test.ts.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { setStorage, type SignedUrl, type StorageClient } from "@bdas/storage";

import { setMemberIdResolver } from "../resolver";
import { files } from "../schema";
import { exportForUser } from "./gdpr";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

async function dbReachable(): Promise<boolean> {
  const url = process.env["DATABASE_URL"] ?? DEFAULT_URL;
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 2 });
  try {
    await sql`select 1`;
    await sql.end();
    return true;
  } catch {
    try {
      await sql.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

/** A fake storage driver whose behavior each test configures. */
function fakeStorage(over: Partial<StorageClient> = {}): StorageClient {
  const url: SignedUrl = {
    url: "https://signed.example/put",
    expiresAt: new Date(Date.now() + 3600_000),
  };
  return {
    signedUploadUrl: async () => url,
    signedDownloadUrl: async () => ({ ...url, url: "https://signed.example/get" }),
    statObject: async () => ({ sizeBytes: 0 }),
    deleteObject: async () => undefined,
    ...over,
  };
}

async function applyMigrations(t: TestDb): Promise<void> {
  for (const file of [
    ["..", "..", "..", "auth", "migrations", "0001_init.sql"],
    ["..", "..", "..", "groups", "migrations", "0001_init.sql"],
    ["..", "..", "..", "groups", "migrations", "0004_location.sql"],
    ["..", "..", "..", "groups", "migrations", "0005_image_key.sql"],
    ["..", "..", "..", "groups", "migrations", "0007_group_kind.sql"],
    ["..", "..", "..", "groups", "migrations", "0008_group_kind_netzwerk.sql"],
    ["..", "..", "..", "members", "migrations", "0001_init.sql"],
    ["..", "..", "migrations", "0001_init.sql"],
    ["..", "..", "migrations", "0002_rls_lockdown.sql"],
    ["..", "..", "migrations", "0003_folder_nesting.sql"],
    ["..", "..", "migrations", "0004_board_broadcast_scope.sql"],
    ["..", "..", "migrations", "0005_folder_member_grants.sql"],
    ["..", "..", "migrations", "0006_access_log_retention.sql"],
  ]) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
}

/** Seed a group + an active member belonging to it, and wire the resolver
 *  these GDPR functions depend on. */
async function seedMember(
  t: TestDb,
  opts: { userId?: string; memberId?: string; groupId?: string } = {},
): Promise<{ userId: string; memberId: string; groupId: string }> {
  const userId = opts.userId ?? "usr_test_1";
  const memberId = opts.memberId ?? "mbr_test_1";
  const groupId = opts.groupId ?? "grp_muc";
  await t.client`INSERT INTO groups (id, slug, name, city) VALUES (${groupId}, ${groupId}, 'München', 'München') ON CONFLICT DO NOTHING`;
  await t.client`INSERT INTO auth_users (id, email_normalized, email_display, status) VALUES (${userId}, ${userId + "@example.org"}, ${userId + "@example.org"}, 'active')`;
  await t.client`INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status) VALUES (${memberId}, ${userId}, 'Test', 'Member', ${groupId}, 'active')`;
  setMemberIdResolver({
    async resolveMemberId(_db, uid): Promise<string | null> {
      return uid === userId ? memberId : null;
    },
  });
  return { userId, memberId, groupId };
}

describeIfDb("files GDPR functions", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
  });

  afterEach(async () => {
    await t.cleanup();
  });

  describe("exportForUser", () => {
    it("returns metadata for every file the resolved member uploaded", async () => {
      const { memberId, groupId } = await seedMember(t);
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId})`;
      await t.db.insert(files).values({
        id: "fil_1",
        folderId: "fld_1",
        filename: "protokoll.pdf",
        storageKey: "k/protokoll.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "ready",
        uploadedBy: memberId,
      });

      const rows = await exportForUser(t.db, "usr_test_1");

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "fil_1",
        folderId: "fld_1",
        filename: "protokoll.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "ready",
      });
      expect(rows[0]?.uploadedAt).toBeInstanceOf(Date);
    });

    it("returns an empty array when the user has no resolvable member", async () => {
      setMemberIdResolver({
        async resolveMemberId(): Promise<string | null> {
          return null;
        },
      });

      expect(await exportForUser(t.db, "usr_unknown")).toEqual([]);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @bdas/files test gdpr`
Expected: FAIL — `./gdpr` does not exist.

- [ ] **Step 4: Write `gdpr.ts` (export half only for now)**

Create `modules/files/src/services/gdpr.ts`:

```ts
/**
 * This module's GDPR self-service contributions (Art. 15 export, Art. 17
 * purge step) for the account-deletion feature. `files`/`folders` are keyed
 * by `members.id` (CLAUDE.md §1 rule 1 — this module reads neither `members`
 * nor `auth_users` directly), so both functions translate the caller's
 * `userId` via the composed `MemberIdResolver` before touching either table.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@bdas/db";

import { files, type FileStatus } from "../schema";
import { getMemberIdResolver } from "../resolver";

export type FileExportRow = {
  readonly id: string;
  readonly folderId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly status: FileStatus;
  readonly uploadedAt: Date;
};

/**
 * Art. 15 — this module's slice of a user's full data export: metadata for
 * every file they uploaded (never the object's bytes — the storage key stays
 * internal, same rule as FileMeta). Includes both 'pending' and 'ready'
 * files; a pending upload is still their personal data. Empty array when the
 * user has no resolvable member row (nothing was ever uploaded by them, or
 * the member row is already gone).
 */
export async function exportForUser(db: Db, userId: string): Promise<readonly FileExportRow[]> {
  const memberId = await getMemberIdResolver().resolveMemberId(db, userId);
  if (!memberId) return [];
  const rows = await db
    .select({
      id: files.id,
      folderId: files.folderId,
      filename: files.filename,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      status: files.status,
      uploadedAt: files.uploadedAt,
    })
    .from(files)
    .where(eq(files.uploadedBy, memberId));
  return rows.map((r) => ({ ...r, status: r.status as FileStatus }));
}
```

`schema.ts` doesn't currently export a `FileStatus`-named type (the module's public `FileStatus` lives in `types.ts`). Add a type-only re-export to `schema.ts` so `gdpr.ts` can import it without reaching into `../types` from a schema-adjacent file: at the bottom of `modules/files/src/schema.ts`, add:

```ts
export type { FileStatus } from "../types";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bdas/files test gdpr`
Expected: PASS (both `exportForUser` cases). If the DB is unreachable: `pnpm db:up`.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @bdas/files typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add modules/files/src/resolver.ts modules/files/src/services/gdpr.ts modules/files/src/services/gdpr.test.ts modules/files/src/schema.ts
git commit -m "feat(files): add MemberIdResolver + exportForUser (DSGVO Art. 15)

Same composed-resolver shape modules/notifications/src/resolver.ts already
established in PR2 — files keys uploaded_by/created_by/member_id by
members.id but the orchestrator only holds a userId.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `deleteFilesByMember` (Art. 17 purge step)

**Files:**

- Modify: `modules/files/src/services/gdpr.ts`
- Test: `modules/files/src/services/gdpr.test.ts`

**Interfaces:**

- Consumes: `getStorage` from `@bdas/storage`; `and`, `desc`, `eq`, `notExists`, `sql` from `drizzle-orm`; `alias` from `drizzle-orm/pg-core`; `files`, `folders` from `../schema`; `getMemberIdResolver` from `../resolver`.
- Produces: `deleteFilesByMember(db: Db, userId: string): Promise<void>`.

This is a single TDD cycle covering four scenarios in one function, matching how `deleteLogForMember` and `deleteFolder` are each tested as one unit — the scenarios only make sense together (empty-folder cleanup can't be tested without the file deletion that produces the emptiness).

- [ ] **Step 1: Write the failing tests**

Add to `modules/files/src/services/gdpr.test.ts`, inside `describeIfDb("files GDPR functions", ...)`, after the `exportForUser` describe block:

```ts
describe("deleteFilesByMember", () => {
  it("deletes the storage object and the row for every file the member uploaded", async () => {
    const { memberId, groupId } = await seedMember(t);
    await t.client`INSERT INTO folders (id, slug, name, scope, group_id) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId})`;
    await t.db.insert(files).values({
      id: "fil_1",
      folderId: "fld_1",
      filename: "a.pdf",
      storageKey: "k/a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      status: "ready",
      uploadedBy: memberId,
    });
    const deletedKeys: string[] = [];
    setStorage(
      fakeStorage({
        deleteObject: async (key: string) => {
          deletedKeys.push(key);
        },
      }),
    );

    await deleteFilesByMember(t.db, "usr_test_1");

    expect(deletedKeys).toEqual(["k/a.pdf"]);
    expect(await t.db.select().from(files).where(eq(files.id, "fil_1"))).toEqual([]);
  });

  it("tolerates a storage object that is already gone", async () => {
    const { memberId, groupId } = await seedMember(t);
    await t.client`INSERT INTO folders (id, slug, name, scope, group_id) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId})`;
    await t.db.insert(files).values({
      id: "fil_1",
      folderId: "fld_1",
      filename: "a.pdf",
      storageKey: "k/a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      status: "ready",
      uploadedBy: memberId,
    });
    setStorage(
      fakeStorage({
        deleteObject: async () => {
          throw new Error("object not found");
        },
      }),
    );

    await expect(deleteFilesByMember(t.db, "usr_test_1")).resolves.toBeUndefined();
    expect(await t.db.select().from(files).where(eq(files.id, "fil_1"))).toEqual([]);
  });

  it("deletes a folder the member created once removing their files leaves it empty", async () => {
    const { memberId, groupId } = await seedMember(t);
    await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId}, ${memberId})`;
    await t.db.insert(files).values({
      id: "fil_1",
      folderId: "fld_1",
      filename: "a.pdf",
      storageKey: "k/a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      status: "ready",
      uploadedBy: memberId,
    });

    await deleteFilesByMember(t.db, "usr_test_1");

    expect(await t.db.select().from(folders).where(eq(folders.id, "fld_1"))).toEqual([]);
  });

  it("keeps a folder the member created if another member's file is still inside it", async () => {
    const { memberId, groupId } = await seedMember(t);
    const other = await seedMember(t, { userId: "usr_other", memberId: "mbr_other" });
    await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId}, ${memberId})`;
    await t.db.insert(files).values({
      id: "fil_other",
      folderId: "fld_1",
      filename: "other.pdf",
      storageKey: "k/other.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      status: "ready",
      uploadedBy: other.memberId,
    });
    // re-wire the resolver back to the member under deletion, since
    // seedMember(t, other) above overwrote it
    setMemberIdResolver({
      async resolveMemberId(_db, uid): Promise<string | null> {
        return uid === "usr_test_1" ? memberId : null;
      },
    });

    await deleteFilesByMember(t.db, "usr_test_1");

    const [folder] = await t.db.select().from(folders).where(eq(folders.id, "fld_1"));
    expect(folder).toBeDefined();
    expect(folder?.createdBy).toBe(memberId);
    const [otherFile] = await t.db.select().from(files).where(eq(files.id, "fil_other"));
    expect(otherFile).toBeDefined();
  });

  it("deletes a chain of now-empty folders the member created, deepest first", async () => {
    const { memberId, groupId } = await seedMember(t);
    await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by, depth) VALUES ('fld_parent', 'p', 'P', 'local_board', ${groupId}, ${memberId}, 0)`;
    await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by, parent_id, depth) VALUES ('fld_child', 'c', 'C', 'local_board', ${groupId}, ${memberId}, 'fld_parent', 1)`;
    await t.db.insert(files).values({
      id: "fil_1",
      folderId: "fld_child",
      filename: "a.pdf",
      storageKey: "k/a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      status: "ready",
      uploadedBy: memberId,
    });

    await deleteFilesByMember(t.db, "usr_test_1");

    expect(await t.db.select().from(folders).where(eq(folders.id, "fld_child"))).toEqual([]);
    expect(await t.db.select().from(folders).where(eq(folders.id, "fld_parent"))).toEqual([]);
  });

  it("is a no-op when the user has no resolvable member", async () => {
    setMemberIdResolver({
      async resolveMemberId(): Promise<string | null> {
        return null;
      },
    });

    await expect(deleteFilesByMember(t.db, "usr_unknown")).resolves.toBeUndefined();
  });

  it("is idempotent: a second call after everything is gone is a clean no-op", async () => {
    const { memberId, groupId } = await seedMember(t);
    await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId}, ${memberId})`;
    await t.db.insert(files).values({
      id: "fil_1",
      folderId: "fld_1",
      filename: "a.pdf",
      storageKey: "k/a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      status: "ready",
      uploadedBy: memberId,
    });

    await deleteFilesByMember(t.db, "usr_test_1");
    await expect(deleteFilesByMember(t.db, "usr_test_1")).resolves.toBeUndefined();
  });
});
```

Update the two import lines at the top of the test file: change `import { files } from "../schema";` to `import { files, folders } from "../schema";`, and change `import { exportForUser } from "./gdpr";` to `import { deleteFilesByMember, exportForUser } from "./gdpr";`. (Task 2 only needed `files`/`exportForUser` — this task's tests are the first to touch folders and the new delete function.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/files test gdpr`
Expected: FAIL — `deleteFilesByMember` is not exported from `./gdpr`.

- [ ] **Step 3: Implement `deleteFilesByMember`**

Add to `modules/files/src/services/gdpr.ts`. First, extend the imports:

```ts
import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@bdas/db";
import { getStorage } from "@bdas/storage";

import { files, folders, type FileStatus } from "../schema";
import { getMemberIdResolver } from "../resolver";
```

(Replace the Task 2 import block with this one — it's the same two lines plus the three new ones.)

Then append:

```ts
/**
 * Art. 17 purge step, run by the account-deletion orchestrator (a later PR)
 * BEFORE auth.deleteAccount()'s FK cascade reaches this module. A raw
 * cascade on files.uploaded_by (ON DELETE CASCADE) would delete file ROWS
 * but leak the underlying Storage objects — nothing else ever calls
 * getStorage().deleteObject() for them. This function deletes the object
 * before the row, for every file the member uploaded, then removes folders
 * this member created that the deletion leaves empty.
 *
 * Folders are cleaned up only when EMPTY, reusing deleteFolder's D4
 * invariant (folder-writes.ts): folders.scope has no private/personal
 * variant — every scope is a shared, organizational space — and created_by
 * is metadata about who happened to click "create", not ownership of the
 * contents. Deleting a non-empty folder because its creator is leaving would
 * take other members' files down with it. A folder with foreign content left
 * inside keeps today's behavior: created_by goes NULL (existing
 * ON DELETE SET NULL), the folder and its contents stay untouched.
 *
 * Idempotent: a second call after everything is already gone finds nothing
 * to resolve, delete, or clean up and returns cleanly — the orchestrator's
 * retry-safe per-step design (spec §5) depends on every step behaving this
 * way, same contract as notifications.deleteLogForMember.
 */
export async function deleteFilesByMember(db: Db, userId: string): Promise<void> {
  const memberId = await getMemberIdResolver().resolveMemberId(db, userId);
  if (!memberId) return;

  const owned = await db.select().from(files).where(eq(files.uploadedBy, memberId));
  for (const file of owned) {
    try {
      await getStorage().deleteObject(file.storageKey);
    } catch {
      // object may already be gone (e.g. a retried sweep); the row must still go
    }
    await db.delete(files).where(eq(files.id, file.id));
  }

  // Deepest first, so a parent that only becomes empty once its child is
  // gone is still caught in the same pass.
  const created = await db
    .select()
    .from(folders)
    .where(eq(folders.createdBy, memberId))
    .orderBy(desc(folders.depth));

  const child = alias(folders, "child");
  for (const folder of created) {
    await db.delete(folders).where(
      and(
        eq(folders.id, folder.id),
        notExists(
          db
            .select({ one: sql`1` })
            .from(files)
            .where(eq(files.folderId, folder.id)),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(child)
            .where(eq(child.parentId, folder.id)),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/files test gdpr`
Expected: PASS (all `deleteFilesByMember` cases). If the DB is unreachable: `pnpm db:up`.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter @bdas/files typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add modules/files/src/services/gdpr.ts modules/files/src/services/gdpr.test.ts
git commit -m "feat(files): deleteFilesByMember (DSGVO Art. 17 purge step)

Real deletion of the Storage blob + row for every file the member uploaded,
replacing reliance on the uploaded_by CASCADE (which deleted rows but
leaked objects). Folders the member created are removed only once the
purge leaves them empty — never a non-empty folder, since folders are
shared organizational spaces (no private scope exists) and created_by is
metadata, not ownership.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the resolver at boot

**Files:**

- Modify: `apps/web/lib/files-bootstrap.ts`

**Interfaces:**

- Consumes: `setMemberIdResolver` from `@bdas/files`; `getMemberByUserId` from `@bdas/members`.

No isolated test — this is composition-time wiring with no behavior of its own; it's exercised the moment `deleteFilesByMember`/`exportForUser` are ever called through a booted app (the later orchestrator PR's e2e coverage). Matches how PR2's equivalent notifications wiring had no dedicated test either.

- [ ] **Step 1: Add the import**

In `apps/web/lib/files-bootstrap.ts`, change:

```ts
import { ensureFolders, registerFilesSubscribers } from "@bdas/files";
```

to:

```ts
import { ensureFolders, registerFilesSubscribers, setMemberIdResolver } from "@bdas/files";
```

Add a new import line:

```ts
import { getMemberByUserId } from "@bdas/members";
```

- [ ] **Step 2: Wire the resolver in `bootFiles`**

In `bootFiles()`, after the storage-client `if/else if` block and before `registerFilesSubscribers(getDb());`, add:

```ts
setMemberIdResolver({
  async resolveMemberId(db: Db, userId: string): Promise<string | null> {
    const member = await getMemberByUserId(db, userId);
    return member?.id ?? null;
  },
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bdas/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add apps/web/lib/files-bootstrap.ts
git commit -m "feat(files): wire MemberIdResolver at boot

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Public exports + full verification

**Files:**

- Modify: `modules/files/src/index.ts`

**Interfaces:**

- Produces: `deleteFilesByMember`, `exportForUser`, `type FileExportRow`, `getMemberIdResolver`, `setMemberIdResolver`, `type MemberIdResolver` — all now part of `@bdas/files`'s public surface (Rule 8).

- [ ] **Step 1: Add the service exports**

**Note (2026-09-23 ruling, see ledger):** Task 4 already added the `export { getMemberIdResolver, setMemberIdResolver, type MemberIdResolver } from "./resolver";` line — `apps/web/lib/files-bootstrap.ts` needed to `import { setMemberIdResolver } from "@bdas/files"`, which cannot typecheck unless the module's public surface already exports it, so Task 4's implementer added it as a necessary prerequisite. Only the `gdpr.ts` line remains for this step.

In `modules/files/src/index.ts`, after the existing `export { registerFilesSubscribers, unregisterFilesSubscribers } from "./subscribers";` line, the resolver export line is already present. Add just:

```ts
export { deleteFilesByMember, exportForUser, type FileExportRow } from "./services/gdpr";
```

- [ ] **Step 2: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: no errors (confirms nothing outside `files` broke and the new exports resolve).

- [ ] **Step 3: Run the full test suite**

Run: `pnpm db:up && pnpm test`
Expected: all suites pass, including the new `gdpr.test.ts` and the extended `index.test.ts`.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add modules/files/src/index.ts
git commit -m "feat(files): export account-deletion purge/export surface

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Self-Review

- **Spec coverage:** implements the `files`-owned half of spec §3 (`file_access_log` FK migration), §5 step 1 (`deleteFilesByMember`, including the "Storage-Blobs + Zeilen + Ordner" real-deletion requirement, scoped per the confirmed empty-folder-only reading), and the `files` slice of §6 (`exportForUser`, metadata only). Orchestrator wiring (§5's numbered sequence as a whole), the cron route, and CSV/ZIP bundling (§6's `Notifier` attachments) are later PRs by design. ✓
- **Placeholder scan:** none — every step has full code, no TBD/TODO. ✓
- **Type consistency:** `FileExportRow` (Task 2) is used identically in `gdpr.ts` and `index.ts`'s re-export. `deleteFilesByMember`/`exportForUser` signatures match between `gdpr.ts`, `gdpr.test.ts`'s imports, and `index.ts`. `MemberIdResolver`'s shape in `resolver.ts` matches its usage in `files-bootstrap.ts` (Task 4) and `gdpr.test.ts`'s `setMemberIdResolver` calls (Task 2/3). `FileStatus` is re-exported type-only from `schema.ts` rather than duplicated. ✓
- **Rule 1 boundary:** confirmed no file in `modules/files/src/**` imports `@bdas/members`; only `apps/web/lib/files-bootstrap.ts` does (Task 4), matching the `notifications` precedent exactly. ✓
- **Rule 7 boundary:** the migration lives in `modules/files/migrations/`, filename-ordered, no `infra/migrations/manifest.ts` change. ✓
- **Destructive-path safety:** `deleteFilesByMember`'s folder cleanup is tested for the two cases that matter most — a folder that becomes empty (deleted) and a folder still holding another member's file (kept, `created_by` untouched) — plus a nested-chain case and idempotency. This is the specific behavior confirmed with the user before writing this plan (2026-09-23), not the literal-but-unsafe spec reading. ✓
- **Scope:** no orchestrator, no cron route, no other module touched — matches "PR4: Files" in the confirmed PR sequence (PR1 auth, PR2 notifications, PR3 deletion UI, **PR4 files**, PR5 blog, PR6 events, PR7 export completion, PR8 orchestrator/cron). ✓

Plan complete and saved to `docs/superpowers/plans/2026-09-23-account-deletion-pr4-files.md`.

Per your instruction: **Subagent-Driven** execution (superpowers:subagent-driven-development — fresh subagent per task, review between tasks) with **`/security-review`** run on the branch before it's considered done, since this PR deletes real Storage objects irreversibly.

Ready to start Task 1?
