# Phase 2 Go-Live (files + notifications flags) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Phase 2 modules live in production — create the Supabase `files` bucket with bucket-level size/MIME enforcement, set the missing prod env vars (`BDAS_FLAG_FILES`, `SUPABASE_STORAGE_BUCKET`, and — decision-gated — `BDAS_FLAG_NOTIFICATIONS`), redeploy once, and verify folder provisioning + the storage driver against the real bucket.

**Architecture:** This is an ops runbook, not a code change — zero commits to application code. The deploy-migrations workflow already applied `modules/files/migrations/0001_init.sql` to prod (verified: `folders`/`files`/`file_access_log` exist, 0 rows). The files module is route-less in v1, so "live" means: `bootFiles()` runs at instrumentation, wires `SupabaseStorageClient`, registers the `group.created` subscriber, and `ensureFolders` provisions 6 folders (2 singletons + 2 per group × 2 groups). Bucket-level `file_size_limit`/`allowed_mime_types` add the defense-in-depth the security review flagged (declared-MIME-only check in `requestUpload`).

**Tech Stack:** Vercel CLI (`vercel env`, `vercel redeploy`), Supabase (SQL via MCP or dashboard), `tsx` for a throwaway real-bucket smoke script.

**Prod facts gathered 2026-06-11 (do not re-derive):**

- Supabase project: `rcfvsglohtearizdcaxp` (BDAS Webseite, eu-west-1).
- `storage.buckets` is empty — the bucket must be created.
- Prod env has: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `BDAS_FLAG_AUTH/MEMBERS/GROUPS/EVENTS/CONTENT_BRIDGE`, `DATABASE_URL`.
- Prod env is missing: `BDAS_FLAG_FILES`, `BDAS_FLAG_NOTIFICATIONS`, `SUPABASE_STORAGE_BUCKET`.
- `public.groups` has 2 rows → `ensureFolders` must yield exactly 6 folder rows.
- Flag format (core/feature-flags): `BDAS_FLAG_<NAME>=true`.

---

### Task 1: Confirm prod baseline (read-only)

No files change. Guard against drift since the facts above were gathered.

- [ ] **Step 1: Confirm CI + migrations are green on main**

Run: `gh run list --branch main --limit 2`
Expected: latest `CI` run `success`, latest `Deploy migrations` run `success`.

- [ ] **Step 2: Confirm the files tables exist in prod and are empty**

Via Supabase MCP `execute_sql` on project `rcfvsglohtearizdcaxp` (or `psql $PRODUCTION_DATABASE_URL`):

```sql
select
  (select count(*) from public.folders)  as folders,
  (select count(*) from public.files)    as files,
  (select count(*) from public.groups)   as groups;
```

Expected: `folders=0, files=0, groups=2`. If `folders` errors with "relation does not exist", STOP — the migration deploy did not run; investigate the Deploy migrations workflow before continuing.

- [ ] **Step 3: Confirm no bucket exists yet**

```sql
select id, name from storage.buckets;
```

Expected: empty. If a `files` bucket already exists, skip Task 2 Step 1 and only verify its settings match Task 2.

---

### Task 2: Create the `files` bucket (private, capped, MIME-allowlisted)

The bucket-level limits mirror `modules/files/src/constants.ts` (`MAX_FILE_BYTES` = 25 MB, `ALLOWED_MIME`). This makes Supabase reject an over-cap or off-list PUT at upload time — closing the "declared MIME only" gap from the security review at the storage layer.

- [ ] **Step 1: Create the bucket**

Via Supabase MCP `execute_sql` on project `rcfvsglohtearizdcaxp`:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'files', 'files', false,
  26214400, -- 25 MB, = MAX_FILE_BYTES
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/zip'
  ]
);
```

(Equivalent dashboard path: Storage → New bucket → name `files`, private, 25 MB limit, same MIME list.)

- [ ] **Step 2: Verify the bucket**

```sql
select id, public, file_size_limit, array_length(allowed_mime_types, 1) as mime_count
from storage.buckets where id = 'files';
```

Expected: one row — `public=false`, `file_size_limit=26214400`, `mime_count=14`.

---

### Task 3: Set the missing production env vars

All env adds happen before the single redeploy in Task 5. `setStorage` is only called when the flag is on, so adding the vars has no effect until the redeploy.

- [ ] **Step 1: Add the files flag**

```bash
printf 'true' | vercel env add BDAS_FLAG_FILES production
```

- [ ] **Step 2: Add the bucket name (explicit, matches .env.example)**

```bash
printf 'files' | vercel env add SUPABASE_STORAGE_BUCKET production
```

- [ ] **Step 3: Verify**

```bash
vercel env ls production | grep -E "BDAS_FLAG_FILES|SUPABASE_STORAGE_BUCKET"
```

Expected: both rows present, environment `Production`.

---

### Task 4: Notifications flag (DECISION-GATED — confirm with the user first)

`BDAS_FLAG_NOTIFICATIONS` is also unset in prod, so the notifications module (merged 2026-06-09) has never been live; spec §22's "phase N in production" gate needs it on. `bootNotifications()` requires `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — both already set in prod — and fail-louds if misconfigured, so the flag is the only missing piece. CLAUDE.md §3 says a flag goes on when the module is _acceptance-complete_: that is the federation's/user's call, not the executor's.

- [ ] **Step 1: Ask the user**

Ask: "Notifications has been merged but never flag-on in prod. Turn `BDAS_FLAG_NOTIFICATIONS` on in this go-live? (Resend config is already present; flag-on means real emails for event register/deregister/waitlist-promote.)"

If NO: skip to Task 5; record in the wrap-up that Phase 2-in-production remains blocked on notifications.

- [ ] **Step 2 (if YES): Add the flag**

```bash
printf 'true' | vercel env add BDAS_FLAG_NOTIFICATIONS production
```

- [ ] **Step 3 (if YES): Verify**

```bash
vercel env ls production | grep BDAS_FLAG_NOTIFICATIONS
```

Expected: present, environment `Production`.

---

### Task 5: Redeploy production

Env var changes only apply to new deployments.

- [ ] **Step 1: Redeploy the current production deployment**

```bash
vercel redeploy $(vercel ls --prod 2>/dev/null | grep -oE 'https://[^ ]+' | head -1)
```

(If `vercel ls` output format fights you: `vercel list --prod` and copy the latest deployment URL manually, then `vercel redeploy <url>`.)

Expected: build completes, new deployment promoted to production.

- [ ] **Step 2: Force the Node runtime to boot**

Instrumentation runs on first server start; hit a dynamic page to be sure:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://dashboard.bdas.de/
```

Expected: `200` (or the site's normal redirect code — anything but `500`).

---

### Task 6: Verify go-live

- [ ] **Step 1: Folders provisioned**

Via Supabase MCP `execute_sql`:

```sql
select scope, count(*) from public.folders group by scope order by scope;
```

Expected exactly:

| scope         | count |
| ------------- | ----- |
| federal_board | 1     |
| group_members | 2     |
| local_board   | 2     |
| members_all   | 1     |

If 0 rows: `bootFiles()` did not run or threw — check Vercel runtime logs (`vercel logs <deployment-url>` or the Vercel MCP `get_runtime_logs`) for `[files]` errors and for the fail-loud bootstrap throw, fix, redeploy.

- [ ] **Step 2: No boot errors in runtime logs**

Via Vercel MCP `get_runtime_logs` (or `vercel logs`): search for `[files]`, `[notifications]`, and `Error`.
Expected: no matching error lines from instrumentation.

- [ ] **Step 3: Real-bucket smoke test of the storage driver**

This exercises the live bucket with the prod service role key — the one thing no CI test covers. Create a **throwaway** script (do not commit it):

```bash
cat > /tmp/storage-smoke.ts << 'EOF'
/** Throwaway smoke: signed upload → PUT → statObject → signed download → delete. */
import { SupabaseStorageClient } from "./core/storage/src/supabase";

const url = process.env["SUPABASE_URL"]!;
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const c = new SupabaseStorageClient({ url, serviceRoleKey, bucket: "files" });
const key = `smoke/_/${Date.now()}/smoke.txt`;

const up = await c.signedUploadUrl({ storageKey: key, mimeType: "text/plain", sizeBytes: 11 });
const put = await fetch(up.url, { method: "PUT", headers: { "content-type": "text/plain" }, body: "hello bdas\n" });
console.log("PUT", put.status);

const stat = await c.statObject(key);
console.log("stat", stat);

const dl = await c.signedDownloadUrl({ storageKey: key });
const got = await fetch(dl.url);
console.log("GET", got.status, await got.text());

await c.deleteObject(key);
console.log("deleted; stat after:", await c.statObject(key));
EOF
SUPABASE_URL=<prod value> SUPABASE_SERVICE_ROLE_KEY=<prod value> pnpm exec tsx /tmp/storage-smoke.ts
```

Pull the two values with `vercel env pull /tmp/prod.env --environment production` (delete `/tmp/prod.env` afterwards).

Expected output:

```
PUT 200
stat { sizeBytes: 11 }
GET 200 hello bdas
deleted; stat after: null
```

- [ ] **Step 4: Clean up smoke artifacts**

```bash
rm -f /tmp/storage-smoke.ts /tmp/prod.env
```

- [ ] **Step 5 (only if Task 4 was YES): Notifications smoke**

Check `notification_log` stays consistent — no rows is fine (nothing has fired); the real signal is the absence of the fail-loud boot throw, already covered in Step 2:

```sql
select count(*) from public.notification_log;
```

Expected: no error (table exists); any count is acceptable.

---

### Task 7: Record the go-live

- [ ] **Step 1: Append the bucket-enforcement note to ADR 0012**

In `docs/decisions/0012-files-module-deviations.md`, append to the `## Decisions` list:

```markdown
11. **Bucket-level enforcement mirrors the code constants.** The production
    `files` bucket is private with `file_size_limit = 25 MB` and
    `allowed_mime_types` equal to `ALLOWED_MIME` — so Supabase rejects
    over-cap or off-list uploads at PUT time even though `requestUpload`
    only sees the declared MIME (defense-in-depth per the Phase 2 security
    review).
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/0012-files-module-deviations.md
git commit -m "docs(adr-0012): record bucket-level size/MIME enforcement for files go-live

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

Expected: CI green (docs-only change; prettier-formatted).

---

## Out of scope (unchanged from the files-module plan follow-ups)

- Phase 3 dashboard UI for files; `'view'` audit action; per-scope quota config.
- Wiring `sweepStalePendingUploads` to a cron (no cron until Phase 3).
- Permanent real-bucket smoke test in CI (Task 6 Step 3 is a manual one-off).
- Notifications broadcasts/preferences/fan-out (separate plans).

## Self-Review

- **Coverage:** spec §22 "phase N in production" → bucket (Task 2), flags (Tasks 3–4), deploy (Task 5), verification (Task 6); decision trail → Task 7. Migration deploy needed no task (already applied — Task 1 re-verifies).
- **Placeholder scan:** all commands concrete; the two `<prod value>` placeholders in Task 6 Step 3 are deliberate secret-handling (pulled via `vercel env pull`, never written into the plan).
- **Consistency:** bucket id `files` = `SUPABASE_STORAGE_BUCKET` value = `bootFiles()` default; 26214400 = `MAX_FILE_BYTES`; the 14 MIME entries are byte-identical to `ALLOWED_MIME` in `modules/files/src/constants.ts`.
