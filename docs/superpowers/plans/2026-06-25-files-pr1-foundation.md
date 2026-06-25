# Files PR 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the backend foundation for serving real documents — Row-Level Security lockdown, two module-surface helpers the UI will need, and a daily cron that clears abandoned uploads — with no user-visible change and the feature flag still off.

**Architecture:** This is the first of three pull requests from the design at `docs/superpowers/specs/2026-06-25-files-consumer-experience-design.md`. PR 2 (read UI) and PR 3 (write UI) build on the helpers added here. The files module's service layer, schema, and integration-test harness already exist and already run in Continuous Integration against real PostgreSQL; this PR only fills genuine gaps.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Next.js 14 App Router (route handler for cron), Vitest, Vercel Cron.

## Global Constraints

- Node.js 22+, pnpm 11.0.9 (CI floor).
- Rule 1 — the files module owns `folders`, `files`, `file_access_log`; no other module reads/writes them directly.
- Rule 7 — migrations live in `modules/files/migrations/`, run in the order declared in `infra/migrations/src/manifest.ts`, filenames lexically ordered (`0002_...` after `0001_...`).
- Rule 8 — the module's only public surface is `modules/files/src/index.ts`; new exports go there.
- Rule 6 — the `files` feature flag stays OFF in production; nothing here flips it.
- No database mocks in multi-module tests — integration tests use real Docker PostgreSQL (`pnpm db:up`), which CI provides as a service.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch: `feat/files-consumer-experience` (already created and checked out).

---

### Task 1: Row-Level Security lockdown migration

Turn Row-Level Security ON for the three files tables with no permissive policy, so every role except the table owner / `BYPASSRLS` service-role (the only path the app uses) is denied. Wire the new migration into the test harness so the whole suite runs against the locked-down schema.

**Files:**
- Create: `modules/files/migrations/0002_rls_lockdown.sql`
- Modify: `modules/files/src/index.test.ts` (the `applyMigrations` file list, ~lines 64-74; add one test)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing importable (data-definition migration only). Later tasks and PRs rely on the migration being in the manifest module `files` (it already is — `infra/migrations/src/manifest.ts` lists `"files"`, and the runner executes every `*.sql` in that folder in lexical order, so `0002` is picked up automatically).

- [ ] **Step 1: Write the failing test**

In `modules/files/src/index.test.ts`, add this `describe` block at the end of the file (it reuses the existing `createTestDb`, `applyMigrations`, `describeIfDb` already imported/defined in that file):

```ts
describeIfDb("row-level security lockdown", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("enables row-level security on all three files tables", async () => {
    const rows = await t.client<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relname IN ('folders', 'files', 'file_access_log')
      ORDER BY relname
    `;
    expect(rows.map((r) => `${r.relname}:${r.relrowsecurity}`)).toEqual([
      "file_access_log:true",
      "files:true",
      "folders:true",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/files test -- -t "enables row-level security"`
Expected: FAIL — `relrowsecurity` is `false` for all three tables (RLS not yet enabled), so the array equals `["file_access_log:false", "files:false", "folders:false"]`.

(If the database is unreachable the block is skipped, not failed. Bring it up with `pnpm db:up` first.)

- [ ] **Step 3: Create the migration**

Create `modules/files/migrations/0002_rls_lockdown.sql`:

```sql
-- Files module — Row-Level Security lockdown (design docs/superpowers/specs/2026-06-25-files-consumer-experience-design.md).
-- The app reaches these tables only via the service-role / direct-Postgres path,
-- which bypasses Row-Level Security (table owner / BYPASSRLS role). Enabling RLS
-- with NO permissive policy denies every other role (Supabase `anon` and
-- `authenticated`), closing the documented security gate with zero change to the
-- app's enforced path. Re-runs are harmless (ENABLE is idempotent in effect).
ALTER TABLE folders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE files           ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_access_log ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Wire the migration into the test harness**

In `modules/files/src/index.test.ts`, find the `applyMigrations` array (the list of path segment arrays) and add the `0002` entry immediately after the files `0001` entry:

```ts
  for (const file of [
    ["..", "..", "auth", "migrations", "0001_init.sql"],
    ["..", "..", "groups", "migrations", "0001_init.sql"],
    ["..", "..", "members", "migrations", "0001_init.sql"],
    ["..", "migrations", "0001_init.sql"],
    ["..", "migrations", "0002_rls_lockdown.sql"],
  ]) {
```

- [ ] **Step 5: Run the new test and the full files suite to verify pass**

Run: `pnpm --filter @bdas/files test`
Expected: PASS — the new RLS test passes, AND every pre-existing test still passes (proving the owner/service-role path is unaffected by the lockdown, since `createTestDb` connects as the table-owning `bdas` role).

- [ ] **Step 6: Verify the migration applies cleanly via the real runner**

Run: `pnpm db:migrate:dry`
Expected: completes with no error and lists `modules/files/migrations/0002_rls_lockdown.sql` among the migrations to run.

- [ ] **Step 7: Commit**

```bash
git add modules/files/migrations/0002_rls_lockdown.sql modules/files/src/index.test.ts
git commit -m "feat(files): enable row-level security deny-all on files tables

Closes the documented security gate before files serves real documents.
App path (service-role/owner) bypasses RLS; anon/authenticated are denied.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `folderFileCounts` service helper

A single grouped query returning the count of ready files per folder, restricted to folders the member may read. Powers the file counts on the PR 2 folder index without an N+1.

**Files:**
- Modify: `modules/files/src/services/files.ts` (imports + new exported function)
- Modify: `modules/files/src/index.ts` (re-export)
- Modify: `modules/files/src/index.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `rowToFolder` and `folders` (existing in the module); `canRead` (already imported in `files.ts`).
- Produces: `folderFileCounts(db: Db, folderIds: string[], forMember: CurrentMember): Promise<Record<string, number>>` — keys are the readable folder ids among `folderIds`; value is the count of `status='ready'` files; non-readable or unknown ids are omitted; readable folders with zero files map to `0`.

- [ ] **Step 1: Write the failing test**

In `modules/files/src/index.test.ts`, add a new block. It mirrors the existing "two-phase upload" block's helpers (a local-board member, `localBoardFolderId`, `makeReadyFile`-style setup). Paste this self-contained block at the end of the file:

```ts
describeIfDb("folderFileCounts", () => {
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
  const plainMe = () =>
    meWith([{ role: "member", groupId: null }], {
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

  const folderId = async (scope: string) => {
    const rows = await t.db.select().from(folders);
    return rows.find((f) => f.scope === scope && (f.groupId === "grp_muc" || f.groupId === null))!.id;
  };

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage({ statObject: async () => ({ sizeBytes: 5 }) }));
    await seedGroupAndMember(t, { groupId: "grp_muc", memberId: "mbr_1", userId: "usr_1" });
    await ensureFolders(t.db);
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("counts only ready files, per readable folder", async () => {
    const local = await folderId("local_board");
    // two ready files in the local_board folder
    for (const name of ["a.pdf", "b.pdf"]) {
      const { fileId } = await requestUpload(
        t.db,
        local,
        { filename: name, mimeType: "application/pdf", sizeBytes: 5 },
        boardMe(),
      );
      await confirmUpload(t.db, fileId, boardMe());
    }
    // one pending file (must NOT be counted)
    await requestUpload(
      t.db,
      local,
      { filename: "draft.pdf", mimeType: "application/pdf", sizeBytes: 5 },
      boardMe(),
    );
    const membersAll = await folderId("members_all");

    const counts = await folderFileCounts(t.db, [local, membersAll], boardMe());
    expect(counts[local]).toBe(2);
    expect(counts[membersAll]).toBe(0); // readable, but empty
  });

  it("omits folders the member cannot read", async () => {
    const local = await folderId("local_board"); // plain member cannot read this
    const counts = await folderFileCounts(t.db, [local], plainMe());
    expect(counts[local]).toBeUndefined();
  });
});
```

Add `folderFileCounts` to the existing import from `./services/files` at the top of the test file:

```ts
import {
  confirmUpload,
  deleteFile,
  folderFileCounts,
  getDownloadUrl,
  listFiles,
  requestUpload,
  sweepStalePendingUploads,
} from "./services/files";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/files test -- -t "folderFileCounts"`
Expected: FAIL — `folderFileCounts` is not exported (TypeScript/Vitest reports it is not a function / import has no such member).

- [ ] **Step 3: Implement `folderFileCounts`**

In `modules/files/src/services/files.ts`:

First extend the imports. Change the drizzle import and the schema/folders imports:

```ts
import { and, eq, inArray, lt, sql } from "drizzle-orm";
```
```ts
import { fileAccessLog, files, folders } from "../schema";
```
```ts
import { getFolder, rowToFolder } from "./folders";
```

Then add the function (place it after `listFiles`):

```ts
/**
 * Count of ready files per folder, restricted to folders the member may read.
 * One grouped query (no N+1). Non-readable or unknown ids are omitted; a
 * readable folder with no files maps to 0. Powers the folder-index file counts.
 */
export async function folderFileCounts(
  db: Db,
  folderIds: string[],
  forMember: CurrentMember,
): Promise<Record<string, number>> {
  if (folderIds.length === 0) return {};
  const folderRows = await db.select().from(folders).where(inArray(folders.id, folderIds));
  const readable = folderRows
    .map(rowToFolder)
    .filter((f) => canRead(f, forMember))
    .map((f) => f.id);
  if (readable.length === 0) return {};

  const rows = await db
    .select({ folderId: files.folderId, n: sql<number>`count(*)::int` })
    .from(files)
    .where(and(inArray(files.folderId, readable), eq(files.status, "ready")))
    .groupBy(files.folderId);

  const out: Record<string, number> = {};
  for (const id of readable) out[id] = 0;
  for (const r of rows) out[r.folderId] = r.n;
  return out;
}
```

- [ ] **Step 4: Re-export from the public surface**

In `modules/files/src/index.ts`, add `folderFileCounts` to the `./services/files` re-export:

```ts
export {
  requestUpload,
  confirmUpload,
  listFiles,
  folderFileCounts,
  getDownloadUrl,
  deleteFile,
  sweepStalePendingUploads,
} from "./services/files";
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @bdas/files test -- -t "folderFileCounts"`
Expected: PASS — both new cases pass.

- [ ] **Step 6: Typecheck the module surface**

Run: `pnpm --filter @bdas/files typecheck`
Expected: PASS — no type errors from the new export.

- [ ] **Step 7: Commit**

```bash
git add modules/files/src/services/files.ts modules/files/src/index.ts modules/files/src/index.test.ts
git commit -m "feat(files): add folderFileCounts for the folder index

Single grouped, read-gated count of ready files per folder (no N+1).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Re-export read/write folder predicates

The PR 2/3 UI must render write affordances truthfully (e.g. a board that can read but not write a folder shows no upload/delete). Expose the existing pure predicates on the public surface under descriptive names.

**Files:**
- Modify: `modules/files/src/index.ts` (re-export)
- Modify: `modules/files/src/permissions.test.ts` (add the motivating case + a re-export assertion)

**Interfaces:**
- Consumes: `canRead`, `canWrite` from `./permissions` (existing).
- Produces: `canReadFolder(folder: Folder, me: CurrentMember): boolean` and `canWriteFolder(folder: Folder, me: CurrentMember): boolean` on the module's public surface (aliases of `canRead`/`canWrite`).

- [ ] **Step 1: Write the failing test**

In `modules/files/src/permissions.test.ts`, add a new block that imports from the **public surface** (`./index`) to prove the re-export exists, and pins the affordance-driving behavior:

```ts
import { canReadFolder, canWriteFolder } from "./index";

describe("public folder predicates (re-exported)", () => {
  it("canReadFolder / canWriteFolder match the internal predicates", () => {
    const f = folder("local_board", "grp_muc");
    expect(canReadFolder(f, me(LOCAL_MUC))).toBe(true);
    expect(canWriteFolder(f, me(LOCAL_MUC))).toBe(true);
  });

  it("a plain member can neither read nor write a local_board folder", () => {
    const f = folder("local_board", "grp_muc");
    expect(canReadFolder(f, me(PLAIN))).toBe(false);
    expect(canWriteFolder(f, me(PLAIN))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/files test -- -t "re-exported"`
Expected: FAIL — `canReadFolder`/`canWriteFolder` are not exported from `./index`.

- [ ] **Step 3: Add the re-exports**

In `modules/files/src/index.ts`, add (near the other exports):

```ts
export { canRead as canReadFolder, canWrite as canWriteFolder } from "./permissions";
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @bdas/files test -- -t "re-exported"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/files/src/index.ts modules/files/src/permissions.test.ts
git commit -m "feat(files): expose canReadFolder/canWriteFolder on public surface

UI uses these to render read/write affordances truthfully (PR 2/3).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Daily cron to sweep abandoned uploads

A secret-gated route handler the Vercel scheduler calls once a day; it clears `pending` upload rows older than 24h via the existing `sweepStalePendingUploads`. This is the first API route in the app, so it establishes the pattern.

**Files:**
- Create: `apps/web/app/api/cron/files-sweep/route.ts`
- Create: `apps/web/app/api/cron/files-sweep/route.test.ts`
- Create: `vercel.json` (repo root)

**Interfaces:**
- Consumes: `sweepStalePendingUploads` (`@bdas/files`), `isFlagOn` (`@bdas/feature-flags`), `getDb` (`@bdas/db`), `bootFiles` (`apps/web/lib/files-bootstrap.ts`).
- Produces: `GET(req: Request): Promise<Response>` — `401` without a valid `Bearer ${CRON_SECRET}`; `200 {"skipped":"files flag off"}` when the flag is off; `200 {"swept":<number>}` otherwise.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/cron/files-sweep/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "./route";

describe("files-sweep cron auth + flag gate", () => {
  beforeEach(() => {
    process.env["CRON_SECRET"] = "s3cret";
    delete process.env["BDAS_FLAG_FILES"];
  });
  afterEach(() => {
    delete process.env["CRON_SECRET"];
    delete process.env["BDAS_FLAG_FILES"];
  });

  it("401s without a bearer token", async () => {
    const res = await GET(new Request("http://x/api/cron/files-sweep"));
    expect(res.status).toBe(401);
  });

  it("401s with the wrong token", async () => {
    const res = await GET(
      new Request("http://x/api/cron/files-sweep", {
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("skips (200) with a valid token when the files flag is off", async () => {
    const res = await GET(
      new Request("http://x/api/cron/files-sweep", {
        headers: { authorization: "Bearer s3cret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "files flag off" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web test -- files-sweep`
Expected: FAIL — `./route` does not exist (module not found).

- [ ] **Step 3: Implement the route handler**

Create `apps/web/app/api/cron/files-sweep/route.ts`:

```ts
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { sweepStalePendingUploads } from "@bdas/files";

import { bootFiles } from "../../../../lib/files-bootstrap";

export const dynamic = "force-dynamic";

/** Pending uploads older than this are abandoned and get swept. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Daily cleanup of abandoned (pending) uploads. Triggered by Vercel Cron, which
 * sends `Authorization: Bearer ${CRON_SECRET}`. No-ops when the files flag is
 * off (storage is then unconfigured, so there is nothing to sweep).
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isFlagOn("files")) {
    return Response.json({ skipped: "files flag off" });
  }
  await bootFiles(); // idempotent; wires the storage driver when the flag is on
  const swept = await sweepStalePendingUploads(getDb(), new Date(Date.now() - STALE_AFTER_MS));
  return Response.json({ swept });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @bdas/web test -- files-sweep`
Expected: PASS — all three cases pass (the flag-on branch is exercised by the service's own integration tests, so this suite stays database-free).

- [ ] **Step 5: Register the cron schedule**

Create `vercel.json` at the repo root:

```json
{
  "crons": [
    {
      "path": "/api/cron/files-sweep",
      "schedule": "0 3 * * *"
    }
  ]
}
```

- [ ] **Step 6: Typecheck and build the web app**

Run: `pnpm --filter @bdas/web typecheck`
Expected: PASS.

Run: `BDAS_FLAG_FILES=true pnpm --filter @bdas/web build`
Expected: PASS — the route compiles with the flag on (mirrors the CI `web-build` gate; confirms the new route handler builds).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/cron/files-sweep/route.ts apps/web/app/api/cron/files-sweep/route.test.ts vercel.json
git commit -m "feat(files): daily cron to sweep abandoned pending uploads

Secret-gated /api/cron/files-sweep + vercel.json schedule (03:00 UTC).
No-ops when the files flag is off.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the full files module suite: `pnpm --filter @bdas/files test` — all pass (RLS, folderFileCounts, predicates, plus the pre-existing suite).
- [ ] Run the web app suite: `pnpm --filter @bdas/web test -- files-sweep` — cron auth/flag tests pass.
- [ ] Run `pnpm typecheck` and `pnpm lint` at the repo root — clean.
- [ ] Run `pnpm db:migrate:dry` — the RLS migration is listed and applies without error.
- [ ] Confirm `CRON_SECRET` is documented for production (note for the human: set `CRON_SECRET` in Vercel project env so the scheduler's Bearer header is accepted; without it the route 401s and the sweep silently never runs).

## Notes for PR 2 / PR 3 (not built here)

- The integration harness already injects a per-test `fakeStorage`; no separate in-memory storage *module* was needed (the spec's PR-1 "in-memory storage driver" item was already satisfied by the existing test fake + the CI `test` job running against real PostgreSQL).
- PR 3's end-to-end upload coverage (Playwright) will need real object storage in the e2e job, or a deliberately-skipped upload E2E — decide when planning PR 3.
- `CRON_SECRET` must be set in Vercel before go-live (PR 4 / flag flip).
