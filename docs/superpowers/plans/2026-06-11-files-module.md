# Files Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend `files` module — a role-scoped file repository with two-phase signed-URL uploads, idempotent folder provisioning, and full audit logging — plus the concrete Supabase Storage driver, flag-off and fully tested, with no UI.

**Architecture:** A new `@bdas/files` workspace module owns `folders`, `files`, `file_access_log`. Bytes never pass through the app: uploads are a two-phase commit (`requestUpload` mints a signed PUT URL after gating on declared size/MIME/quota; the client PUTs direct to Supabase; `confirmUpload` re-checks the real object size via the storage driver before the row becomes visible). Folders are system-provisioned at boot (`ensureFolders`, idempotent) and on the `groups.group.created` event. Permission is decided only inside the module's services, reusing `members`' role primitives. The concrete `SupabaseStorageClient` implements the existing `core/storage` interface and is injected at `apps/web` composition.

**Tech Stack:** TypeScript, Drizzle ORM + Postgres, `@supabase/supabase-js` (storage), Next.js 14 `instrumentation.ts` boot hook, Vitest (pure unit + Docker-Postgres integration).

**Design source:** `docs/superpowers/specs/2026-06-11-files-module-design.md`. Product spec: `docs/bdas-platform-spec.md` §11.

---

## File structure

**New module `modules/files/`:**

- `package.json` — `@bdas/files` workspace package.
- `tsconfig.json` — extends repo base.
- `README.md` — module README (CLAUDE.md §1 rule 5).
- `migrations/0001_init.sql` — `folders`, `files`, `file_access_log` DDL. (`files` is already listed in `infra/migrations/src/manifest.ts:20`.)
- `src/schema.ts` — Drizzle table definitions.
- `src/types.ts` — `Folder`, `FileMeta`, `FolderScope`, `FileStatus`, `AccessAction`.
- `src/constants.ts` — `MAX_FILE_BYTES`, `FOLDER_QUOTA_BYTES`, `ALLOWED_MIME`.
- `src/permissions.ts` — pure `canRead(folder, me)` / `canWrite(folder, me)`.
- `src/permissions.test.ts` — table-driven matrix (no DB).
- `src/services/folders.ts` — `ensureFolders`, `listFolders`, internal `getFolder`/`rowToFolder`.
- `src/services/files.ts` — `requestUpload`, `confirmUpload`, `listFiles`, `getDownloadUrl`, `deleteFile`, `sweepStalePendingUploads`.
- `src/subscribers.ts` — `registerFilesSubscribers`, `unregisterFilesSubscribers`.
- `src/index.ts` — public surface (CLAUDE.md §1 rule 8).
- `src/index.test.ts` — Docker-Postgres integration tests (harness + all service tests).

**`core/storage` (package `@bdas/storage`):**

- `package.json` — add `@supabase/supabase-js`.
- `src/index.ts` — extend `StorageClient` with `statObject`; re-export the driver.
- `src/supabase.ts` — `SupabaseStorageClient`.
- `src/supabase.test.ts` — unit test, SDK mocked.

**`modules/members`:**

- `src/index.ts` — export `isFederalBoard`, `canManageGroup`.
- `src/index.export.test.ts` — assert the re-exports behave.

**`apps/web`:**

- `lib/files-bootstrap.ts` — `bootFiles()` composition.
- `instrumentation.ts` — call `bootFiles()`.
- `next.config.mjs` — transpile `@bdas/storage`, `@bdas/files`.
- `package.json` — add `@bdas/files`, `@bdas/storage`.
- repo `.env.example` — add `SUPABASE_STORAGE_BUCKET`.

**Docs:**

- `docs/decisions/0012-files-module-deviations.md` — ratify the §11 deviations.

---

### Task 1: Scaffold the `@bdas/files` package (types + constants)

**Files:**

- Create: `modules/files/package.json`
- Create: `modules/files/tsconfig.json`
- Create: `modules/files/src/types.ts`
- Create: `modules/files/src/constants.ts`
- Test: `modules/files/src/constants.test.ts`

- [ ] **Step 1: Create the package manifest**

`modules/files/package.json` (mirrors `modules/notifications/package.json`, swapping deps):

```json
{
  "name": "@bdas/files",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --dir src"
  },
  "dependencies": {
    "@bdas/db": "workspace:*",
    "@bdas/errors": "workspace:*",
    "@bdas/events": "workspace:*",
    "@bdas/groups": "workspace:*",
    "@bdas/id": "workspace:*",
    "@bdas/members": "workspace:*",
    "@bdas/storage": "workspace:*",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.5"
  },
  "devDependencies": {
    "tsx": "^4.19.1"
  }
}
```

- [ ] **Step 2: Create the tsconfig**

`modules/files/tsconfig.json` (copy `modules/notifications/tsconfig.json` verbatim — read it first and reproduce its exact contents so compiler options match the workspace).

- [ ] **Step 3: Create the domain types**

`modules/files/src/types.ts`:

```ts
/**
 * Public types for the files module. `storage_key` is deliberately NOT exposed
 * on FileMeta — it is an internal object-store address, never handed to callers.
 */
export type FolderScope = "members_all" | "group_members" | "local_board" | "federal_board";
export type FileStatus = "pending" | "ready";
export type AccessAction = "download" | "upload" | "delete";

export type Folder = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly scope: FolderScope;
  readonly groupId: string | null;
  readonly description: string;
  readonly createdAt: Date;
  readonly createdBy: string | null;
};

export type FileMeta = {
  readonly id: string;
  readonly folderId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly status: FileStatus;
  readonly uploadedBy: string;
  readonly uploadedAt: Date;
  readonly lastModifiedAt: Date;
};

export type UploadRequest = {
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
};
```

- [ ] **Step 4: Write the failing constants test**

`modules/files/src/constants.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ALLOWED_MIME, FOLDER_QUOTA_BYTES, MAX_FILE_BYTES } from "./constants";

describe("files constants", () => {
  it("caps a single file at 25 MB and a folder at 5 GB", () => {
    expect(MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(FOLDER_QUOTA_BYTES).toBe(5 * 1024 * 1024 * 1024);
  });

  it("allows common document/image types and rejects executables", () => {
    expect(ALLOWED_MIME.has("application/pdf")).toBe(true);
    expect(ALLOWED_MIME.has("image/png")).toBe(true);
    expect(ALLOWED_MIME.has("application/x-msdownload")).toBe(false);
    expect(ALLOWED_MIME.has("application/octet-stream")).toBe(false);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @bdas/files exec vitest run src/constants.test.ts`
Expected: FAIL — `./constants` cannot be resolved.

- [ ] **Step 6: Implement the constants**

`modules/files/src/constants.ts`:

```ts
/** Spec §11: 25 MB per-file cap, 5 GB per-folder quota. Code constants for v1; */
/** per-scope override (federal board) is a Phase 3 dashboard concern (YAGNI). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const FOLDER_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * Conservative MIME allowlist enforced at requestUpload. Documents, images,
 * plain text/CSV, and zip archives. Executables and unknown binary types are
 * rejected. The federation can widen this later.
 */
export const ALLOWED_MIME: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/zip",
]);
```

- [ ] **Step 7: Install workspace deps and run the test to verify it passes**

Run: `pnpm install && pnpm --filter @bdas/files exec vitest run src/constants.test.ts`
Expected: PASS (2 tests). `pnpm install` links the new workspace package.

- [ ] **Step 8: Commit**

```bash
git add modules/files/package.json modules/files/tsconfig.json modules/files/src/types.ts modules/files/src/constants.ts modules/files/src/constants.test.ts pnpm-lock.yaml
git commit -m "feat(files): scaffold @bdas/files package with domain types + constants

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migration + Drizzle schema + integration-test harness

**Files:**

- Create: `modules/files/migrations/0001_init.sql`
- Create: `modules/files/src/schema.ts`
- Test: `modules/files/src/index.test.ts`

`files` is already in `infra/migrations/src/manifest.ts:20` (after `members`), so no manifest edit is needed. FK chain: `folders.group_id → groups(id)`, `folders.created_by → members(id)`, `files.folder_id → folders(id)`, `files.uploaded_by → members(id)`, `file_access_log.member_id → members(id)`, `file_access_log.file_id → files(id)`.

- [ ] **Step 1: Write the migration DDL**

`modules/files/migrations/0001_init.sql`:

```sql
-- Files module — initial schema (spec §11, Phase 2).
-- Owns: folders, files, file_access_log.
-- Runs after members per infra/migrations/src/manifest.ts (folders FK groups+members).

CREATE TABLE folders (
  id           text PRIMARY KEY,
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  scope        text NOT NULL,
  group_id     text REFERENCES groups(id) ON DELETE CASCADE,
  description  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   text REFERENCES members(id) ON DELETE SET NULL,

  CONSTRAINT folders_scope_chk CHECK (
    scope IN ('members_all', 'group_members', 'local_board', 'federal_board')
  ),
  -- group_id required for group-scoped folders, null for the two singletons
  CONSTRAINT folders_scope_group_chk CHECK (
    (scope IN ('group_members', 'local_board') AND group_id IS NOT NULL)
    OR (scope IN ('members_all', 'federal_board') AND group_id IS NULL)
  ),
  -- one folder per (scope, group) — makes ensureFolders an idempotent upsert
  CONSTRAINT folders_scope_group_uq UNIQUE (scope, group_id)
);

CREATE TABLE files (
  id                text PRIMARY KEY,
  folder_id         text NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  filename          text NOT NULL,
  storage_key       text NOT NULL UNIQUE,
  mime_type         text NOT NULL,
  size_bytes        bigint NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  uploaded_by       text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  last_modified_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT files_status_chk CHECK (status IN ('pending', 'ready'))
);

CREATE INDEX files_folder_idx ON files (folder_id);
CREATE INDEX files_status_idx ON files (status);

-- Audit log. file_id is ON DELETE SET NULL so a deleted file does not erase the
-- access trail (who/what/when survive); member_id cascades with GDPR deletion.
CREATE TABLE file_access_log (
  id         text PRIMARY KEY,
  file_id    text REFERENCES files(id) ON DELETE SET NULL,
  member_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  action     text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT file_access_log_action_chk CHECK (action IN ('download', 'upload', 'delete'))
);

CREATE INDEX file_access_log_file_idx ON file_access_log (file_id);
CREATE INDEX file_access_log_member_idx ON file_access_log (member_id);
```

- [ ] **Step 2: Write the Drizzle schema**

`modules/files/src/schema.ts`:

```ts
import { bigint, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

// Drizzle table definitions for query building. Authoritative DDL — FKs, CHECKs,
// the (scope, group_id) unique — lives in migrations/0001_init.sql.

export const folders = pgTable(
  "folders",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    scope: text("scope").notNull(),
    groupId: text("group_id"),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (t) => ({
    scopeGroupUq: unique("folders_scope_group_uq").on(t.scope, t.groupId),
  }),
);

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    folderId: text("folder_id").notNull(),
    filename: text("filename").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    status: text("status").notNull().default("pending"),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    folderIdx: index("files_folder_idx").on(t.folderId),
    statusIdx: index("files_status_idx").on(t.status),
  }),
);

export const fileAccessLog = pgTable(
  "file_access_log",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id"),
    memberId: text("member_id").notNull(),
    action: text("action").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fileIdx: index("file_access_log_file_idx").on(t.fileId),
    memberIdx: index("file_access_log_member_idx").on(t.memberId),
  }),
);
```

- [ ] **Step 3: Write the failing harness test**

`modules/files/src/index.test.ts` (this file is the single home for all DB-backed tests; later tasks append `describe` blocks):

```ts
/**
 * Files integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 *
 * Applies auth + groups + members + files migrations (the files FK chain).
 * A fake StorageClient is injected per-test so no real bucket is touched.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";
import { setStorage, type SignedUrl, type StorageClient } from "@bdas/storage";

import { fileAccessLog, files, folders } from "./schema";

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

/** Apply the FK chain the files tables depend on, in manifest order. */
async function applyMigrations(t: TestDb): Promise<void> {
  for (const file of [
    ["..", "..", "auth", "migrations", "0001_init.sql"],
    ["..", "..", "groups", "migrations", "0001_init.sql"],
    ["..", "..", "members", "migrations", "0001_init.sql"],
    ["..", "migrations", "0001_init.sql"],
  ]) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
}

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

/** Seed a group + an active member belonging to it. Returns their ids. */
async function seedGroupAndMember(
  t: TestDb,
  opts: { groupId?: string; memberId?: string; userId?: string; status?: string } = {},
): Promise<{ groupId: string; memberId: string }> {
  const groupId = opts.groupId ?? "grp_muc";
  const memberId = opts.memberId ?? "mbr_1";
  const userId = opts.userId ?? "usr_1";
  const status = opts.status ?? "active";
  await t.client`INSERT INTO groups (id, slug, name, city) VALUES (${groupId}, ${groupId}, 'München', 'München') ON CONFLICT DO NOTHING`;
  await t.client`INSERT INTO auth_users (id, email_normalized, email_display, status) VALUES (${userId}, ${userId + "@example.org"}, ${userId + "@example.org"}, 'active')`;
  await t.client`INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status) VALUES (${memberId}, ${userId}, 'Test', 'Member', ${groupId}, ${status})`;
  return { groupId, memberId };
}

describeIfDb("files schema", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
  });

  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("creates the three tables empty", async () => {
    expect(await t.db.select().from(folders)).toEqual([]);
    expect(await t.db.select().from(files)).toEqual([]);
    expect(await t.db.select().from(fileAccessLog)).toEqual([]);
  });

  it("enforces one folder per (scope, group_id)", async () => {
    await seedGroupAndMember(t);
    await t.client`INSERT INTO folders (id, slug, name, scope, group_id) VALUES ('fld_a', 'a', 'A', 'local_board', 'grp_muc')`;
    await expect(
      t.client`INSERT INTO folders (id, slug, name, scope, group_id) VALUES ('fld_b', 'b', 'B', 'local_board', 'grp_muc')`,
    ).rejects.toThrow();
  });
});
```

> The fake storage, seed, and migration helpers defined here are reused by every later integration test in this file. Do not duplicate them.

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts`
Expected: FAIL — `@bdas/storage` does not yet export `SignedUrl`/`StorageClient`/`statObject` (it lacks `statObject` until Task 3) **and** the migration files resolve but the assertions can't run. If the DB is unreachable the suite SKIPS (acceptable locally); bring up Postgres with `pnpm db:up` to actually exercise it.

> Note: this test depends on Task 3's `statObject` addition to `StorageClient`. If you are running tasks strictly in order, expect a type error on `statObject` until Task 3 lands — that is the failing state. Proceed to Task 3, then return and confirm this passes (it is re-run in Task 3 Step 7 and Task 11).

- [ ] **Step 5: Commit**

```bash
git add modules/files/migrations/0001_init.sql modules/files/src/schema.ts modules/files/src/index.test.ts
git commit -m "feat(files): folders/files/file_access_log schema + migration + test harness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Extend `core/storage` with `statObject` + the Supabase driver

**Files:**

- Modify: `core/storage/src/index.ts:18-29` (interface) and `:31-47` (stub)
- Modify: `core/storage/package.json`
- Create: `core/storage/src/supabase.ts`
- Test: `core/storage/src/supabase.test.ts`

`confirmUpload` must read the _actual_ uploaded object size, so the interface needs a stat method.

- [ ] **Step 1: Add `@supabase/supabase-js` to the package**

`core/storage/package.json` — add a `dependencies` block:

```json
{
  "name": "@bdas/storage",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --dir src"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

Run: `pnpm install`

- [ ] **Step 2: Extend the `StorageClient` interface and stub**

In `core/storage/src/index.ts`, add `statObject` to the interface (after `signedDownloadUrl`, before `deleteObject`):

```ts
  /** Real size of an uploaded object, or null if it does not exist. */
  statObject(storageKey: string): Promise<{ sizeBytes: number } | null>;
```

And add the matching method to `NotConfiguredStorageClient` (after `signedDownloadUrl`):

```ts
  async statObject(): Promise<{ sizeBytes: number } | null> {
    return this.fail();
  }
```

At the bottom of the file, re-export the driver:

```ts
export { SupabaseStorageClient } from "./supabase";
```

- [ ] **Step 3: Write the failing driver test**

`core/storage/src/supabase.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, createSignedUploadUrl, createSignedUrl, list, remove } = vi.hoisted(() => {
  const createSignedUploadUrl = vi.fn();
  const createSignedUrl = vi.fn();
  const list = vi.fn();
  const remove = vi.fn();
  const fromMock = vi.fn(() => ({ createSignedUploadUrl, createSignedUrl, list, remove }));
  return { fromMock, createSignedUploadUrl, createSignedUrl, list, remove };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: fromMock } }),
}));

import { SupabaseStorageClient } from "./supabase";

function makeClient(): SupabaseStorageClient {
  return new SupabaseStorageClient({
    url: "https://x.supabase.co",
    serviceRoleKey: "k",
    bucket: "files",
  });
}

describe("SupabaseStorageClient", () => {
  beforeEach(() => {
    createSignedUploadUrl.mockReset();
    createSignedUrl.mockReset();
    list.mockReset();
    remove.mockReset();
  });

  it("mints a signed upload URL", async () => {
    createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: "https://up" }, error: null });
    const res = await makeClient().signedUploadUrl({
      storageKey: "a/b/f.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    expect(res.url).toBe("https://up");
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(fromMock).toHaveBeenCalledWith("files");
    expect(createSignedUploadUrl).toHaveBeenCalledWith("a/b/f.pdf");
  });

  it("mints a signed download URL honoring ttl", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://dl" }, error: null });
    const res = await makeClient().signedDownloadUrl({ storageKey: "a/b/f.pdf", ttlSeconds: 60 });
    expect(res.url).toBe("https://dl");
    expect(createSignedUrl).toHaveBeenCalledWith("a/b/f.pdf", 60);
  });

  it("statObject returns the matching object's size", async () => {
    list.mockResolvedValue({ data: [{ name: "f.pdf", metadata: { size: 1234 } }], error: null });
    const res = await makeClient().statObject("a/b/f.pdf");
    expect(res).toEqual({ sizeBytes: 1234 });
    expect(list).toHaveBeenCalledWith("a/b", { limit: 100, search: "f.pdf" });
  });

  it("statObject returns null when the object is absent", async () => {
    list.mockResolvedValue({ data: [], error: null });
    expect(await makeClient().statObject("a/b/f.pdf")).toBeNull();
  });

  it("throws on a Supabase error result", async () => {
    remove.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(makeClient().deleteObject("a/b/f.pdf")).rejects.toThrow("nope");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @bdas/storage exec vitest run src/supabase.test.ts`
Expected: FAIL — `./supabase` does not exist.

- [ ] **Step 5: Implement the driver**

`core/storage/src/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { SignedUrl, StorageClient } from "./index";

const DEFAULT_UPLOAD_TTL = 7200; // Supabase signed upload URLs default to ~2h
const DEFAULT_DOWNLOAD_TTL = 300;

export type SupabaseStorageOptions = {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly bucket: string;
};

/** Splits "a/b/f.pdf" → { dir: "a/b", base: "f.pdf" }. dir is "" at the root. */
function splitKey(storageKey: string): { dir: string; base: string } {
  const i = storageKey.lastIndexOf("/");
  if (i === -1) return { dir: "", base: storageKey };
  return { dir: storageKey.slice(0, i), base: storageKey.slice(i + 1) };
}

export class SupabaseStorageClient implements StorageClient {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(opts: SupabaseStorageOptions) {
    this.client = createClient(opts.url, opts.serviceRoleKey, {
      auth: { persistSession: false },
    });
    this.bucket = opts.bucket;
  }

  async signedUploadUrl(args: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    ttlSeconds?: number;
  }): Promise<SignedUrl> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(args.storageKey);
    if (error) throw new Error(error.message);
    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + (args.ttlSeconds ?? DEFAULT_UPLOAD_TTL) * 1000),
    };
  }

  async signedDownloadUrl(args: { storageKey: string; ttlSeconds?: number }): Promise<SignedUrl> {
    const ttl = args.ttlSeconds ?? DEFAULT_DOWNLOAD_TTL;
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(args.storageKey, ttl);
    if (error) throw new Error(error.message);
    return { url: data.signedUrl, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  async statObject(storageKey: string): Promise<{ sizeBytes: number } | null> {
    const { dir, base } = splitKey(storageKey);
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .list(dir, { limit: 100, search: base });
    if (error) throw new Error(error.message);
    const match = data?.find((o) => o.name === base);
    const size = match?.metadata?.["size"];
    return typeof size === "number" ? { sizeBytes: size } : null;
  }

  async deleteObject(storageKey: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([storageKey]);
    if (error) throw new Error(error.message);
  }
}
```

- [ ] **Step 6: Run the driver test to verify it passes**

Run: `pnpm --filter @bdas/storage exec vitest run src/supabase.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Re-run the files harness test (now that `statObject` exists)**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts`
Expected: PASS if Postgres is up (2 tests), otherwise SKIP. No type error on `statObject`.

- [ ] **Step 8: Commit**

```bash
git add core/storage/package.json core/storage/src/index.ts core/storage/src/supabase.ts core/storage/src/supabase.test.ts pnpm-lock.yaml
git commit -m "feat(storage): add statObject + concrete SupabaseStorageClient driver

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Export role primitives from `members`

**Files:**

- Modify: `modules/members/src/index.ts`
- Test: `modules/members/src/index.export.test.ts`

`files` permission logic reuses `isFederalBoard` / `canManageGroup` (which own role semantics) rather than re-deriving them. They are pure functions in `modules/members/src/roles.ts`; promote them to the public surface.

- [ ] **Step 1: Write the failing re-export test**

`modules/members/src/index.export.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { canManageGroup, isFederalBoard } from "./index";
import type { Grant } from "./index";

describe("members public role primitives", () => {
  const federal: Grant[] = [{ role: "federal_board", groupId: null }];
  const localMuc: Grant[] = [{ role: "local_board", groupId: "grp_muc" }];

  it("isFederalBoard is true only with a federal_board grant", () => {
    expect(isFederalBoard(federal)).toBe(true);
    expect(isFederalBoard(localMuc)).toBe(false);
  });

  it("canManageGroup: federal manages any group; local only its own", () => {
    expect(canManageGroup(federal, "grp_xyz")).toBe(true);
    expect(canManageGroup(localMuc, "grp_muc")).toBe(true);
    expect(canManageGroup(localMuc, "grp_other")).toBe(false);
    expect(canManageGroup(localMuc, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bdas/members exec vitest run src/index.export.test.ts`
Expected: FAIL — `canManageGroup` / `isFederalBoard` are not exported from `./index`.

- [ ] **Step 3: Add the exports**

In `modules/members/src/index.ts`, add (near the other role-related exports, e.g. after the `grantRole`/`revokeRole` line):

```ts
export { isFederalBoard, canManageGroup } from "./roles";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bdas/members exec vitest run src/index.export.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add modules/members/src/index.ts modules/members/src/index.export.test.ts
git commit -m "feat(members): export isFederalBoard + canManageGroup for files module

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Permission functions (pure) + matrix test

**Files:**

- Create: `modules/files/src/permissions.ts`
- Test: `modules/files/src/permissions.test.ts`

- [ ] **Step 1: Write the failing matrix test**

`modules/files/src/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { CurrentMember, Grant, Member } from "@bdas/members";

import { canRead, canWrite } from "./permissions";
import type { Folder } from "./types";

function folder(scope: Folder["scope"], groupId: string | null): Folder {
  return {
    id: "fld_x",
    slug: "x",
    name: "X",
    scope,
    groupId,
    description: "",
    createdAt: new Date(),
    createdBy: null,
  };
}

function member(over: Partial<Member> = {}): Member {
  return {
    id: "mbr_1",
    userId: "usr_1",
    firstName: "T",
    lastName: "M",
    primaryGroupId: "grp_muc",
    status: "active",
    joinedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function me(grants: Grant[], m: Member | null = member()): CurrentMember {
  return {
    user: { id: "usr_1", email: "t@x.org", roles: [] } as CurrentMember["user"],
    member: m,
    grants,
  };
}

const FED: Grant[] = [{ role: "federal_board", groupId: null }];
const LOCAL_MUC: Grant[] = [{ role: "local_board", groupId: "grp_muc" }];
const PLAIN: Grant[] = [{ role: "member", groupId: null }];

describe("canRead", () => {
  it("members_all: any active member, not inactive", () => {
    expect(canRead(folder("members_all", null), me(PLAIN))).toBe(true);
    expect(canRead(folder("members_all", null), me(PLAIN, member({ status: "inactive" })))).toBe(
      false,
    );
  });

  it("group_members: only active members of that group", () => {
    expect(canRead(folder("group_members", "grp_muc"), me(PLAIN))).toBe(true);
    expect(canRead(folder("group_members", "grp_other"), me(PLAIN))).toBe(false);
  });

  it("local_board: that group's board or federal", () => {
    expect(canRead(folder("local_board", "grp_muc"), me(LOCAL_MUC))).toBe(true);
    expect(canRead(folder("local_board", "grp_muc"), me(FED))).toBe(true);
    expect(canRead(folder("local_board", "grp_muc"), me(PLAIN))).toBe(false);
  });

  it("federal_board: only federal", () => {
    expect(canRead(folder("federal_board", null), me(FED))).toBe(true);
    expect(canRead(folder("federal_board", null), me(LOCAL_MUC))).toBe(false);
  });
});

describe("canWrite", () => {
  it("members_all + federal_board: federal only", () => {
    expect(canWrite(folder("members_all", null), me(FED))).toBe(true);
    expect(canWrite(folder("members_all", null), me(PLAIN))).toBe(false);
    expect(canWrite(folder("federal_board", null), me(FED))).toBe(true);
    expect(canWrite(folder("federal_board", null), me(LOCAL_MUC))).toBe(false);
  });

  it("group_members + local_board: that group's board (federal too)", () => {
    expect(canWrite(folder("group_members", "grp_muc"), me(LOCAL_MUC))).toBe(true);
    expect(canWrite(folder("local_board", "grp_muc"), me(LOCAL_MUC))).toBe(true);
    expect(canWrite(folder("group_members", "grp_muc"), me(FED))).toBe(true);
    expect(canWrite(folder("group_members", "grp_muc"), me(PLAIN))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bdas/files exec vitest run src/permissions.test.ts`
Expected: FAIL — `./permissions` does not exist.

- [ ] **Step 3: Implement the permission functions**

`modules/files/src/permissions.ts`:

```ts
import { canManageGroup, isFederalBoard, type CurrentMember } from "@bdas/members";

import type { Folder } from "./types";

/**
 * May this member read the folder? (spec §11 taxonomy)
 *  members_all   → any active member
 *  group_members → active member of that group
 *  local_board   → that group's board, or federal (canManageGroup covers both)
 *  federal_board → federal only
 */
export function canRead(folder: Folder, me: CurrentMember): boolean {
  const { member, grants } = me;
  switch (folder.scope) {
    case "members_all":
      return member?.status === "active";
    case "group_members":
      return member?.status === "active" && member.primaryGroupId === folder.groupId;
    case "local_board":
      return canManageGroup(grants, folder.groupId);
    case "federal_board":
      return isFederalBoard(grants);
  }
}

/**
 * May this member upload/delete in the folder?
 *  members_all / federal_board → federal only
 *  group_members / local_board → that group's board (federal included)
 */
export function canWrite(folder: Folder, me: CurrentMember): boolean {
  const { grants } = me;
  switch (folder.scope) {
    case "members_all":
    case "federal_board":
      return isFederalBoard(grants);
    case "group_members":
    case "local_board":
      return canManageGroup(grants, folder.groupId);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bdas/files exec vitest run src/permissions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add modules/files/src/permissions.ts modules/files/src/permissions.test.ts
git commit -m "feat(files): pure canRead/canWrite permission matrix over the four scopes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Folder provisioning + listing (`ensureFolders`, `listFolders`)

**Files:**

- Create: `modules/files/src/services/folders.ts`
- Test: `modules/files/src/index.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing test**

Add to `modules/files/src/index.test.ts` (after the `files schema` describe, reusing the file's helpers). Add these imports to the existing import block at the top:

```ts
import { ensureFolders, listFolders } from "./services/folders";
import type { CurrentMember, Grant } from "@bdas/members";
```

Add a small local helper near the other helpers:

```ts
function meWith(grants: Grant[], member: CurrentMember["member"]): CurrentMember {
  return {
    user: { id: "usr_1", email: "t@x.org", roles: [] } as CurrentMember["user"],
    member,
    grants,
  };
}
```

Then the describe block:

```ts
describeIfDb("ensureFolders / listFolders", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("provisions the two singletons + two folders per group, idempotently", async () => {
    await seedGroupAndMember(t, { groupId: "grp_muc", memberId: "mbr_1", userId: "usr_1" });
    await t.client`INSERT INTO groups (id, slug, name, city) VALUES ('grp_ber', 'ber', 'Berlin', 'Berlin')`;

    await ensureFolders(t.db);
    await ensureFolders(t.db); // second run must not duplicate

    const rows = await t.db.select().from(folders);
    // 2 singletons + 2 groups × 2 = 6
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.scope === "members_all")).toHaveLength(1);
    expect(rows.filter((r) => r.scope === "federal_board")).toHaveLength(1);
    expect(rows.filter((r) => r.scope === "group_members")).toHaveLength(2);
    expect(rows.filter((r) => r.scope === "local_board")).toHaveLength(2);
  });

  it("listFolders returns only folders the member can read", async () => {
    await seedGroupAndMember(t, { groupId: "grp_muc", memberId: "mbr_1", userId: "usr_1" });
    await t.client`INSERT INTO groups (id, slug, name, city) VALUES ('grp_ber', 'ber', 'Berlin', 'Berlin')`;
    await ensureFolders(t.db);

    const plainMucMember = meWith([{ role: "member", groupId: null }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const visible = await listFolders(t.db, plainMucMember);
    const scopes = visible.map((f) => `${f.scope}:${f.groupId ?? ""}`).sort();
    // members_all + own group_members only; no board/federal/other-group folders
    expect(scopes).toEqual(["group_members:grp_muc", "members_all:"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts -t "ensureFolders"`
Expected: FAIL — `./services/folders` does not exist (or SKIP if no DB; bring up `pnpm db:up`).

- [ ] **Step 3: Implement the folder service**

`modules/files/src/services/folders.ts`:

```ts
import { eq } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { createId } from "@bdas/id";
import type { CurrentMember } from "@bdas/members";

import { canRead } from "../permissions";
import { folders } from "../schema";
import type { Folder } from "../types";

type FolderRow = typeof folders.$inferSelect;

export function rowToFolder(r: FolderRow): Folder {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    scope: r.scope as Folder["scope"],
    groupId: r.groupId,
    description: r.description,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
  };
}

const SINGLETONS: ReadonlyArray<{ slug: string; name: string; scope: Folder["scope"] }> = [
  { slug: "members-all", name: "Alle Mitglieder", scope: "members_all" },
  { slug: "federal-board", name: "Bundesvorstand", scope: "federal_board" },
];

/**
 * Idempotently provision every required folder: the two singletons + one
 * group_members and one local_board folder per existing group. Safe to re-run
 * (the (scope, group_id) unique makes each insert a no-op on conflict). Called
 * at boot and self-heals any folder a missed group.created event would leave.
 */
export async function ensureFolders(db: Db): Promise<void> {
  for (const s of SINGLETONS) {
    await db
      .insert(folders)
      .values({ id: createId("fld"), slug: s.slug, name: s.name, scope: s.scope, groupId: null })
      .onConflictDoNothing();
  }

  const groups = await listGroups(db);
  for (const g of groups) {
    await provisionGroupFolders(db, g.id, g.name);
  }
}

/** Create the two per-group folders for one group. Idempotent. */
export async function provisionGroupFolders(
  db: Db,
  groupId: string,
  groupName: string,
): Promise<void> {
  await db
    .insert(folders)
    .values({
      id: createId("fld"),
      slug: `group-members-${groupId}`,
      name: `${groupName} – Mitglieder`,
      scope: "group_members",
      groupId,
    })
    .onConflictDoNothing();
  await db
    .insert(folders)
    .values({
      id: createId("fld"),
      slug: `local-board-${groupId}`,
      name: `${groupName} – Vorstand`,
      scope: "local_board",
      groupId,
    })
    .onConflictDoNothing();
}

/** Internal: load one folder or throw NotFound. Not on the public surface. */
export async function getFolder(db: Db, folderId: string): Promise<Folder> {
  const rows = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
  const row = rows[0];
  if (!row) {
    const { NotFoundError } = await import("@bdas/errors");
    throw new NotFoundError("Ordner nicht gefunden.");
  }
  return rowToFolder(row);
}

/** Folders the member may read (spec §11). */
export async function listFolders(db: Db, forMember: CurrentMember): Promise<Folder[]> {
  const rows = await db.select().from(folders);
  return rows.map(rowToFolder).filter((f) => canRead(f, forMember));
}
```

> Replace the inline `await import("@bdas/errors")` with a top-level `import { NotFoundError } from "@bdas/errors";` — it is shown inline only to keep this snippet self-contained. Put the import with the others at the top of the file.

Corrected top-of-file imports for `folders.ts`:

```ts
import { eq } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { NotFoundError } from "@bdas/errors";
import { listGroups } from "@bdas/groups";
import { createId } from "@bdas/id";
import type { CurrentMember } from "@bdas/members";

import { canRead } from "../permissions";
import { folders } from "../schema";
import type { Folder } from "../types";
```

…and `getFolder` throws `new NotFoundError("Ordner nicht gefunden.")` directly.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts -t "ensureFolders"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add modules/files/src/services/folders.ts modules/files/src/index.test.ts
git commit -m "feat(files): idempotent ensureFolders + read-gated listFolders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Two-phase upload (`requestUpload`, `confirmUpload`)

**Files:**

- Create: `modules/files/src/services/files.ts`
- Test: `modules/files/src/index.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing test**

Add to the import block of `modules/files/src/index.test.ts`:

```ts
import { confirmUpload, requestUpload } from "./services/files";
```

Add the describe block:

```ts
describeIfDb("two-phase upload", () => {
  let t: TestDb;
  const boardMe = () =>
    meWith([{ role: "local_board", groupId: "grp_muc" }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  async function localBoardFolderId(): Promise<string> {
    const rows = await t.db.select().from(folders);
    return rows.find((f) => f.scope === "local_board" && f.groupId === "grp_muc")!.id;
  }

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
    await seedGroupAndMember(t, { groupId: "grp_muc", memberId: "mbr_1", userId: "usr_1" });
    await ensureFolders(t.db);
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("requestUpload inserts a pending row and returns an upload URL", async () => {
    const folderId = await localBoardFolderId();
    const { fileId, uploadUrl } = await requestUpload(
      t.db,
      folderId,
      { filename: "satzung.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
      boardMe(),
    );
    expect(uploadUrl.url).toContain("https://signed.example/put");
    const rows = await t.db.select().from(files);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fileId);
    expect(rows[0]?.status).toBe("pending");
  });

  it("requestUpload rejects a disallowed MIME type", async () => {
    const folderId = await localBoardFolderId();
    await expect(
      requestUpload(
        t.db,
        folderId,
        { filename: "x.exe", mimeType: "application/x-msdownload", sizeBytes: 10 },
        boardMe(),
      ),
    ).rejects.toThrow();
    expect(await t.db.select().from(files)).toHaveLength(0);
  });

  it("requestUpload rejects an over-cap declared size", async () => {
    const folderId = await localBoardFolderId();
    await expect(
      requestUpload(
        t.db,
        folderId,
        { filename: "big.pdf", mimeType: "application/pdf", sizeBytes: 26 * 1024 * 1024 },
        boardMe(),
      ),
    ).rejects.toThrow();
  });

  it("requestUpload denies a member who cannot write the folder", async () => {
    const folderId = await localBoardFolderId();
    const plain = meWith([{ role: "member", groupId: null }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(
      requestUpload(
        t.db,
        folderId,
        { filename: "x.pdf", mimeType: "application/pdf", sizeBytes: 10 },
        plain,
      ),
    ).rejects.toThrow();
  });

  it("confirmUpload promotes to ready when the real size is within cap", async () => {
    const folderId = await localBoardFolderId();
    setStorage(fakeStorage({ statObject: async () => ({ sizeBytes: 1000 }) }));
    const { fileId } = await requestUpload(
      t.db,
      folderId,
      { filename: "satzung.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
      boardMe(),
    );
    const meta = await confirmUpload(t.db, fileId, boardMe());
    expect(meta.status).toBe("ready");
    expect(meta.sizeBytes).toBe(1000);
    const log = await t.db.select().from(fileAccessLog);
    expect(log).toHaveLength(1);
    expect(log[0]?.action).toBe("upload");
  });

  it("confirmUpload rolls back when the real object exceeds the cap", async () => {
    const folderId = await localBoardFolderId();
    let removed: string | null = null;
    setStorage(
      fakeStorage({
        statObject: async () => ({ sizeBytes: 26 * 1024 * 1024 }),
        deleteObject: async (k) => {
          removed = k;
        },
      }),
    );
    const { fileId } = await requestUpload(
      t.db,
      folderId,
      { filename: "lie.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
      boardMe(),
    );
    await expect(confirmUpload(t.db, fileId, boardMe())).rejects.toThrow();
    expect(removed).not.toBeNull();
    expect(await t.db.select().from(files)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts -t "two-phase upload"`
Expected: FAIL — `./services/files` does not exist.

- [ ] **Step 3: Implement `requestUpload` + `confirmUpload`**

`modules/files/src/services/files.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@bdas/errors";
import { createId } from "@bdas/id";
import type { CurrentMember } from "@bdas/members";
import { getStorage, type SignedUrl } from "@bdas/storage";

import { ALLOWED_MIME, FOLDER_QUOTA_BYTES, MAX_FILE_BYTES } from "../constants";
import { canWrite } from "../permissions";
import { fileAccessLog, files } from "../schema";
import type { AccessAction, FileMeta, UploadRequest } from "../types";

import { getFolder } from "./folders";

type FileRow = typeof files.$inferSelect;

function rowToFileMeta(r: FileRow): FileMeta {
  return {
    id: r.id,
    folderId: r.folderId,
    filename: r.filename,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    status: r.status as FileMeta["status"],
    uploadedBy: r.uploadedBy,
    uploadedAt: r.uploadedAt,
    lastModifiedAt: r.lastModifiedAt,
  };
}

/** Every service entry point acts as a member; federal/board users have one. */
function requireActingMember(me: CurrentMember): { id: string } {
  if (!me.member) throw new ForbiddenError("Mitgliedsprofil erforderlich.");
  return { id: me.member.id };
}

/** Sum of READY file sizes in a folder (pending uploads never count). */
async function folderUsage(db: Db, folderId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${files.sizeBytes}), 0)` })
    .from(files)
    .where(and(eq(files.folderId, folderId), eq(files.status, "ready")));
  return Number(rows[0]?.total ?? 0);
}

async function writeAccessLog(
  db: Db,
  fileId: string | null,
  memberId: string,
  action: AccessAction,
): Promise<void> {
  await db.insert(fileAccessLog).values({ id: createId("fal"), fileId, memberId, action });
}

async function getFileRow(db: Db, fileId: string): Promise<FileRow> {
  const rows = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError("Datei nicht gefunden.");
  return row;
}

/**
 * Phase 1 of upload. Gates permission + MIME + cap + quota against the DECLARED
 * size, inserts a 'pending' row, and returns a signed PUT URL. The client PUTs
 * bytes direct to the object store; nothing is visible until confirmUpload.
 */
export async function requestUpload(
  db: Db,
  folderId: string,
  input: UploadRequest,
  byMember: CurrentMember,
): Promise<{ fileId: string; uploadUrl: SignedUrl }> {
  const actor = requireActingMember(byMember);
  const folder = await getFolder(db, folderId);
  if (!canWrite(folder, byMember))
    throw new ForbiddenError("Kein Schreibzugriff auf diesen Ordner.");

  if (!ALLOWED_MIME.has(input.mimeType)) throw new ValidationError("Dateityp nicht erlaubt.");
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_FILE_BYTES) {
    throw new ValidationError("Datei überschreitet die maximale Größe (25 MB).");
  }
  const used = await folderUsage(db, folderId);
  if (used + input.sizeBytes > FOLDER_QUOTA_BYTES) {
    throw new ValidationError("Ordner-Speicherkontingent überschritten (5 GB).");
  }

  const fileId = createId("fil");
  const storageKey = `${folder.scope}/${folder.groupId ?? "_"}/${fileId}/${input.filename}`;
  await db.insert(files).values({
    id: fileId,
    folderId,
    filename: input.filename,
    storageKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    status: "pending",
    uploadedBy: actor.id,
  });

  const uploadUrl = await getStorage().signedUploadUrl({
    storageKey,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });
  return { fileId, uploadUrl };
}

/**
 * Phase 2 of upload. Re-checks the ACTUAL object size server-side (the client
 * could have lied at request time), promotes the row to 'ready', and logs the
 * upload. On a missing object or a real-size/quota violation, deletes the object
 * and the pending row and throws — nothing half-uploaded ever becomes visible.
 */
export async function confirmUpload(
  db: Db,
  fileId: string,
  byMember: CurrentMember,
): Promise<FileMeta> {
  const actor = requireActingMember(byMember);
  const row = await getFileRow(db, fileId);
  const folder = await getFolder(db, row.folderId);
  if (!canWrite(folder, byMember))
    throw new ForbiddenError("Kein Schreibzugriff auf diesen Ordner.");

  const stat = await getStorage().statObject(row.storageKey);
  const rollback = async (): Promise<void> => {
    await getStorage().deleteObject(row.storageKey);
    await db.delete(files).where(eq(files.id, fileId));
  };

  if (!stat) {
    await db.delete(files).where(eq(files.id, fileId));
    throw new ValidationError("Es wurde keine hochgeladene Datei gefunden.");
  }
  if (stat.sizeBytes > MAX_FILE_BYTES) {
    await rollback();
    throw new ValidationError("Hochgeladene Datei überschreitet die maximale Größe (25 MB).");
  }
  const used = await folderUsage(db, row.folderId);
  if (used + stat.sizeBytes > FOLDER_QUOTA_BYTES) {
    await rollback();
    throw new ValidationError("Ordner-Speicherkontingent überschritten (5 GB).");
  }

  await db
    .update(files)
    .set({ status: "ready", sizeBytes: stat.sizeBytes, lastModifiedAt: new Date() })
    .where(eq(files.id, fileId));
  await writeAccessLog(db, fileId, actor.id, "upload");

  return rowToFileMeta({ ...row, status: "ready", sizeBytes: stat.sizeBytes });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts -t "two-phase upload"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add modules/files/src/services/files.ts modules/files/src/index.test.ts
git commit -m "feat(files): two-phase signed-URL upload (requestUpload + confirmUpload)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: `listFiles`, `getDownloadUrl`, `deleteFile` (+ audit)

**Files:**

- Modify: `modules/files/src/services/files.ts`
- Test: `modules/files/src/index.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing test**

Add to the import block of `index.test.ts`:

```ts
import { deleteFile, getDownloadUrl, listFiles } from "./services/files";
```

Add the describe block:

```ts
describeIfDb("listFiles / getDownloadUrl / deleteFile", () => {
  let t: TestDb;
  const boardMe = () =>
    meWith([{ role: "local_board", groupId: "grp_muc" }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  async function localBoardFolderId(): Promise<string> {
    const rows = await t.db.select().from(folders);
    return rows.find((f) => f.scope === "local_board" && f.groupId === "grp_muc")!.id;
  }
  async function makeReadyFile(): Promise<string> {
    const folderId = await localBoardFolderId();
    setStorage(fakeStorage({ statObject: async () => ({ sizeBytes: 500 }) }));
    const { fileId } = await requestUpload(
      t.db,
      folderId,
      { filename: "doc.pdf", mimeType: "application/pdf", sizeBytes: 500 },
      boardMe(),
    );
    await confirmUpload(t.db, fileId, boardMe());
    return fileId;
  }

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
    await seedGroupAndMember(t, { groupId: "grp_muc", memberId: "mbr_1", userId: "usr_1" });
    await ensureFolders(t.db);
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("listFiles returns only ready files and is read-gated", async () => {
    await makeReadyFile();
    const folderId = await localBoardFolderId();
    // a pending file in the same folder must not appear
    await requestUpload(
      t.db,
      folderId,
      { filename: "draft.pdf", mimeType: "application/pdf", sizeBytes: 10 },
      boardMe(),
    );

    const listed = await listFiles(t.db, folderId, boardMe());
    expect(listed).toHaveLength(1);
    expect(listed[0]?.filename).toBe("doc.pdf");
  });

  it("getDownloadUrl returns a URL and writes a 'download' log row", async () => {
    const fileId = await makeReadyFile();
    const url = await getDownloadUrl(t.db, fileId, boardMe());
    expect(url.url).toContain("https://signed.example/get");
    const log = await t.db.select().from(fileAccessLog);
    expect(log.filter((r) => r.action === "download")).toHaveLength(1);
  });

  it("deleteFile removes the row + object and logs 'delete'", async () => {
    const fileId = await makeReadyFile();
    let removed: string | null = null;
    setStorage(
      fakeStorage({
        statObject: async () => ({ sizeBytes: 500 }),
        deleteObject: async (k) => {
          removed = k;
        },
      }),
    );

    await deleteFile(t.db, fileId, boardMe());
    expect(removed).not.toBeNull();
    expect(await t.db.select().from(files)).toHaveLength(0);
    // delete log survives; its file_id is nulled by ON DELETE SET NULL
    const del = (await t.db.select().from(fileAccessLog)).filter((r) => r.action === "delete");
    expect(del).toHaveLength(1);
    expect(del[0]?.fileId).toBeNull();
  });

  it("getDownloadUrl denies a member without read access", async () => {
    const fileId = await makeReadyFile();
    const plain = meWith([{ role: "member", groupId: null }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(getDownloadUrl(t.db, fileId, plain)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts -t "listFiles"`
Expected: FAIL — `listFiles` / `getDownloadUrl` / `deleteFile` are not exported.

- [ ] **Step 3: Implement the three services**

Append to `modules/files/src/services/files.ts`. Add `canRead` to the permissions import at the top:

```ts
import { canRead, canWrite } from "../permissions";
```

Then add the functions:

```ts
/** Ready files in a folder, read-gated. Pending uploads are never listed. */
export async function listFiles(
  db: Db,
  folderId: string,
  forMember: CurrentMember,
): Promise<FileMeta[]> {
  requireActingMember(forMember);
  const folder = await getFolder(db, folderId);
  if (!canRead(folder, forMember)) throw new ForbiddenError("Kein Lesezugriff auf diesen Ordner.");
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.folderId, folderId), eq(files.status, "ready")));
  return rows.map(rowToFileMeta);
}

/** Signed download URL for one ready file. Read-gated; logs a 'download' row. */
export async function getDownloadUrl(
  db: Db,
  fileId: string,
  forMember: CurrentMember,
): Promise<SignedUrl> {
  const actor = requireActingMember(forMember);
  const row = await getFileRow(db, fileId);
  if (row.status !== "ready") throw new NotFoundError("Datei nicht gefunden.");
  const folder = await getFolder(db, row.folderId);
  if (!canRead(folder, forMember)) throw new ForbiddenError("Kein Lesezugriff auf diese Datei.");
  const url = await getStorage().signedDownloadUrl({ storageKey: row.storageKey });
  await writeAccessLog(db, fileId, actor.id, "download");
  return url;
}

/** Delete a file: object then row. Write-gated; logs 'delete' before removal. */
export async function deleteFile(db: Db, fileId: string, byMember: CurrentMember): Promise<void> {
  const actor = requireActingMember(byMember);
  const row = await getFileRow(db, fileId);
  const folder = await getFolder(db, row.folderId);
  if (!canWrite(folder, byMember)) throw new ForbiddenError("Kein Schreibzugriff auf diese Datei.");
  await writeAccessLog(db, fileId, actor.id, "delete");
  await getStorage().deleteObject(row.storageKey);
  await db.delete(files).where(eq(files.id, fileId));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts -t "listFiles"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add modules/files/src/services/files.ts modules/files/src/index.test.ts
git commit -m "feat(files): listFiles + getDownloadUrl + deleteFile with audit logging

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: `sweepStalePendingUploads`

**Files:**

- Modify: `modules/files/src/services/files.ts`
- Test: `modules/files/src/index.test.ts` (append a `describe`)

Abandoned `pending` rows (client never confirmed) accumulate. Provide a sweep; leave it unwired (Phase 3 cron).

- [ ] **Step 1: Append the failing test**

Add to the import block:

```ts
import { sweepStalePendingUploads } from "./services/files";
```

Add the describe block:

```ts
describeIfDb("sweepStalePendingUploads", () => {
  let t: TestDb;
  const boardMe = () =>
    meWith([{ role: "local_board", groupId: "grp_muc" }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  async function localBoardFolderId(): Promise<string> {
    const rows = await t.db.select().from(folders);
    return rows.find((f) => f.scope === "local_board" && f.groupId === "grp_muc")!.id;
  }

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
    await seedGroupAndMember(t, { groupId: "grp_muc", memberId: "mbr_1", userId: "usr_1" });
    await ensureFolders(t.db);
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("deletes pending rows older than the cutoff, keeps recent + ready", async () => {
    const folderId = await localBoardFolderId();
    const removed: string[] = [];
    setStorage(
      fakeStorage({
        statObject: async () => ({ sizeBytes: 5 }),
        deleteObject: async (k) => {
          removed.push(k);
        },
      }),
    );

    // an old pending upload
    const { fileId: oldPending } = await requestUpload(
      t.db,
      folderId,
      { filename: "old.pdf", mimeType: "application/pdf", sizeBytes: 5 },
      boardMe(),
    );
    await t.client`UPDATE files SET uploaded_at = now() - interval '2 days' WHERE id = ${oldPending}`;
    // a fresh pending upload
    await requestUpload(
      t.db,
      folderId,
      { filename: "fresh.pdf", mimeType: "application/pdf", sizeBytes: 5 },
      boardMe(),
    );

    const swept = await sweepStalePendingUploads(t.db, new Date(Date.now() - 24 * 3600 * 1000));
    expect(swept).toBe(1);
    expect(removed).toHaveLength(1);
    const remaining = await t.db.select().from(files);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.filename).toBe("fresh.pdf");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts -t "sweepStalePendingUploads"`
Expected: FAIL — `sweepStalePendingUploads` is not exported.

- [ ] **Step 3: Implement the sweep**

Append to `modules/files/src/services/files.ts`. Add `lt` to the drizzle-orm import:

```ts
import { and, eq, lt, sql } from "drizzle-orm";
```

Then:

```ts
/**
 * Delete pending uploads whose row predates `olderThan` — clients that requested
 * an upload but never confirmed. Removes the (possibly absent) object then the
 * row. Returns the count swept. Unwired in v1; Phase 3 attaches a cron.
 */
export async function sweepStalePendingUploads(db: Db, olderThan: Date): Promise<number> {
  const stale = await db
    .select()
    .from(files)
    .where(and(eq(files.status, "pending"), lt(files.uploadedAt, olderThan)));
  for (const row of stale) {
    try {
      await getStorage().deleteObject(row.storageKey);
    } catch {
      // object may never have been PUT; deleting the row is still correct
    }
    await db.delete(files).where(eq(files.id, row.id));
  }
  return stale.length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts -t "sweepStalePendingUploads"`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add modules/files/src/services/files.ts modules/files/src/index.test.ts
git commit -m "feat(files): sweepStalePendingUploads for abandoned two-phase uploads

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Event subscriber — provision folders on `groups.group.created`

**Files:**

- Create: `modules/files/src/subscribers.ts`
- Test: `modules/files/src/index.test.ts` (append a `describe`)

- [ ] **Step 1: Append the failing test**

Add to the import block:

```ts
import { getEventBus } from "@bdas/events";
import type { GroupCreated } from "@bdas/groups";
import { registerFilesSubscribers, unregisterFilesSubscribers } from "./subscribers";
```

Add the describe block:

```ts
describeIfDb("group.created subscriber", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
  });
  afterEach(async () => {
    unregisterFilesSubscribers();
    resetEventBus();
    await t.cleanup();
  });

  it("provisions the two folders for a newly created group", async () => {
    await t.client`INSERT INTO groups (id, slug, name, city) VALUES ('grp_new', 'new', 'Neustadt', 'Neustadt')`;
    registerFilesSubscribers(t.db);

    const event: GroupCreated = {
      type: "groups.group.created",
      groupId: "grp_new",
      slug: "new",
      at: new Date(),
    };
    await getEventBus().publish(event);

    const rows = (await t.db.select().from(folders)).filter((f) => f.groupId === "grp_new");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.scope).sort()).toEqual(["group_members", "local_board"]);

    // re-publish must not duplicate (idempotent)
    await getEventBus().publish(event);
    expect((await t.db.select().from(folders)).filter((f) => f.groupId === "grp_new")).toHaveLength(
      2,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts -t "group.created"`
Expected: FAIL — `./subscribers` does not exist.

- [ ] **Step 3: Implement the subscriber**

`modules/files/src/subscribers.ts`:

```ts
/**
 * Bridge the groups module's group.created event to folder provisioning, so a
 * new group gets its group_members + local_board folders without files reading
 * groups' tables (CLAUDE.md §1 rules 2/3). ensureFolders at boot self-heals any
 * group whose event was missed. Handlers never throw into the producer.
 */
import type { Db } from "@bdas/db";
import { getEventBus, type Subscription } from "@bdas/events";
import { getGroup, type GroupCreated } from "@bdas/groups";

import { provisionGroupFolders } from "./services/folders";

let subs: Subscription[] = [];

export function registerFilesSubscribers(db: Db): void {
  if (subs.length > 0) return;
  subs = [
    getEventBus().subscribe<GroupCreated>("groups.group.created", async (e) => {
      try {
        const group = await getGroup(db, e.groupId);
        const name = group?.name ?? e.slug;
        await provisionGroupFolders(db, e.groupId, name);
      } catch (err) {
        console.error(`[files] provisioning folders for group ${e.groupId} failed:`, err);
      }
    }),
  ];
}

/** Test helper: drop all subscriptions. Not part of the public surface. */
export function unregisterFilesSubscribers(): void {
  for (const s of subs) s.unsubscribe();
  subs = [];
}
```

> Verify `getGroup` is exported from `@bdas/groups` (it is — `modules/groups/src/index.ts` exports `getGroup`). It returns `Group | null`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bdas/files exec vitest run src/index.test.ts -t "group.created"`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add modules/files/src/subscribers.ts modules/files/src/index.test.ts
git commit -m "feat(files): provision per-group folders on groups.group.created

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Public surface (`index.ts`) + full module test run

**Files:**

- Create: `modules/files/src/index.ts`

- [ ] **Step 1: Write the public surface**

`modules/files/src/index.ts`:

```ts
/**
 * Public surface of the files module (CLAUDE.md §1 rule 8). Only symbols
 * re-exported here are visible outside the module; everything else is private.
 */
export { ensureFolders, listFolders } from "./services/folders";
export {
  requestUpload,
  confirmUpload,
  listFiles,
  getDownloadUrl,
  deleteFile,
  sweepStalePendingUploads,
} from "./services/files";
export { registerFilesSubscribers, unregisterFilesSubscribers } from "./subscribers";
export type {
  Folder,
  FileMeta,
  FolderScope,
  FileStatus,
  AccessAction,
  UploadRequest,
} from "./types";
```

- [ ] **Step 2: Typecheck the module**

Run: `pnpm --filter @bdas/files exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 3: Run the full module test suite**

Run: `pnpm --filter @bdas/files test`
Expected: PASS — `constants` (2) + `permissions` (6) pure tests always run; the integration `describe`s run if Postgres is up (`pnpm db:up`), otherwise SKIP. With DB up: schema (2) + ensureFolders (2) + two-phase (6) + listFiles (4) + sweep (1) + group.created (1).

- [ ] **Step 4: Commit**

```bash
git add modules/files/src/index.ts
git commit -m "feat(files): public index.ts surface

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Composition — `bootFiles`, instrumentation, config, env

**Files:**

- Create: `apps/web/lib/files-bootstrap.ts`
- Modify: `apps/web/instrumentation.ts`
- Modify: `apps/web/next.config.mjs`
- Modify: `apps/web/package.json`
- Modify: `.env.example`

> `apps/web` has no Vitest harness; this task verifies by typecheck + build (same constraint the notifications bootstrap task noted).

- [ ] **Step 1: Add the workspace deps to the web app**

In `apps/web/package.json`, add to `dependencies` (alphabetically near the other `@bdas/*`):

```json
    "@bdas/files": "workspace:*",
    "@bdas/storage": "workspace:*",
```

Run: `pnpm install`

- [ ] **Step 2: Write the bootstrap**

`apps/web/lib/files-bootstrap.ts`:

```ts
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { ensureFolders, registerFilesSubscribers } from "@bdas/files";
import { setStorage, SupabaseStorageClient } from "@bdas/storage";

let booted = false;

/**
 * Idempotent files bootstrap. Wires the Supabase storage driver, subscribes to
 * groups.group.created, and provisions folders — only when the `files` flag is
 * on, so the module is inert in production until acceptance-complete (rule 6
 * applied to a non-route module). In flag-on production with missing storage
 * config we fail loud; in dev/test the NotConfiguredStorageClient stays in place
 * (folder provisioning needs no object store, so dev still works).
 */
export async function bootFiles(): Promise<void> {
  if (booted) return;
  if (!isFlagOn("files")) return; // not latched — a flag-off boot must not permanently disable wiring

  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const bucket = process.env["SUPABASE_STORAGE_BUCKET"] ?? "files";

  if (url && serviceRoleKey) {
    setStorage(new SupabaseStorageClient({ url, serviceRoleKey, bucket }));
  } else if (process.env["VERCEL_ENV"] === "production") {
    throw new Error(
      "[files] flag is on but SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not both set",
    );
  }

  registerFilesSubscribers(getDb());
  await ensureFolders(getDb());

  booted = true;
}
```

- [ ] **Step 3: Call it from instrumentation**

In `apps/web/instrumentation.ts`, inside the `if (process.env.NEXT_RUNTIME === "nodejs")` block, after the existing `bootNotifications()` call, add:

```ts
const { bootFiles } = await import("./lib/files-bootstrap");
await bootFiles();
```

- [ ] **Step 4: Transpile the new packages**

In `apps/web/next.config.mjs`, add to the `transpilePackages` array (keep it grouped with the other `@bdas/*` entries):

```js
    "@bdas/files",
    "@bdas/storage",
```

- [ ] **Step 5: Document the storage bucket env var**

In `.env.example`, under the `===== Object storage (Phase 2 onward) =====` block (after `SUPABASE_SERVICE_ROLE_KEY=`), add:

```bash
# Storage bucket the files module reads/writes. Create it in Supabase first.
SUPABASE_STORAGE_BUCKET=files
```

- [ ] **Step 6: Typecheck + build the app**

Run: `pnpm --filter @bdas/web exec tsc --noEmit && pnpm --filter @bdas/web build`
Expected: PASS. The `files` flag is off in production, so `bootFiles()` returns early — no behavior change in prod; this only wires the seam.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/files-bootstrap.ts apps/web/instrumentation.ts apps/web/next.config.mjs apps/web/package.json .env.example pnpm-lock.yaml
git commit -m "feat(web): compose files module at boot (flag-gated, fail-loud on partial config)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: Module README + ADR 0012

**Files:**

- Create: `modules/files/README.md`
- Create: `docs/decisions/0012-files-module-deviations.md`

- [ ] **Step 1: Write the module README**

`modules/files/README.md`:

```markdown
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

Folders are system-provisioned (`ensureFolders` at boot + a
`groups.group.created` subscriber); they are not user-creatable in v1.

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

`listFolders`, `listFiles`, `getDownloadUrl`, `requestUpload`, `confirmUpload`,
`deleteFile`, `sweepStalePendingUploads`, `ensureFolders`,
`registerFilesSubscribers`. Every method enforces permission internally.

## Dependencies

`core/storage` (object I/O), `core/events` (group provisioning), `@bdas/members`
(role primitives), `@bdas/groups` (group list/lookup). No cross-module table
reads.

## Tests

`pnpm --filter @bdas/files test`. Pure permission/constant tests always run;
integration tests need Docker Postgres (`pnpm db:up`).
```

- [ ] **Step 2: Write ADR 0012**

`docs/decisions/0012-files-module-deviations.md`:

```markdown
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
```

- [ ] **Step 3: Verify no dangling references**

Run: `grep -rn "0012" docs/decisions/ && ls modules/files/README.md`
Expected: the ADR file matches and the README exists.

- [ ] **Step 4: Commit**

```bash
git add modules/files/README.md docs/decisions/0012-files-module-deviations.md
git commit -m "docs(files): module README + ADR 0012 recording §11 deviations

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 14: Full verification pass

- [ ] **Step 1: Run every touched package's tests**

Run: `pnpm --filter @bdas/files test && pnpm --filter @bdas/storage test && pnpm --filter @bdas/members test`
Expected: PASS. Files integration tests need `pnpm db:up`; without it those `describe`s SKIP (pure tests still run).

- [ ] **Step 2: Typecheck the workspace + build the app**

Run: `pnpm --filter @bdas/files exec tsc --noEmit && pnpm --filter @bdas/storage exec tsc --noEmit && pnpm --filter @bdas/web exec tsc --noEmit && pnpm --filter @bdas/web build`
Expected: PASS.

- [ ] **Step 3: Confirm the module boundary held**

Run: `grep -rnE "from \"@bdas/(members|groups)/src" modules/files/src && echo "DEEP IMPORT FOUND" || echo "no deep imports"`
Expected: `no deep imports` — files imports only package roots (`@bdas/members`, `@bdas/groups`), never internal paths.

- [ ] **Step 4: Confirm migration order is intact**

Run: `grep -n "files" infra/migrations/src/manifest.ts`
Expected: `files` appears after `members` (already present at line ~20). No edit needed.

- [ ] **Step 5: Security review**

`files` is an access-controlled, object-storage module — `/security-review` is mandatory before merge (CLAUDE.md §4; build-plan:128). Run it and address findings. Focus areas: permission bypass via forged folder/file IDs, the two-phase size-spoofing path, signed-URL TTLs, and storage-key construction (no path traversal from `filename`).

> **Storage-key note for the reviewer:** `requestUpload` builds `storageKey` as `${scope}/${groupId}/${fileId}/${filename}`. `fileId` is server-generated and unique, so collisions/overwrites are not possible, but `filename` is caller-controlled — confirm the Supabase bucket treats it as an opaque object name (it does; keys are not filesystem paths) and that nothing later re-derives a local path from it.

---

## Follow-ups (NOT in this plan)

1. **Phase 3 dashboard surfaces:** member-facing file browser + federal/local access-log tables; the `'view'` action; per-scope quota/cap configuration UI.
2. **Wire `sweepStalePendingUploads`** to a cron once the flag is on.
3. **Real-bucket smoke test** in CI against a disposable Supabase bucket (the unit test mocks the SDK; nothing here exercises live Supabase).
4. **`groups.group.archived` folder handling** if the federation later wants archival cleanup.

---

## Self-Review

- **Spec coverage (§11):** owns the three tables (Task 2); folder taxonomy + scopes (Tasks 2, 5, 6); upload/list/download/delete gated server-side (Tasks 7, 8); 25 MB cap + 5 GB quota before upload (Task 7, re-verified Task 7 confirm); signed-URL-only, no byte proxying (Tasks 3, 7, 8); all access logged (Tasks 7, 8); public interface present and permission-enforcing (Task 11). Out-of-scope items (versioning, FTS, share links, previews, comments, nested/user-created folders) are not built. The interface reshape + `status` + dropped `'view'` are ratified in ADR 0012 (Task 13).
- **Placeholder scan:** every code step contains complete code; commands have expected output. The one inline `await import` in Task 6 is immediately corrected to a top-level import in the same step.
- **Type consistency:** `Folder`/`FileMeta`/`FolderScope`/`FileStatus`/`AccessAction`/`UploadRequest` (Task 1) are used unchanged in Tasks 5–11. `StorageClient.statObject(): Promise<{sizeBytes:number}|null>` (Task 3) matches its callers in `confirmUpload` (Task 7) and the fakes in tests. `canRead(folder, me)` / `canWrite(folder, me)` (Task 5) signatures match every call site. `requestUpload`/`confirmUpload`/`listFiles`/`getDownloadUrl`/`deleteFile`/`sweepStalePendingUploads`/`ensureFolders`/`provisionGroupFolders`/`registerFilesSubscribers` names are identical across definition, tests, index, and bootstrap. `createId` prefixes: `fld` (folders), `fil` (files), `fal` (access log).

```

```
