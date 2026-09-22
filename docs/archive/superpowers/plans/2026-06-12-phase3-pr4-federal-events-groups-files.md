# Phase 3 PR 4 — Federal events / groups / files tables

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Fill the federal events, groups, and files pages with real data, reusing the PR-3 table/visual pattern. Add group create/archive actions (federal-gated) and an upcoming-events tile to the overview.

**Architecture:** Read methods already exist and are tested — `events.listManagedEvents`, `groups.listGroups/createGroup/archiveGroup`, `files.listFolders`. This PR is mostly Server-Component pages + presentational tables + one group-management Server Action that re-checks federal authority (the `groups.manage` services do NOT self-gate). Minimal new logic → light TDD; verified by build + typecheck. One small correctness fix to `viewerFrom`.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Tailwind `bdas-*` tokens, TypeScript.

---

## Background the executor needs

- **Events package is imported as `@bdas/events-module`** (not `@bdas/events`).
- `listManagedEvents(db, viewer)` → `EventWithCounts[]` (`id, title, groupId, startsAt, status, capacity, confirmedCount, waitlistCount`). Federal viewer → all events. Build the viewer with `viewerFrom(me)` from `apps/web/lib/event-viewer.ts`.
- `listGroups(db, opts?)` → `GroupSummary[]` (`id, slug, name, city, status`). `createGroup(db, input)`, `archiveGroup(db, id)`, `updateGroup(db, id, input)` from `@bdas/groups`. **These do NOT enforce authority** — the caller must gate (`requireFederalBoard(me)` from `@bdas/members`).
- `listFolders(db, me)` → `Folder[]` (`id, name, scope: 'members_all'|'group_members'|'local_board'|'federal_board', groupId`), permission-filtered for the member. For a federal member that is all folders.
- Session: `getCurrentMember(getDb(), readSessionCookie())`. `getDb` from `@bdas/db`, `readSessionCookie` from `apps/web/lib/auth-cookie`.
- Tokens: `text-bdas-ink|ink-body|ink-muted`, `bg-bdas-red`/`text-bdas-red` (active/open only), `bg-bdas-surface|surface-hover`, `border-bdas-soft`, `rounded-bdas|bdas-sm|bdas-pill`, `shadow-bdas-card`. No inline hex.
- Reuse the visual shell of `apps/web/app/(board)/_components/MembersTable.tsx` (filter pills + table inside `rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card`). Build focused per-entity tables — do NOT over-abstract into a generic table.
- All board pages export `dynamic = "force-dynamic"`.

Web checks: `pnpm --filter @bdas/web typecheck`, `pnpm --filter @bdas/web build`. Repo: `pnpm typecheck && pnpm lint`.

---

## Task 1: Fix `viewerFrom` to include local board leads

**Files:** Modify `apps/web/lib/event-viewer.ts`

A `local_board_lead` boards its group and must see its events (matters for PR 6; correct now). In `viewerFrom`, change the `boardGroupIds` filter from `local_board` only to include `local_board_lead`:

- [ ] **Step 1: Edit**

```ts
    boardGroupIds: me.grants
      .filter((g) => (g.role === "local_board" || g.role === "local_board_lead") && g.groupId)
      .map((g) => g.groupId as string),
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @bdas/web typecheck` → PASS.

```bash
git add apps/web/lib/event-viewer.ts
git commit -m "$(printf 'fix(web): event viewer includes local_board_lead group scope\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Federal events table + page

**Files:**

- Create: `apps/web/app/(board)/_components/EventsTable.tsx`
- Replace placeholder: `apps/web/app/(board)/federal/events/page.tsx`

- [ ] **Step 1: EventsTable (client — status filter + search, read-only)**

Create `apps/web/app/(board)/_components/EventsTable.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";

import type { EventItem, EventStatus } from "@bdas/events-module";

type Row = EventItem & { readonly confirmedCount: number };

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Entwurf",
  published: "Veröffentlicht",
  cancelled: "Abgesagt",
};
const FILTERS: ReadonlyArray<{ key: "all" | EventStatus; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "published", label: "Veröffentlicht" },
  { key: "draft", label: "Entwurf" },
  { key: "cancelled", label: "Abgesagt" },
];

export function EventsTable({
  events,
  groupNames,
}: {
  events: Row[];
  groupNames: Record<string, string>;
}) {
  const [filter, setFilter] = useState<"all" | EventStatus>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      events.filter(
        (e) =>
          (filter === "all" || e.status === filter) &&
          (q.trim() === "" || e.title.toLowerCase().includes(q.toLowerCase())),
      ),
    [events, filter, q],
  );
  return (
    <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-bdas-soft p-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-bdas-pill px-3 py-1 text-sm transition-colors ${filter === f.key ? "bg-bdas-red text-bdas-surface" : "border border-bdas-soft text-bdas-ink-body hover:bg-bdas-surface-hover"}`}
          >
            {f.label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suche…"
          className="ml-auto rounded-bdas-sm border border-bdas-soft px-3 py-1 text-bdas-ink-body"
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-bdas-ink-muted">
            <th className="p-3 text-left font-medium">Titel</th>
            <th className="p-3 text-left font-medium">Gruppe</th>
            <th className="p-3 text-left font-medium">Datum</th>
            <th className="p-3 text-left font-medium">Status</th>
            <th className="p-3 text-left font-medium">Anmeldungen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-bdas-soft hover:bg-bdas-surface-hover">
              <td className="p-3 text-bdas-ink">{e.title}</td>
              <td className="p-3 text-bdas-ink-body">
                {e.groupId ? (groupNames[e.groupId] ?? "—") : "Bundesweit"}
              </td>
              <td className="p-3 text-bdas-ink-body">
                {new Date(e.startsAt).toLocaleDateString("de-DE")}
              </td>
              <td className="p-3">
                <span className="rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-ink-body">
                  {STATUS_LABEL[e.status]}
                </span>
              </td>
              <td className="p-3 text-bdas-ink-body">
                {e.confirmedCount}
                {e.capacity ? ` / ${e.capacity}` : ""}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center text-bdas-ink-muted">
                Keine Events.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Page**

Replace `apps/web/app/(board)/federal/events/page.tsx`:

```tsx
import { getDb } from "@bdas/db";
import { listManagedEvents } from "@bdas/events-module";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../lib/event-viewer";
import { EventsTable } from "../../_components/EventsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

export default async function FederalEventsPage() {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const [events, groups] = await Promise.all([
    listManagedEvents(db, viewerFrom(me)),
    listGroups(db),
  ]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Events</h1>
      <EventsTable events={events.map((e) => ({ ...e }))} groupNames={groupNames} />
    </section>
  );
}
```

(Confirm the relative depth of the `../../../../lib` import from `federal/events/page.tsx` — it is four levels up to `apps/web/`: `events → federal → (board) → app → web`. Adjust if typecheck disagrees.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @bdas/web typecheck` → PASS.

```bash
git add "apps/web/app/(board)/_components/EventsTable.tsx" "apps/web/app/(board)/federal/events/page.tsx"
git commit -m "$(printf 'feat(web): federal events table page\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Federal groups table + create/archive actions

**Files:**

- Create: `apps/web/app/(board)/_components/group-actions.ts` (server actions)
- Create: `apps/web/app/(board)/_components/GroupsTable.tsx` (client)
- Create: `apps/web/app/(board)/_components/CreateGroupForm.tsx` (client)
- Replace placeholder: `apps/web/app/(board)/federal/groups/page.tsx`

- [ ] **Step 1: Server actions (federal-gated)**

Create `apps/web/app/(board)/_components/group-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { archiveGroup, createGroup } from "@bdas/groups";
import { getCurrentMember, requireFederalBoard } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

async function assertFederal() {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  requireFederalBoard(me); // throws ForbiddenError if not federal_board
}

export async function createGroupAction(input: {
  name: string;
  city: string;
  slug: string;
}): Promise<void> {
  await assertFederal();
  await createGroup(getDb(), input);
  revalidatePath("/federal/groups");
}

export async function archiveGroupAction(groupId: string): Promise<void> {
  await assertFederal();
  await archiveGroup(getDb(), groupId);
  revalidatePath("/federal/groups");
}
```

(If `createGroup`'s validated input shape differs, inspect `modules/groups/src/services/manage.ts` `CreateGroupInput` and pass exactly those fields.)

- [ ] **Step 2: CreateGroupForm (client)**

Create `apps/web/app/(board)/_components/CreateGroupForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { createGroupAction } from "./group-actions";

export function CreateGroupForm() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", slug: "" });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface"
      >
        + Gruppe anlegen
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-bdas border border-bdas-soft bg-bdas-surface p-3 shadow-bdas-card"
      action={() =>
        start(async () => {
          setError(null);
          try {
            await createGroupAction(form);
            setForm({ name: "", city: "", slug: "" });
            setOpen(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
          }
        })
      }
    >
      {(["name", "city", "slug"] as const).map((k) => (
        <label key={k} className="flex flex-col text-xs text-bdas-ink-muted">
          {k === "name" ? "Name" : k === "city" ? "Stadt" : "Slug"}
          <input
            required
            value={form[k]}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-bdas-ink"
          />
        </label>
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface"
      >
        Anlegen
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm"
      >
        Abbrechen
      </button>
      {error && <span className="w-full text-xs text-bdas-red">{error}</span>}
    </form>
  );
}
```

- [ ] **Step 3: GroupsTable (client — archive inline)**

Create `apps/web/app/(board)/_components/GroupsTable.tsx`:

```tsx
"use client";

import { useTransition } from "react";

import type { GroupSummary } from "@bdas/groups";

import { archiveGroupAction } from "./group-actions";

const STATUS_LABEL: Record<string, string> = { active: "Aktiv", archived: "Archiviert" };

export function GroupsTable({ groups }: { groups: GroupSummary[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-bdas-ink-muted">
            <th className="p-3 text-left font-medium">Name</th>
            <th className="p-3 text-left font-medium">Stadt</th>
            <th className="p-3 text-left font-medium">Status</th>
            <th className="p-3 text-left font-medium">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} className="border-t border-bdas-soft hover:bg-bdas-surface-hover">
              <td className="p-3 text-bdas-ink">{g.name}</td>
              <td className="p-3 text-bdas-ink-body">{g.city}</td>
              <td className="p-3">
                <span className="rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-ink-body">
                  {STATUS_LABEL[g.status] ?? g.status}
                </span>
              </td>
              <td className="p-3">
                {g.status === "active" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(() => {
                        void archiveGroupAction(g.id);
                      })
                    }
                    className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs"
                  >
                    Archivieren
                  </button>
                )}
              </td>
            </tr>
          ))}
          {groups.length === 0 && (
            <tr>
              <td colSpan={4} className="p-6 text-center text-bdas-ink-muted">
                Keine Gruppen.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Page**

Replace `apps/web/app/(board)/federal/groups/page.tsx`:

```tsx
import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";

import { CreateGroupForm } from "../../_components/CreateGroupForm";
import { GroupsTable } from "../../_components/GroupsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gruppen" };

export default async function FederalGroupsPage() {
  const groups = await listGroups(getDb());
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Gruppen</h1>
      <CreateGroupForm />
      <GroupsTable groups={groups} />
    </section>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @bdas/web typecheck` → PASS.

```bash
git add "apps/web/app/(board)/_components/group-actions.ts" "apps/web/app/(board)/_components/GroupsTable.tsx" "apps/web/app/(board)/_components/CreateGroupForm.tsx" "apps/web/app/(board)/federal/groups/page.tsx"
git commit -m "$(printf 'feat(web): federal groups table + create/archive actions\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Federal files (folders) page

**Files:**

- Create: `apps/web/app/(board)/_components/FoldersTable.tsx`
- Replace placeholder: `apps/web/app/(board)/federal/files/page.tsx`

- [ ] **Step 1: FoldersTable (server component — read-only)**

Create `apps/web/app/(board)/_components/FoldersTable.tsx`:

```tsx
import type { Folder } from "@bdas/files";

const SCOPE_LABEL: Record<Folder["scope"], string> = {
  members_all: "Alle Mitglieder",
  group_members: "Gruppenmitglieder",
  local_board: "Lokaler Vorstand",
  federal_board: "Bundesvorstand",
};

export function FoldersTable({
  folders,
  groupNames,
}: {
  folders: Folder[];
  groupNames: Record<string, string>;
}) {
  return (
    <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-bdas-ink-muted">
            <th className="p-3 text-left font-medium">Ordner</th>
            <th className="p-3 text-left font-medium">Sichtbarkeit</th>
            <th className="p-3 text-left font-medium">Gruppe</th>
          </tr>
        </thead>
        <tbody>
          {folders.map((f) => (
            <tr key={f.id} className="border-t border-bdas-soft">
              <td className="p-3 text-bdas-ink">{f.name}</td>
              <td className="p-3 text-bdas-ink-body">{SCOPE_LABEL[f.scope]}</td>
              <td className="p-3 text-bdas-ink-body">
                {f.groupId ? (groupNames[f.groupId] ?? "—") : "—"}
              </td>
            </tr>
          ))}
          {folders.length === 0 && (
            <tr>
              <td colSpan={3} className="p-6 text-center text-bdas-ink-muted">
                Keine Ordner.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Page**

Replace `apps/web/app/(board)/federal/files/page.tsx`:

```tsx
import { getDb } from "@bdas/db";
import { listFolders } from "@bdas/files";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { FoldersTable } from "../../_components/FoldersTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dateien" };

export default async function FederalFilesPage() {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return null; // the (board) layout already gated; this satisfies the type
  const [folders, groups] = await Promise.all([listFolders(db, me), listGroups(db)]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Dateien</h1>
      <FoldersTable folders={folders} groupNames={groupNames} />
    </section>
  );
}
```

(`listFolders` signature is `(db, forMember: CurrentMember)`. If it differs, inspect `modules/files/src/services/folders.ts` and adapt.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @bdas/web typecheck` → PASS.

```bash
git add "apps/web/app/(board)/_components/FoldersTable.tsx" "apps/web/app/(board)/federal/files/page.tsx"
git commit -m "$(printf 'feat(web): federal files (folders) page\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Add the upcoming-events tile to the overview

**Files:** Modify `apps/web/app/(board)/federal/overview/page.tsx`

Now that events data is available, add an "Anstehende Events" tile.

- [ ] **Step 1: Edit the overview page**

Add the imports and a count, and a `<Tile>`:

```tsx
import { listManagedEvents } from "@bdas/events-module";
import { getCurrentMember } from "@bdas/members";
import { readSessionCookie } from "../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../lib/event-viewer";
```

In the component, after the existing `Promise.all`, add an events fetch and compute upcoming:

```tsx
const me = await getCurrentMember(db, readSessionCookie());
const events = await listManagedEvents(db, viewerFrom(me));
const upcoming = events.filter(
  (e) => e.status === "published" && new Date(e.startsAt) > new Date(),
).length;
```

And add a tile in the tiles row:

```tsx
<Tile value={String(upcoming)} label="Anstehende Events" />
```

- [ ] **Step 2: Build + commit**

Run: `pnpm --filter @bdas/web build` → PASS.

```bash
git add "apps/web/app/(board)/federal/overview/page.tsx"
git commit -m "$(printf 'feat(web): upcoming-events tile on federal overview\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: Guard rails

- [ ] **Step 1:** `pnpm --filter @bdas/web build` → PASS (all federal pages dynamic).
- [ ] **Step 2:** `pnpm typecheck && pnpm lint` → PASS across the repo. Fix any flagged issue at its location and re-run.
- [ ] **Step 3:** Commit any fix.

---

## Self-review notes (already reconciled)

- **Authorization:** group create/archive Server Actions re-check `requireFederalBoard` (the `groups.manage` services do not self-gate); read pages sit under the already-gated `(board)/federal` layout. `archiveGroupAction`/`createGroupAction` derive the actor from the session cookie, never client input.
- **Reuse:** EventsTable/GroupsTable/FoldersTable mirror the MembersTable visual shell; no premature generic abstraction.
- **Tokens only**; status pills use neutral `bg-bdas-surface-hover` (brand red reserved for active filter / primary buttons).
- **viewerFrom fix** makes a `local_board_lead` see its group's events (needed by PR 6; correct now).
- **Deferred (not this PR):** event create/edit migration from `/admin/events`, file upload/download UI, access-log surfacing, per-group member-count columns — later refinements.

```

```
