# Phase 3 PR 6 — Local scope pages (overview, members, events, profile, files)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Fill the `/gruppe/[slug]/*` pages with group-scoped data, reusing the PR 3–5 components. Completes Phase 3's buildable surface.

**Architecture:** Pure composition — no new module methods. Every page calls `requireGroupScope(slug)` via the existing layout, then the PR 3/4 read methods with `{ groupId }`. Profile editing delegates to `groups.updateGroup` behind a Server Action that re-checks `canManageGroup`. Events are filtered to the group page-side from `listManagedEvents` (a federal viewer sees all; the page narrows to this group).

**Tech Stack:** Next.js Server Components/Actions, existing components (`MembersTable`, `EventsTable`, `FoldersTable`, `Tile`, `Sparkline`, `ActionStrip`), `bdas-*` tokens.

---

## Background the executor needs

- `requireGroupScope(slug)` (in `apps/web/app/_dashboard/session.ts`) → `{ me, groupId }`; the `gruppe/[slug]/layout.tsx` already calls it, but pages that need `groupId`/`me` call it again themselves (it's idempotent).
- Read methods: `listMembers(db, { groupId })`, `countMembersByStatus(db, { groupId })`, `signupsOverTime(db, { groupId, days })` from `@bdas/members`; `listManagedEvents(db, viewerFrom(me))` from `@bdas/events-module` (then filter `e.groupId === groupId`); `listFolders(db, me)` from `@bdas/files` (then filter `f.groupId === groupId`); `getGroupBySlug(db, slug)`, `updateGroup(db, id, input)` from `@bdas/groups`.
- `updateGroup(db, id, input: unknown)` Zod-parses input internally and does NOT self-gate — the Server Action must check `canManageGroup(me.grants, groupId)` (from `@bdas/members`). Inspect `modules/groups/src/services/manage.ts` `UpdateGroupInput` for the exact editable fields (expect at least `name`, `city`; pass only fields that exist).
- Existing per-page imports depth from `gruppe/[slug]/<name>/page.tsx`: five levels up to `apps/web` for `lib/` (`<name> → [slug] → gruppe → (board) → app → web`) — verify with typecheck.
- Component props: `MembersTable({ members, groupNames, revalidatePath })`, `EventsTable({ events, groupNames })`, `FoldersTable({ folders, groupNames })`, `Tile({ value, label })`, `Sparkline({ points, label })`, `ActionStrip({ items })`.
- Tokens only; German labels; all pages `force-dynamic`.

---

## Task 1: Local overview page

**Files:** Replace `apps/web/app/(board)/gruppe/[slug]/overview/page.tsx`

- [ ] **Step 1: Implement**

```tsx
import { getDb } from "@bdas/db";
import { listManagedEvents } from "@bdas/events-module";
import { countMembersByStatus, signupsOverTime } from "@bdas/members";

import { requireGroupScope } from "../../../../_dashboard/session";
import { viewerFrom } from "../../../../../lib/event-viewer";
import { ActionStrip } from "../../../_components/ActionStrip";
import { Sparkline } from "../../../_components/Sparkline";
import { Tile } from "../../../_components/Tile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Übersicht" };

export default async function GroupOverviewPage({ params }: { params: { slug: string } }) {
  const { me, groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const [counts, signups, events] = await Promise.all([
    countMembersByStatus(db, { groupId }),
    signupsOverTime(db, { groupId, days: 30 }),
    listManagedEvents(db, viewerFrom(me)),
  ]);
  const groupEvents = events.filter((e) => e.groupId === groupId);
  const upcoming = groupEvents.filter(
    (e) => e.status === "published" && e.startsAt > new Date(),
  ).length;
  const newSignups = signups.reduce((n, p) => n + p.count, 0);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-bdas-ink">Übersicht</h1>
      <ActionStrip
        items={[
          { count: counts.pending, label: "Freigaben", href: `/gruppe/${params.slug}/members` },
        ]}
      />
      <div className="flex flex-wrap gap-3">
        <Tile value={String(counts.active)} label="Aktive Mitglieder" />
        <Tile value={`+${newSignups}`} label="Neu (30 T.)" />
        <Tile value={String(upcoming)} label="Anstehende Events" />
      </div>
      <Sparkline points={signups} label="Anmeldungen (30 Tage)" />
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

`pnpm --filter @bdas/web typecheck` → PASS (fix `../` depths if flagged).

```bash
git add "apps/web/app/(board)/gruppe/[slug]/overview/page.tsx"
git commit -m "$(printf 'feat(web): local group overview page\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Local members + events pages

**Files:**

- Replace: `apps/web/app/(board)/gruppe/[slug]/members/page.tsx`
- Replace: `apps/web/app/(board)/gruppe/[slug]/events/page.tsx`

- [ ] **Step 1: Members page**

```tsx
import { getDb } from "@bdas/db";
import { getGroupBySlug } from "@bdas/groups";
import { listMembers } from "@bdas/members";

import { requireGroupScope } from "../../../../_dashboard/session";
import { MembersTable } from "../../../_components/MembersTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mitglieder" };

export default async function GroupMembersPage({ params }: { params: { slug: string } }) {
  const { groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const [members, group] = await Promise.all([
    listMembers(db, { groupId }),
    getGroupBySlug(db, params.slug),
  ]);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Mitglieder</h1>
      <MembersTable
        members={members}
        groupNames={group ? { [group.id]: group.name } : {}}
        revalidatePath={`/gruppe/${params.slug}/members`}
      />
    </section>
  );
}
```

- [ ] **Step 2: Events page**

```tsx
import { getDb } from "@bdas/db";
import { listManagedEvents } from "@bdas/events-module";
import { getGroupBySlug } from "@bdas/groups";

import { requireGroupScope } from "../../../../_dashboard/session";
import { viewerFrom } from "../../../../../lib/event-viewer";
import { EventsTable } from "../../../_components/EventsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

export default async function GroupEventsPage({ params }: { params: { slug: string } }) {
  const { me, groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const [events, group] = await Promise.all([
    listManagedEvents(db, viewerFrom(me)),
    getGroupBySlug(db, params.slug),
  ]);
  const groupEvents = events.filter((e) => e.groupId === groupId);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Events</h1>
      <EventsTable events={[...groupEvents]} groupNames={group ? { [group.id]: group.name } : {}} />
    </section>
  );
}
```

(Match `EventsTable`'s actual prop type from PR 4 — it takes `EventWithCounts[]`; spread the readonly array.)

- [ ] **Step 3: Typecheck + commit**

`pnpm --filter @bdas/web typecheck` → PASS.

```bash
git add "apps/web/app/(board)/gruppe/[slug]/members/page.tsx" "apps/web/app/(board)/gruppe/[slug]/events/page.tsx"
git commit -m "$(printf 'feat(web): local members + events pages\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Group profile editor

**Files:**

- Create: `apps/web/app/(board)/_components/group-profile-actions.ts`
- Create: `apps/web/app/(board)/_components/GroupProfileForm.tsx`
- Replace: `apps/web/app/(board)/gruppe/[slug]/profile/page.tsx`

- [ ] **Step 1: Server action (canManageGroup-gated)**

Create `group-profile-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { updateGroup } from "@bdas/groups";
import { canManageGroup, getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

/** Update a group's profile. Gated: federal, or a board/lead of that group. */
export async function updateGroupProfileAction(
  groupId: string,
  input: { name: string; city: string },
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) return { ok: false, error: "Nicht angemeldet." };
  const isLead = me.grants.some((g) => g.role === "local_board_lead" && g.groupId === groupId);
  if (!canManageGroup(me.grants, groupId) && !isLead) {
    return { ok: false, error: "Keine Berechtigung für diese Gruppe." };
  }
  try {
    await updateGroup(getDb(), groupId, input);
    revalidatePath(revalidate);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
```

Inspect `UpdateGroupInput` in `modules/groups/src/services/manage.ts`; if it accepts more editable fields (e.g. `description`), extend the input type and form accordingly — pass only fields the schema accepts.

- [ ] **Step 2: Form component**

Create `GroupProfileForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { updateGroupProfileAction } from "./group-profile-actions";

export function GroupProfileForm({
  groupId,
  initial,
  revalidatePath,
}: {
  groupId: string;
  initial: { name: string; city: string };
  revalidatePath: string;
}) {
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex max-w-md flex-col gap-3 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card"
      action={() =>
        start(async () => {
          setMsg(null);
          const res = await updateGroupProfileAction(groupId, form, revalidatePath);
          setMsg(res.ok ? "Gespeichert." : (res.error ?? "Fehler"));
        })
      }
    >
      <label className="flex flex-col gap-1 text-sm text-bdas-ink-muted">
        Name
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-bdas-ink-muted">
        Stadt
        <input
          required
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface disabled:opacity-40"
      >
        Speichern
      </button>
      {msg && <p className="text-sm text-bdas-ink-body">{msg}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Page**

Replace `profile/page.tsx`:

```tsx
import { getDb } from "@bdas/db";
import { getGroupBySlug } from "@bdas/groups";

import { requireGroupScope } from "../../../../_dashboard/session";
import { GroupProfileForm } from "../../../_components/GroupProfileForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil" };

export default async function GroupProfilePage({ params }: { params: { slug: string } }) {
  const { groupId } = await requireGroupScope(params.slug);
  const group = await getGroupBySlug(getDb(), params.slug);
  if (!group) return null;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Profil</h1>
      <GroupProfileForm
        groupId={groupId}
        initial={{ name: group.name, city: group.city }}
        revalidatePath={`/gruppe/${params.slug}/profile`}
      />
    </section>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

`pnpm --filter @bdas/web typecheck` → PASS.

```bash
git add "apps/web/app/(board)/_components/group-profile-actions.ts" "apps/web/app/(board)/_components/GroupProfileForm.tsx" "apps/web/app/(board)/gruppe/[slug]/profile/page.tsx"
git commit -m "$(printf 'feat(web): group profile editor\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Local files page

**Files:** Replace `apps/web/app/(board)/gruppe/[slug]/files/page.tsx`

- [ ] **Step 1: Implement**

```tsx
import { getDb } from "@bdas/db";
import { listFolders } from "@bdas/files";
import { getGroupBySlug } from "@bdas/groups";

import { requireGroupScope } from "../../../../_dashboard/session";
import { FoldersTable } from "../../../_components/FoldersTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dateien" };

export default async function GroupFilesPage({ params }: { params: { slug: string } }) {
  const { me, groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const [folders, group] = await Promise.all([
    listFolders(db, me),
    getGroupBySlug(db, params.slug),
  ]);
  const groupFolders = folders.filter((f) => f.groupId === groupId);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Dateien</h1>
      <FoldersTable folders={groupFolders} groupNames={group ? { [group.id]: group.name } : {}} />
    </section>
  );
}
```

(`listFolders` already permission-filters for `me`; the page additionally narrows to this group's folders.)

- [ ] **Step 2: Build + commit**

`pnpm --filter @bdas/web build` → PASS (all gruppe pages dynamic).

```bash
git add "apps/web/app/(board)/gruppe/[slug]/files/page.tsx"
git commit -m "$(printf 'feat(web): local files (folders) page\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Guard rails

- [ ] `pnpm --filter @bdas/members test` and `pnpm --filter @bdas/dashboard-shell test` → PASS.
- [ ] `pnpm typecheck && pnpm lint` → PASS; fix flagged issues in place.
- [ ] `pnpm --filter @bdas/web build` → PASS.
- [ ] Commit any fix.

---

## Self-review notes

- **No new module surface** — pure composition over PR 3–5 methods; no cycles possible.
- **Profile action re-gates** (`canManageGroup` OR lead of the group) because `updateGroup` does not self-gate; actor from session only.
- **A lead counts as managing its group** for profile editing — consistent with the design spec's local-scope access (`local_board`/`local_board_lead`/federal).
- **Events/files narrowing is page-side filtering** of already-permission-checked reads — display narrowing, not an authorization boundary.
- Deferred (Phase 6 / later): join-policy editor, group-change decisions, broadcasts, handover, projects, event create/edit in dashboard, file upload UI.

```

```
