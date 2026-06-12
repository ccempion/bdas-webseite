# Phase 3 PR 3 — Member read-methods + member table + federal overview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the `members` read-side methods the cockpit needs, render the federal members table (filters + search + inline approve/reject), and the federal overview (action strip + tiles + signups sparkline).

**Architecture:** New query methods on the `members` module surface (TDD against Docker Postgres). `members` owns its own query type `MemberQuery` — it must NOT import `Scope` from `@bdas/dashboard-shell` (that would create a cycle; `dashboard-shell` already imports `members` types). `apps/web` translates the active `Scope` → `MemberQuery`. The table is a reusable client component PR 4 will reuse for events/groups/files. Charts are inline SVG sparklines — no charting dependency (CLAUDE.md stack pin).

**Tech Stack:** TypeScript, Drizzle, Postgres (Docker for tests), Next.js App Router (Server Components + Server Actions), Tailwind `bdas-*` tokens, Vitest.

---

## Background the executor needs

- **Members table columns:** `id, userId, firstName, lastName, primaryGroupId (nullable), status ('pending'|'active'|'inactive'|'alumnus'), joinedAt (nullable), createdAt, updatedAt`. `row2member` (in `modules/members/src/services/get.ts`) maps a row → `Member`.
- **Query pattern to mirror:** `modules/members/src/services/list-pending.ts` (Drizzle `select().from(members).where(...).orderBy(asc(...))`).
- **Existing write actions for the table:** `approveMember(db, memberId, actor)` (pending→active, board-gated) and `transitionStatus(db, memberId, to, actor)` — both from `@bdas/members`; `actor = { userId, grants }`. Reuse; do not reimplement authority.
- **Group names:** `listGroups(getDb())` → `GroupSummary[]` (`id, slug, name, city, status`). The table maps `primaryGroupId` → name client-side from a passed map.
- **Session in a page:** `getCurrentMember(getDb(), readSessionCookie())` → `{ user, member, grants }`. `getDb` from `@bdas/db`, `readSessionCookie` from `apps/web/lib/auth-cookie`.
- **Scope → query translation lives in apps/web**, e.g. a federal page passes `{}` (federation-wide); a group page passes `{ groupId }`.
- **Design tokens:** `text-bdas-ink|ink-body|ink-muted`, `text-bdas-red`/`bg-bdas-red` (active/open only), `bg-bdas-surface|surface-hover`, `border-bdas-soft|strong`, `rounded-bdas|bdas-sm|bdas-pill`, `shadow-bdas-card|dropdown`. No inline hex.
- **Design intent (locked):** member table = hybrid — inline Freigeben/Ablehnen on pending rows, row click opens a detail drawer (profile fields). Overview = action strip (lit only when >0) + tiles + one sparkline. Pending-approvals is the only action item in PR 3 (events-awaiting-publish lands in PR 4; group-change is Phase 6).
- Docker Postgres is up at `postgres://bdas:bdas@localhost:5432/bdas` — members integration tests RUN.

Module tests: `pnpm --filter @bdas/members test`. Web typecheck: `pnpm --filter @bdas/web typecheck`.

---

## Task 1: `MemberQuery` + `listMembers`

**Files:**

- Create: `modules/members/src/services/list-members.ts`
- Modify: `modules/members/src/index.ts` (export)
- Test: `modules/members/src/index.test.ts` (new `it` block; reuse the existing harness — it already migrates auth+groups+members 0001-0003 and has `createUser`/`createGroup`/`createProfile`/`approveMember`/`BOARD`)

- [ ] **Step 1: Write the failing test**

Add to `modules/members/src/index.test.ts` (inside the `describeIfDb` block, after the last test):

```ts
it("listMembers filters by group, status, and search", async () => {
  await createGroup("grp_a", "aachen");
  await createGroup("grp_b", "bonn");
  await createUser("usr_la", "la@example.de");
  await createUser("usr_lb", "lb@example.de");
  const la = await createProfile(t.db, {
    userId: "usr_la",
    firstName: "Lena",
    lastName: "Anders",
    primaryGroupId: "grp_a",
  });
  await createProfile(t.db, {
    userId: "usr_lb",
    firstName: "Tom",
    lastName: "Berg",
    primaryGroupId: "grp_b",
  });
  await approveMember(t.db, la.id, BOARD); // la → active; tom stays pending

  const all = await listMembers(t.db, {});
  expect(all.length).toBe(2);

  const groupA = await listMembers(t.db, { groupId: "grp_a" });
  expect(groupA.map((m) => m.id)).toEqual([la.id]);

  const pending = await listMembers(t.db, { status: "pending" });
  expect(pending.every((m) => m.status === "pending")).toBe(true);

  const search = await listMembers(t.db, { search: "lena" });
  expect(search.map((m) => m.id)).toEqual([la.id]);
});
```

Add `listMembers` to the existing service import block at the top of the test file:

```ts
import { listMembers } from "./services/list-members";
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bdas/members test -- index.test`
Expected: FAIL — `./services/list-members` does not exist.

- [ ] **Step 3: Implement**

Create `modules/members/src/services/list-members.ts`:

```ts
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { members } from "../schema";
import type { Member, MemberStatus } from "../types";

import { row2member } from "./get";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Read-side member query for the dashboard. Owned by `members` (NOT importing
 * dashboard-shell's Scope — that would create a cycle). Federation-wide when
 * `groupId` is omitted; group-scoped when set. `search` matches first/last name
 * case-insensitively. Authorization is the caller's responsibility (the board
 * route-group layouts already gate by scope before this runs).
 */
export type MemberQuery = {
  readonly groupId?: string;
  readonly status?: MemberStatus;
  readonly search?: string;
};

export async function listMembers(db: Db, q: MemberQuery = {}): Promise<Member[]> {
  const conds: SQL[] = [];
  if (q.groupId) conds.push(eq(members.primaryGroupId, q.groupId));
  if (q.status) conds.push(eq(members.status, q.status));
  if (q.search && q.search.trim() !== "") {
    const pat = `%${q.search.trim()}%`;
    conds.push(or(ilike(members.firstName, pat), ilike(members.lastName, pat)) as SQL);
  }
  const rows = await db
    .select()
    .from(members)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(members.lastName), asc(members.firstName));
  return rows.map(row2member);
}
```

- [ ] **Step 4: Export from the surface**

In `modules/members/src/index.ts`, add:

```ts
export { listMembers, type MemberQuery } from "./services/list-members";
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @bdas/members test -- index.test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/members/src/services/list-members.ts modules/members/src/index.ts modules/members/src/index.test.ts
git commit -m "$(printf 'feat(members): listMembers query for the dashboard\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: `countMembersByStatus` + `signupsOverTime`

**Files:**

- Create: `modules/members/src/services/stats.ts`
- Modify: `modules/members/src/index.ts`
- Test: `modules/members/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `modules/members/src/index.test.ts`:

```ts
it("countMembersByStatus and signupsOverTime aggregate, group-scopable", async () => {
  await createGroup("grp_a", "aachen");
  await createUser("usr_s1", "s1@example.de");
  await createUser("usr_s2", "s2@example.de");
  const s1 = await createProfile(t.db, {
    userId: "usr_s1",
    firstName: "A",
    lastName: "A",
    primaryGroupId: "grp_a",
  });
  await createProfile(t.db, {
    userId: "usr_s2",
    firstName: "B",
    lastName: "B",
    primaryGroupId: "grp_a",
  });
  await approveMember(t.db, s1.id, BOARD);

  const counts = await countMembersByStatus(t.db, {});
  expect(counts.active).toBe(1);
  expect(counts.pending).toBe(1);

  const series = await signupsOverTime(t.db, { days: 30 });
  const total = series.reduce((n, p) => n + p.count, 0);
  expect(total).toBe(2); // both created within the window
  expect(series.length).toBe(30); // one bucket per day, zero-filled

  const scoped = await countMembersByStatus(t.db, { groupId: "grp_a" });
  expect(scoped.active + scoped.pending).toBe(2);
});
```

Add imports to the test file:

```ts
import { countMembersByStatus, signupsOverTime } from "./services/stats";
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bdas/members test -- index.test`
Expected: FAIL — `./services/stats` missing.

- [ ] **Step 3: Implement**

Create `modules/members/src/services/stats.ts`:

```ts
import { and, eq, gte, sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { members } from "../schema";
import type { MemberStatus } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;
export type StatusCounts = Record<MemberStatus, number>;
export type SignupPoint = { readonly day: string; readonly count: number };

const ZERO: StatusCounts = { pending: 0, active: 0, inactive: 0, alumnus: 0 };

export async function countMembersByStatus(
  db: Db,
  q: { readonly groupId?: string } = {},
): Promise<StatusCounts> {
  const where = q.groupId ? eq(members.primaryGroupId, q.groupId) : undefined;
  const rows = await db
    .select({ status: members.status, n: sql<number>`count(*)::int` })
    .from(members)
    .where(where)
    .groupBy(members.status);
  const out: StatusCounts = { ...ZERO };
  for (const r of rows) out[r.status as MemberStatus] = r.n;
  return out;
}

/**
 * Daily signup counts over the last `days` days (default 30), zero-filled so
 * the sparkline always has `days` buckets. `day` is an ISO date (YYYY-MM-DD).
 */
export async function signupsOverTime(
  db: Db,
  q: { readonly groupId?: string; readonly days?: number } = {},
): Promise<SignupPoint[]> {
  const days = q.days ?? 30;
  const conds: SQL[] = [gte(members.createdAt, sql`now() - (${days} || ' days')::interval`)];
  if (q.groupId) conds.push(eq(members.primaryGroupId, q.groupId));
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${members.createdAt}), 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(members)
    .where(and(...conds))
    .groupBy(sql`date_trunc('day', ${members.createdAt})`);

  const byDay = new Map(rows.map((r) => [r.day, r.n]));
  const out: SignupPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: byDay.get(key) ?? 0 });
  }
  return out;
}
```

- [ ] **Step 4: Export**

In `modules/members/src/index.ts`:

```ts
export {
  countMembersByStatus,
  signupsOverTime,
  type StatusCounts,
  type SignupPoint,
} from "./services/stats";
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @bdas/members test -- index.test`
Expected: PASS. (If the zero-filled `series.length` assertion is off by one due to UTC vs local day boundaries, the implementation uses UTC consistently — keep both test and impl on `toISOString().slice(0,10)`.)

- [ ] **Step 6: Commit**

```bash
git add modules/members/src/services/stats.ts modules/members/src/index.ts modules/members/src/index.test.ts
git commit -m "$(printf 'feat(members): countMembersByStatus + signupsOverTime\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Sparkline + Tiles presentational components

**Files:**

- Create: `apps/web/app/(board)/_components/Sparkline.tsx`
- Create: `apps/web/app/(board)/_components/Tile.tsx`
- Create: `apps/web/app/(board)/_components/ActionStrip.tsx`

These are pure presentational; verified by typecheck + build.

- [ ] **Step 1: Sparkline (inline SVG, no deps)**

Create `apps/web/app/(board)/_components/Sparkline.tsx`:

```tsx
import type { SignupPoint } from "@bdas/members";

/** Minimal inline-SVG area sparkline. No charting dependency (CLAUDE.md pin). */
export function Sparkline({ points, label }: { points: SignupPoint[]; label: string }) {
  const w = 320;
  const h = 56;
  const max = Math.max(1, ...points.map((p) => p.count));
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((p, i) => [i * step, h - (p.count / max) * (h - 4) - 2] as const);
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <figure className="rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card-low">
      <figcaption className="mb-2 text-bdas-icon font-semibold uppercase tracking-wide text-bdas-ink-muted">
        {label}
      </figcaption>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        <path d={area} className="fill-bdas-red/10" />
        <path d={line} className="fill-none stroke-bdas-red" strokeWidth={2} />
      </svg>
    </figure>
  );
}
```

(If `fill-bdas-red/10` opacity utility doesn't resolve, use `fill-bdas-red` on the line and give the area `className="fill-bdas-red" fillOpacity={0.1}` via an attribute instead.)

- [ ] **Step 2: Tile**

Create `apps/web/app/(board)/_components/Tile.tsx`:

```tsx
export function Tile({ value, label, muted }: { value: string; label: string; muted?: boolean }) {
  return (
    <div
      className={`flex-1 rounded-bdas border border-bdas-soft p-4 ${muted ? "opacity-40" : "bg-bdas-surface"}`}
    >
      <div className="text-2xl font-semibold text-bdas-ink">{value}</div>
      <div className="text-bdas-icon text-bdas-ink-muted">{label}</div>
    </div>
  );
}
```

- [ ] **Step 3: ActionStrip**

Create `apps/web/app/(board)/_components/ActionStrip.tsx`:

```tsx
import Link from "next/link";

export type ActionItem = { readonly count: number; readonly label: string; readonly href: string };

/** Slim row of work counters; an item with count 0 renders calm (grey). */
export function ActionStrip({ items }: { items: ActionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const lit = it.count > 0;
        return (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center gap-2 rounded-bdas border border-bdas-soft px-3 py-2 text-bdas-ink-body transition-colors hover:bg-bdas-surface-hover"
          >
            <span
              className={`min-w-[22px] rounded-bdas-pill px-2 py-0.5 text-center text-sm font-bold ${
                lit ? "bg-bdas-red text-bdas-surface" : "bg-bdas-surface-hover text-bdas-ink-muted"
              }`}
            >
              {it.count}
            </span>
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter @bdas/web typecheck` → PASS.

```bash
git add "apps/web/app/(board)/_components"
git commit -m "$(printf 'feat(web): board overview presentational components\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Members table component + approve/reject Server Actions

**Files:**

- Create: `apps/web/app/(board)/_components/MembersTable.tsx` (client)
- Create: `apps/web/app/(board)/_components/member-actions.ts` (server actions)

- [ ] **Step 1: Server actions**

Create `apps/web/app/(board)/_components/member-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { approveMember, getCurrentMember, transitionStatus } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

async function actor() {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) throw new Error("Nicht angemeldet.");
  return { userId: me.user.id, grants: me.grants };
}

/** Approve a pending member. Authority is enforced inside approveMember. */
export async function approveMemberAction(memberId: string, revalidate: string): Promise<void> {
  await approveMember(getDb(), memberId, await actor());
  revalidatePath(revalidate);
}

/** Reject a pending member → inactive. */
export async function rejectMemberAction(memberId: string, revalidate: string): Promise<void> {
  await transitionStatus(getDb(), memberId, "inactive", await actor());
  revalidatePath(revalidate);
}
```

- [ ] **Step 2: MembersTable (client) — filters, search, inline actions, detail drawer**

Create `apps/web/app/(board)/_components/MembersTable.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";

import type { Member, MemberStatus } from "@bdas/members";

import { approveMemberAction, rejectMemberAction } from "./member-actions";

const STATUS_LABEL: Record<MemberStatus, string> = {
  pending: "Ausstehend",
  active: "Aktiv",
  inactive: "Inaktiv",
  alumnus: "Alumni",
};
const FILTERS: ReadonlyArray<{ key: "all" | MemberStatus; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Aktiv" },
  { key: "pending", label: "Ausstehend" },
  { key: "alumnus", label: "Alumni" },
];

export function MembersTable({
  members,
  groupNames,
  revalidatePath,
}: {
  members: Member[];
  groupNames: Record<string, string>;
  revalidatePath: string;
}) {
  const [filter, setFilter] = useState<"all" | MemberStatus>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);
  const [pending, start] = useTransition();

  const rows = useMemo(
    () =>
      members.filter(
        (m) =>
          (filter === "all" || m.status === filter) &&
          (q.trim() === "" ||
            `${m.firstName} ${m.lastName}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [members, filter, q],
  );

  return (
    <div className="flex gap-4">
      <div className="flex-1 overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-bdas-soft p-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-bdas-pill px-3 py-1 text-sm transition-colors ${
                filter === f.key
                  ? "bg-bdas-red text-bdas-surface"
                  : "border border-bdas-soft text-bdas-ink-body hover:bg-bdas-surface-hover"
              }`}
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
              <th className="p-3 text-left font-medium">Name</th>
              <th className="p-3 text-left font-medium">Gruppe</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3 text-left font-medium">Beigetreten</th>
              <th className="p-3 text-left font-medium">Schnellaktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-bdas-soft hover:bg-bdas-surface-hover">
                <td className="cursor-pointer p-3 text-bdas-ink" onClick={() => setSelected(m)}>
                  {m.firstName} {m.lastName} ›
                </td>
                <td className="p-3 text-bdas-ink-body">
                  {m.primaryGroupId ? (groupNames[m.primaryGroupId] ?? "—") : "—"}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-bdas-pill px-2 py-0.5 text-xs font-semibold ${m.status === "pending" ? "bg-bdas-red/10 text-bdas-red" : "bg-bdas-surface-hover text-bdas-ink-body"}`}
                  >
                    {STATUS_LABEL[m.status]}
                  </span>
                </td>
                <td className="p-3 text-bdas-ink-body">
                  {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString("de-DE") : "—"}
                </td>
                <td className="p-3">
                  {m.status === "pending" && (
                    <span className="flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          start(() => {
                            void approveMemberAction(m.id, revalidatePath);
                          })
                        }
                        className="rounded-bdas-sm bg-bdas-red px-2 py-1 text-xs font-semibold text-bdas-surface"
                      >
                        Freigeben
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          start(() => {
                            void rejectMemberAction(m.id, revalidatePath);
                          })
                        }
                        className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs"
                      >
                        Ablehnen
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-bdas-ink-muted">
                  Keine Mitglieder.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <aside className="w-72 shrink-0 rounded-bdas border-l-2 border-bdas-red bg-bdas-surface p-4 shadow-bdas-card">
          <h3 className="text-lg font-semibold text-bdas-ink">
            {selected.firstName} {selected.lastName}
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between border-b border-bdas-soft pb-1">
              <dt className="text-bdas-ink-muted">Status</dt>
              <dd className="text-bdas-ink-body">{STATUS_LABEL[selected.status]}</dd>
            </div>
            <div className="flex justify-between border-b border-bdas-soft pb-1">
              <dt className="text-bdas-ink-muted">Gruppe</dt>
              <dd className="text-bdas-ink-body">
                {selected.primaryGroupId ? (groupNames[selected.primaryGroupId] ?? "—") : "—"}
              </dd>
            </div>
            <div className="flex justify-between border-b border-bdas-soft pb-1">
              <dt className="text-bdas-ink-muted">Beigetreten</dt>
              <dd className="text-bdas-ink-body">
                {selected.joinedAt ? new Date(selected.joinedAt).toLocaleDateString("de-DE") : "—"}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mt-4 text-sm text-bdas-ink-muted hover:text-bdas-ink"
          >
            Schließen
          </button>
        </aside>
      )}
    </div>
  );
}
```

(If `bg-bdas-red/10` opacity utilities don't resolve in this Tailwind config, replace with `bg-bdas-surface-hover text-bdas-red` for the pending pill.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @bdas/web typecheck` → PASS.

```bash
git add "apps/web/app/(board)/_components/MembersTable.tsx" "apps/web/app/(board)/_components/member-actions.ts"
git commit -m "$(printf 'feat(web): members table with inline approve/reject + drawer\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Wire federal members + overview pages

**Files:**

- Replace placeholder: `apps/web/app/(board)/federal/members/page.tsx`
- Replace placeholder: `apps/web/app/(board)/federal/overview/page.tsx`

- [ ] **Step 1: Federal members page**

Replace `apps/web/app/(board)/federal/members/page.tsx`:

```tsx
import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { listMembers } from "@bdas/members";

import { MembersTable } from "../../_components/MembersTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mitglieder" };

export default async function FederalMembersPage() {
  const db = getDb();
  const [members, groups] = await Promise.all([listMembers(db, {}), listGroups(db)]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Mitglieder</h1>
      <MembersTable members={members} groupNames={groupNames} revalidatePath="/federal/members" />
    </section>
  );
}
```

- [ ] **Step 2: Federal overview page**

Replace `apps/web/app/(board)/federal/overview/page.tsx`:

```tsx
import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { countMembersByStatus, signupsOverTime } from "@bdas/members";

import { ActionStrip } from "../../_components/ActionStrip";
import { Sparkline } from "../../_components/Sparkline";
import { Tile } from "../../_components/Tile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Übersicht" };

export default async function FederalOverviewPage() {
  const db = getDb();
  const [counts, signups, groups] = await Promise.all([
    countMembersByStatus(db, {}),
    signupsOverTime(db, { days: 30 }),
    listGroups(db, { status: "active" }),
  ]);
  const newSignups = signups.reduce((n, p) => n + p.count, 0);

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-bdas-ink">Übersicht · Bundesverband</h1>
      <ActionStrip
        items={[{ count: counts.pending, label: "Freigaben", href: "/federal/members" }]}
      />
      <div className="flex flex-wrap gap-3">
        <Tile value={String(counts.active)} label="Aktive Mitglieder" />
        <Tile value={`+${newSignups}`} label="Neu (30 T.)" />
        <Tile value={String(groups.length)} label="Gruppen aktiv" />
      </div>
      <Sparkline points={signups} label="Anmeldungen (30 Tage)" />
    </section>
  );
}
```

- [ ] **Step 3: Build + commit**

Run: `pnpm --filter @bdas/web build` → PASS (federal/members + federal/overview are dynamic).

```bash
git add "apps/web/app/(board)/federal/members/page.tsx" "apps/web/app/(board)/federal/overview/page.tsx"
git commit -m "$(printf 'feat(web): federal members table + overview pages\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: Guard rails

- [ ] **Step 1:** Run `pnpm --filter @bdas/members test` → all PASS (incl. the two new read-method tests, RAN not skipped).
- [ ] **Step 2:** Run `pnpm typecheck && pnpm lint` → PASS across the repo. Fix any issue at the flagged location (e.g. an unused import) and re-run.
- [ ] **Step 3:** No commit if nothing changed; otherwise commit the fix.

---

## Self-review notes (already reconciled)

- **No cycle:** `members` defines its own `MemberQuery`/stats types; it does NOT import `@bdas/dashboard-shell`. apps/web translates Scope → query at the call site.
- **Charts:** inline SVG only; no new dependency (CLAUDE.md stack pin honored).
- **Authorization:** the table's Server Actions call `approveMember`/`transitionStatus`, which enforce board authority internally; the page itself sits under the already-gated `(board)/federal` layout. `listMembers` is an unguarded read by design — the scope gate upstream restricts who reaches the page.
- **Reuse:** `MembersTable`, `Tile`, `Sparkline`, `ActionStrip` are the templates PR 4 (events/groups/files) and PR 6 (local scope) consume.
- **Tokens only**; pending pill / sparkline fall back noted if opacity utilities are absent in the Tailwind config.

```

```
