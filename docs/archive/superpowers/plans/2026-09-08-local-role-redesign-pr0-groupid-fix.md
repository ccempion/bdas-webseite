# Local Role Redesign — PR0: Group-ID display fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the group-scoped Vorstand page from showing raw group IDs (`grp_...`) next to role badges.

**Architecture:** The bug is in `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx`, which passes `groupNames={{}}` to `RoleRoster` and `AuditLog`. Both components fall back to the raw `groupId` when a name isn't in the map (`RoleRoster.tsx:45`, `AuditLog.tsx:30`). Since this page is already scoped to one group, the group-name suffix is redundant on every row — add an opt-out flag instead of populating the map.

**Tech Stack:** Next.js Server/Client Components, TypeScript, Vitest.

**Spec:** N/A — bug fix from live-screenshot report, no design doc.

## Global Constraints

- Do not touch the Datei-Bereich labels or the FAQ (out of scope, owned elsewhere).
- Default of the new prop must preserve today's federal-page behavior exactly (no visual change there).

---

### Task 1: Add `showGroupName` to `RoleRoster` and `AuditLog`

**Files:**

- Modify: `apps/web/app/(board)/_components/RoleRoster.tsx`
- Modify: `apps/web/app/(board)/_components/AuditLog.tsx`
- Modify: `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx`

**Interfaces:**

- Produces: `RoleRoster` prop `showGroupName?: boolean` (default `true`); `AuditLog` prop `showGroupName?: boolean` (default `true`).

There is no existing unit test file for these two components (they're server-rendered presentational components with no colocated `.test.tsx`), so this task is verified by reading the diff plus a manual render check — there's no test harness to add a failing test to first. Do the edit directly, then verify by inspection and the dev server.

- [ ] **Step 1: Add the prop to `RoleRoster`**

In `apps/web/app/(board)/_components/RoleRoster.tsx`, change the props destructuring and the badge line:

```tsx
export function RoleRoster({
  sections,
  groupNames,
  revalidatePath,
  currentMemberId,
  showGroupName = true,
}: {
  sections: ReadonlyArray<{ title: string; holders: RoleHolder[] }>;
  groupNames: Record<string, string>;
  revalidatePath: string;
  currentMemberId: string | null;
  showGroupName?: boolean;
}) {
```

And the badge span (was `{h.groupId ? \` · ${groupNames[h.groupId] ?? h.groupId}\` : ""}`):

```tsx
{
  showGroupName && h.groupId ? ` · ${groupNames[h.groupId] ?? h.groupId}` : "";
}
```

- [ ] **Step 2: Add the same prop to `AuditLog`**

In `apps/web/app/(board)/_components/AuditLog.tsx`:

```tsx
export function AuditLog({
  entries,
  groupNames,
  showGroupName = true,
}: {
  entries: GrantAuditEntry[];
  groupNames: Record<string, string>;
  showGroupName?: boolean;
}) {
```

And the line building the label (was `{e.groupId ? \` · ${groupNames[e.groupId] ?? e.groupId}\` : ""} &rarr; {e.firstName}{" "}`):

```tsx
            {showGroupName && e.groupId ? ` · ${groupNames[e.groupId] ?? e.groupId}` : ""} &rarr;{" "}
            {e.firstName}{" "}
```

- [ ] **Step 3: Pass `showGroupName={false}` from the group-scoped Vorstand page**

In `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx`, both call sites currently pass `groupNames={{}}`. Keep that (no name map needed at all now) and add the flag:

```tsx
        <AuditLog entries={audit} groupNames={{}} showGroupName={false} />
      ) : (
        <RoleRoster
          sections={[
            { title: "Leads", holders: ofGroup.filter((h) => h.role === "local_board_lead") },
            { title: "Vorstand", holders: ofGroup.filter((h) => h.role === "local_board") },
            {
              title: "Organisatoren",
              holders: ofGroup.filter((h) => h.role === "event_organizer"),
            },
            {
              title: "Seiten-Editoren",
              holders: ofGroup.filter((h) => h.role === "page_editor"),
            },
          ]}
          groupNames={{}}
          revalidatePath={revalidate}
          currentMemberId={me.member?.id ?? null}
          showGroupName={false}
        />
```

(This PR does not touch the `local_board` section or role set — that's PR1/PR3's job. Leave the sections list exactly as it is today; only the two `showGroupName={false}` props are new.)

- [ ] **Step 4: Confirm the federal page is unaffected**

`apps/web/app/(board)/federal/roles/page.tsx` already passes real `groupNames` and does not pass `showGroupName` — with the new default of `true`, its rendering is byte-for-byte unchanged. Open the file and confirm no edit is needed (it isn't — this step is a verification, not a code change).

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `pnpm dev` (with `BDAS_FLAG_MEMBERS`/dashboard flags on per `.env.local`), sign in as a group Lead, open `/gruppe/<slug>/vorstand`. Expected: role badges show only the role name (e.g. "Lead"), no trailing `· grp_...`. Open `/federal/roles`: badges still show `· <Gruppenname>` as before.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/\(board\)/_components/RoleRoster.tsx apps/web/app/\(board\)/_components/AuditLog.tsx "apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx"
git commit -m "fix(board): hide redundant group id/name on the group-scoped Vorstand page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S4sVhZJkRX7Mwpv4mFxU18"
```

## Self-Review

- **Spec coverage:** The one reported bug (raw `grp_...` IDs on the group Vorstand page) is fixed; the federal page's existing correct behavior is preserved by the default. ✓
- **Placeholder scan:** none. ✓
- **Type consistency:** `showGroupName?: boolean` matches across both components and the one caller that sets it explicitly. ✓
