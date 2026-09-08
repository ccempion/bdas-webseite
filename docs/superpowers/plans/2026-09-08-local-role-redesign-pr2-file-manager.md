# Local Role Redesign — PR2: Datei-Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the `file_manager` role: full file/folder access (upload, delete, rename, create/rename/delete folders), but strictly limited to the `group_members` folder of the holder's own group — never the `local_board` (internal board) folder, never another group.

**Architecture:** `modules/files/src/permissions.ts`'s `canWrite` is the single chokepoint for every write action in the files module (upload, delete, and all three folder-write operations already funnel through it — verified during analysis: `services/files.ts:76,123,223` and `services/folder-writes.ts:61,107,144` all call `canWrite`, nothing calls a narrower predicate). Because `file_manager` is meant to get the *same full write access* as a Lead, just narrowed to one scope, this is a single-function change: split the `group_members` case out from `local_board` in `canWrite`'s switch and let a `file_manager` grant satisfy the former only. No new predicate function, no changes to `folder-writes.ts` or `services/files.ts` at all.

The public member-facing files page (`apps/web/app/dateien/[folderId]/page.tsx`) already computes the correct `canWrite` value (line 43) but discards it, hardcoding `canWrite={false}` on the `FileList` it renders (line 77) — that one line is the entire UI change needed for D2 (access via `/dateien`).

**Tech Stack:** TypeScript, Drizzle, Vitest (unit — no new integration test needed, `canWrite` is a pure function over already-loaded data).

**Spec:** This session's role-redesign analysis (chat). No ADR needed for this PR — it's an additive capability grant, not a decision reversal (unlike PR3's blog change).

## Global Constraints

- **CLAUDE.md §4:** this PR changes authorization → needs `/security-review`.
- `file_manager` must **never** satisfy `local_board`-scope folders, `members_all`, or `federal_board` scope folders — those stay Lead/federal-only. Test this negatively, not just positively (the brief explicitly warns against "versehentliche Rechte-Ausweitung").
- `file_manager` must **never** satisfy a `group_members` folder belonging to a *different* group than the grant's `groupId`.
- Depends on PR1 having landed (`file_manager` must already be a legal value in the `member_role_grants` CHECK domain and the `Role` union — PR1 Task 1 and Task 2 cover this; do not re-add it here).

---

### Task 1: `canWrite` — `file_manager` grants the `group_members` scope of its own group

**Files:**
- Modify: `modules/files/src/permissions.ts`
- Modify: `modules/files/src/permissions.test.ts`

**Interfaces:**
- Consumes: `Grant` from `@bdas/members` (unchanged), `CurrentMember`.
- Produces: `canWrite(folder, me)` — same signature, `group_members` and `local_board` scopes now branch separately.

- [ ] **Step 1: Write the failing tests**

Add to `modules/files/src/permissions.test.ts`. First rename the existing `LOCAL_MUC` fixture (it currently reads `local_board`, which PR1 already removed from the role domain — if PR1 has landed, this test file is currently broken; fix the existing fixture as part of this step, then add the new cases):

```typescript
const FED: Grant[] = [{ role: "federal_board", groupId: null }];
const LEAD_MUC: Grant[] = [{ role: "local_board_lead", groupId: "grp_muc" }];
const FILE_MGR_MUC: Grant[] = [{ role: "file_manager", groupId: "grp_muc" }];
const PLAIN: Grant[] = [{ role: "member", groupId: null }];
```

(Rename every other use of `LOCAL_MUC` in the file to `LEAD_MUC` — this is the PR1 fixture fix, a prerequisite for this file to compile/pass at all once PR1 has merged. If PR1 has not yet merged when you start this task, do the rename anyway; it's a no-op improvement either way since `local_board` and `local_board_lead` behaved identically before PR1 too.)

Then add:

```typescript
describe("canWrite: file_manager", () => {
  it("writes the group_members folder of its own group", () => {
    expect(canWrite(folder("group_members", "grp_muc"), me(FILE_MGR_MUC))).toBe(true);
  });

  it("does not write another group's group_members folder", () => {
    expect(canWrite(folder("group_members", "grp_other"), me(FILE_MGR_MUC))).toBe(false);
  });

  it("does not write the local_board (board-internal) folder of its own group", () => {
    expect(canWrite(folder("local_board", "grp_muc"), me(FILE_MGR_MUC))).toBe(false);
  });

  it("does not write members_all or federal_board scope", () => {
    expect(canWrite(folder("members_all", null), me(FILE_MGR_MUC))).toBe(false);
    expect(canWrite(folder("federal_board", null), me(FILE_MGR_MUC))).toBe(false);
  });

  it("read access to group_members is unaffected — file_manager can already read as any active group member", () => {
    expect(canRead(folder("group_members", "grp_muc"), me(FILE_MGR_MUC))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bdas/files test permissions`
Expected: FAIL — `canWrite` today has no branch recognizing `file_manager` at all, so every `file_manager`-based assertion above returns `false` including the one that should be `true`.

- [ ] **Step 3: Update `canWrite`**

```typescript
// modules/files/src/permissions.ts
import { canManageGroup, isFederalBoard, type CurrentMember } from "@bdas/members";

import type { Folder } from "./types";

/**
 * May this member read the folder? (spec §11 taxonomy)
 *  members_all   → any active member
 *  group_members → active member of that group
 *  local_board   → that group's Lead, or federal (canManageGroup covers both)
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
 * May this member upload/delete/manage folders here?
 *  members_all / federal_board → federal only
 *  local_board                 → that group's Lead (federal included)
 *  group_members                → that group's Lead or federal, OR that
 *                                  group's file_manager (local role redesign —
 *                                  a Datei-Manager gets full write access, but
 *                                  ONLY to the members folder, never the board
 *                                  folder)
 */
export function canWrite(folder: Folder, me: CurrentMember): boolean {
  const { grants } = me;
  switch (folder.scope) {
    case "members_all":
    case "federal_board":
      return isFederalBoard(grants);
    case "local_board":
      return canManageGroup(grants, folder.groupId);
    case "group_members":
      return (
        canManageGroup(grants, folder.groupId) ||
        grants.some((g) => g.role === "file_manager" && g.groupId === folder.groupId)
      );
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @bdas/files test permissions`
Expected: PASS, all cases including the pre-existing ones (Lead/federal behavior unchanged).

- [ ] **Step 5: Run the full files module suite**

Run: `pnpm --filter @bdas/files test`
Expected: PASS — `services/files.ts` and `services/folder-writes.ts` need no changes since they already call `canWrite` directly; their own tests (`folder-writes.test.ts`, `folder-nesting-schema.test.ts`, `index.test.ts`) should be unaffected, but confirm.

- [ ] **Step 6: Commit**

```bash
git add modules/files/src/permissions.ts modules/files/src/permissions.test.ts
git commit -m "feat(files): file_manager gets full write access to its own group's members folder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 2: Wire real write access into the public `/dateien` page

**Files:**
- Modify: `apps/web/app/dateien/[folderId]/page.tsx`

**Interfaces:**
- No new interfaces — `canWriteFolder` (already imported) is now actually used.

There's no colocated test file for this page component (it's a Next.js Server Component page, exercised by e2e rather than unit tests) — verify by reading the diff and the manual check in Step 2.

- [ ] **Step 1: Pass the real value through**

In `apps/web/app/dateien/[folderId]/page.tsx`, the `canWrite` constant is already computed correctly on line 43 (`const canWrite = canWriteFolder(folder, me);`) and already drives `FolderAdminControls`/`NewFolderButton` visibility (lines 52, 66) — only the final `FileList` call still hardcodes `false`:

```tsx
      <FileList files={files} folderId={params.folderId} canWrite={canWrite} />
```

(was `canWrite={false}`)

- [ ] **Step 2: Manual verification**

Run: `pnpm dev`. As a plain active member with no `file_manager` grant, open `/dateien`, navigate into your group's members folder — confirm no upload dropzone, no delete buttons, no folder admin controls appear (unchanged from before). Grant yourself (via the DB or `/gruppe/<slug>/vorstand` once PR3 adds the grant-UI option — for this PR, grant it directly via SQL or a temporary `grantRole` call in a script/REPL) a `file_manager` grant scoped to your group, reload — confirm the upload dropzone, per-file delete, "Neuer Ordner", and rename/delete folder controls now all appear inside your group's members folder, and confirm switching to a *different* group's members folder (if you have read access to browse there) shows no write controls. Also confirm the group's `local_board`-scope folder (if visible to you at all) shows no write controls for the file_manager grant.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (this was already a valid `boolean` being discarded, not a type change).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/dateien/[folderId]/page.tsx"
git commit -m "fix(web): wire real write permission into the member files page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 3: Grant UI — add "Datei-Manager" to the Vorstand page

**Files:**
- Modify: `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx`
- Modify: `apps/web/app/(board)/_components/RoleRoster.tsx`

**Interfaces:**
- No new interfaces — content additions to existing UI.

- [ ] **Step 1: Add the grant option and roster section**

In `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx` (state as left by PR1 Task 11):

```tsx
        <GrantRoleModal
          title="Vorstand hinzufügen"
          candidates={groupMembers.map((m) => ({
            memberId: m.id,
            name: `${m.firstName} ${m.lastName}`,
          }))}
          roleOptions={[
            { role: "event_organizer", label: "Organisator", groupId },
            { role: "page_editor", label: "Seiten-Editor", groupId },
            { role: "file_manager", label: "Datei-Manager", groupId },
          ]}
          revalidatePath={revalidate}
        />
```

```tsx
        <RoleRoster
          sections={[
            { title: "Leads", holders: ofGroup.filter((h) => h.role === "local_board_lead") },
            {
              title: "Organisatoren",
              holders: ofGroup.filter((h) => h.role === "event_organizer"),
            },
            {
              title: "Seiten-Editoren",
              holders: ofGroup.filter((h) => h.role === "page_editor"),
            },
            {
              title: "Datei-Manager",
              holders: ofGroup.filter((h) => h.role === "file_manager"),
            },
          ]}
          groupNames={{}}
          revalidatePath={revalidate}
          currentMemberId={me.member?.id ?? null}
          showGroupName={false}
        />
```

- [ ] **Step 2: Add the label**

In `RoleRoster.tsx`'s `ROLE_LABEL`:

```typescript
const ROLE_LABEL: Record<string, string> = {
  federal_board: "Bundesvorstand",
  local_board_lead: "Lead",
  event_organizer: "Organisator",
  page_editor: "Seiten-Editor",
  file_manager: "Datei-Manager",
};
```

- [ ] **Step 3: Typecheck and build**

Run: `pnpm typecheck && pnpm --filter @bdas/web build`
Expected: no errors.

- [ ] **Step 4: Manual verification**

As a group Lead, open `/gruppe/<slug>/vorstand`, grant "Datei-Manager" to a group member via the modal, confirm they appear under a new "Datei-Manager" section. Confirm the member can now access `/dateien` write controls per Task 2's manual check, without needing this manual SQL grant anymore.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx" apps/web/app/\(board\)/_components/RoleRoster.tsx
git commit -m "feat(web): add Datei-Manager to the group grant UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

---

### Task 4: `/security-review`

- [ ] **Step 1: Run `/security-review`** on the PR2 diff. Focus areas: confirm `canWrite`'s `group_members` branch cannot be satisfied by a `file_manager` grant whose `groupId` doesn't match the folder's `groupId` (Task 1's negative tests cover this, but re-verify by reading the final `canWrite` body, not just the tests); confirm no other call site in `modules/files` bypasses `canWrite` for a write action (re-grep `services/files.ts` and `services/folder-writes.ts` for any direct grant check that might have been added or missed).

## Self-Review

- **Spec coverage:** Datei-Manager gets full read/write/folder-management in its own group's `group_members` folder only (Task 1), reachable through the existing `/dateien` UI (Task 2), grantable from the Vorstand page (Task 3). D2, D2b fully covered. ✓
- **Placeholder scan:** none. ✓
- **Type consistency:** `canWrite`'s signature is unchanged; the new `file_manager` branch uses the same `Grant`/`Folder` shapes as every other branch. ✓
