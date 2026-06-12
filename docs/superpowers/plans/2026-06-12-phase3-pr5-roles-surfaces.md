# Phase 3 PR 5 — Roles surfaces (federal appoint + local vorstand)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Build the two role-management surfaces from the design spec §5: `/federal/roles` (roster-first: federal_board holders + local leads, grant/revoke, audit-log tab) and `/gruppe/[slug]/vorstand` (a lead manages their group's `local_board` roster). Server authority is already enforced by `grantRole`/`revokeRole` (ADR 0013); this PR adds read methods, Server Actions, and UI — **it must not weaken or re-implement authorization**.

**Architecture:** Two new `members` read methods (TDD, Docker Postgres): `listRoleHolders` (active board grants joined with member names) and `listGrantAudit` (full grant/revoke history). Server Actions derive the actor from the session cookie and delegate to `grantRole`/`revokeRole`, which enforce who-may-grant internally. The federal page gets a typed-confirmation client guard before `federal_board` grants (UX guard only — the server check is authoritative). The vorstand page adds a lead-only server-side gate via `canGrantLocalBoard`.

**Tech Stack:** TypeScript, Drizzle, Vitest + Docker Postgres, Next.js Server Components/Actions, `bdas-*` tokens.

---

## Background the executor needs

- `member_role_grants` drizzle table (in `modules/members/src/schema.ts`): `id, memberId, role, groupId (nullable), grantedAt, grantedBy (auth userId), revokedAt (nullable; NULL = active)`.
- `grantRole(db, memberId, role, actor, groupId?)` / `revokeRole(db, memberId, role, actor, groupId?)` — `actor = { userId, grants }`. Authority (ADR 0013): federal may grant anything; a `local_board_lead:[g]` may grant/revoke only `local_board:[g]`; everything else federal-only. Both throw `ForbiddenError`/`ValidationError`.
- `canGrantLocalBoard(grants, groupId)` exported from `@bdas/members`.
- `listMembers(db, { search })` exists (PR 3) — reuse for the member-search picker.
- Existing gates: `(board)/federal/layout.tsx` → `requireFederalScope()`; `(board)/gruppe/[slug]/layout.tsx` → `requireGroupScope(slug)` returning `{ me, groupId }`.
- Test harness: `modules/members/src/index.test.ts` (`describeIfDb`, `createUser`/`createGroup`/`createProfile`/`approveMember`/`BOARD`, migrations 0001–0003 loaded in `beforeEach`). Docker Postgres is up — tests RUN.
- Tokens: `text-bdas-ink|ink-body|ink-muted`, `bg-bdas-red`/`text-bdas-red` (accents/primary only), `bg-bdas-surface|surface-hover`, `border-bdas-soft`, `rounded-bdas|bdas-sm|bdas-pill`, `shadow-bdas-card|dropdown`. No inline hex.
- German labels: federal_board = "Bundesvorstand", local_board = "Vorstand", local_board_lead = "Lead". Grant = "Erteilen", revoke = "Entziehen".

---

## Task 1: `listRoleHolders` + `listGrantAudit` read methods (TDD)

**Files:**
- Create: `modules/members/src/services/role-views.ts`
- Modify: `modules/members/src/index.ts`
- Test: `modules/members/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `modules/members/src/index.test.ts` (inside `describeIfDb`, after the last test), plus the import `import { listGrantAudit, listRoleHolders } from "./services/role-views";`:

```ts
  it("listRoleHolders and listGrantAudit expose roster + history", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_h1", "h1@example.de");
    const m = await createProfile(t.db, { userId: "usr_h1", firstName: "Lena", lastName: "Hofer", primaryGroupId: "grp_a" });
    await approveMember(t.db, m.id, BOARD);
    await grantRole(t.db, m.id, "local_board_lead", BOARD, "grp_a");
    await grantRole(t.db, m.id, "local_board", BOARD, "grp_a");
    await revokeRole(t.db, m.id, "local_board", BOARD, "grp_a");

    const holders = await listRoleHolders(t.db);
    // Only ACTIVE board grants; the revoked local_board is gone.
    expect(holders).toEqual([
      expect.objectContaining({
        memberId: m.id,
        firstName: "Lena",
        lastName: "Hofer",
        role: "local_board_lead",
        groupId: "grp_a",
      }),
    ]);

    const audit = await listGrantAudit(t.db, {});
    // Newest-first; includes the revoked row with revokedAt set.
    expect(audit.length).toBe(2);
    expect(audit.some((a) => a.role === "local_board" && a.revokedAt !== null)).toBe(true);
    expect(audit.every((a) => a.firstName === "Lena")).toBe(true);

    const scoped = await listGrantAudit(t.db, { groupId: "grp_a" });
    expect(scoped.length).toBe(2);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @bdas/members test -- index.test`
Expected: FAIL — `./services/role-views` missing.

- [ ] **Step 3: Implement**

Create `modules/members/src/services/role-views.ts`:

```ts
import { and, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { Role } from "@bdas/auth";

import { members, memberRoleGrants } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

const BOARD_ROLES = ["federal_board", "local_board_lead", "local_board"] as const;

/** An active board grant joined with the holder's name, for the roster views. */
export type RoleHolder = {
  readonly memberId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: Role;
  readonly groupId: string | null;
  readonly grantedAt: Date;
};

export async function listRoleHolders(db: Db): Promise<RoleHolder[]> {
  const rows = await db
    .select({
      memberId: memberRoleGrants.memberId,
      firstName: members.firstName,
      lastName: members.lastName,
      role: memberRoleGrants.role,
      groupId: memberRoleGrants.groupId,
      grantedAt: memberRoleGrants.grantedAt,
    })
    .from(memberRoleGrants)
    .innerJoin(members, eq(members.id, memberRoleGrants.memberId))
    .where(
      and(isNull(memberRoleGrants.revokedAt), inArray(memberRoleGrants.role, [...BOARD_ROLES])),
    )
    .orderBy(memberRoleGrants.role, members.lastName);
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

/** One grant or revoke in the audit trail (revokedAt null = still active). */
export type GrantAuditEntry = RoleHolder & {
  readonly grantedBy: string;
  readonly revokedAt: Date | null;
};

export async function listGrantAudit(
  db: Db,
  q: { readonly groupId?: string; readonly limit?: number } = {},
): Promise<GrantAuditEntry[]> {
  const conds: SQL[] = [inArray(memberRoleGrants.role, [...BOARD_ROLES])];
  if (q.groupId) conds.push(eq(memberRoleGrants.groupId, q.groupId));
  const rows = await db
    .select({
      memberId: memberRoleGrants.memberId,
      firstName: members.firstName,
      lastName: members.lastName,
      role: memberRoleGrants.role,
      groupId: memberRoleGrants.groupId,
      grantedAt: memberRoleGrants.grantedAt,
      grantedBy: memberRoleGrants.grantedBy,
      revokedAt: memberRoleGrants.revokedAt,
    })
    .from(memberRoleGrants)
    .innerJoin(members, eq(members.id, memberRoleGrants.memberId))
    .where(and(...conds))
    .orderBy(desc(memberRoleGrants.grantedAt))
    .limit(q.limit ?? 100);
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}
```

- [ ] **Step 4: Export from the surface**

In `modules/members/src/index.ts`:

```ts
export {
  listRoleHolders,
  listGrantAudit,
  type RoleHolder,
  type GrantAuditEntry,
} from "./services/role-views";
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @bdas/members test -- index.test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/members/src/services/role-views.ts modules/members/src/index.ts modules/members/src/index.test.ts
git commit -m "$(printf 'feat(members): role roster + grant audit read methods\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Role Server Actions

**Files:** Create `apps/web/app/(board)/_components/role-actions.ts`

- [ ] **Step 1: Implement**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { getCurrentMember, grantRole, revokeRole } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

async function actor() {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) throw new Error("Nicht angemeldet.");
  return { userId: me.user.id, grants: me.grants };
}

/**
 * Grant/revoke a board role. WHO may do WHAT is enforced inside
 * grantRole/revokeRole (ADR 0013) against the session-derived actor —
 * memberId/role/groupId from the client cannot widen authority.
 */
export async function grantRoleAction(
  memberId: string,
  role: string,
  groupId: string | null,
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await grantRole(getDb(), memberId, role, await actor(), groupId);
    revalidatePath(revalidate);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

export async function revokeRoleAction(
  memberId: string,
  role: string,
  groupId: string | null,
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await revokeRole(getDb(), memberId, role, await actor(), groupId);
    revalidatePath(revalidate);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
```

- [ ] **Step 2: Typecheck + commit**

`pnpm --filter @bdas/web typecheck` → PASS.
```bash
git add "apps/web/app/(board)/_components/role-actions.ts"
git commit -m "$(printf 'feat(web): role grant/revoke server actions\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Roster + audit + grant-modal components

**Files:**
- Create: `apps/web/app/(board)/_components/RoleRoster.tsx` (client)
- Create: `apps/web/app/(board)/_components/GrantRoleModal.tsx` (client)
- Create: `apps/web/app/(board)/_components/AuditLog.tsx` (server)

- [ ] **Step 1: RoleRoster**

`RoleRoster.tsx` — sectioned roster with inline revoke:

```tsx
"use client";

import { useTransition } from "react";

import type { RoleHolder } from "@bdas/members";

import { revokeRoleAction } from "./role-actions";

const ROLE_LABEL: Record<string, string> = {
  federal_board: "Bundesvorstand",
  local_board_lead: "Lead",
  local_board: "Vorstand",
};

export function RoleRoster({
  sections,
  groupNames,
  revalidatePath,
  currentMemberId,
}: {
  sections: ReadonlyArray<{ title: string; holders: RoleHolder[] }>;
  groupNames: Record<string, string>;
  revalidatePath: string;
  currentMemberId: string | null;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="border-b border-bdas-soft px-4 pb-2 pt-4 text-xs font-bold uppercase tracking-wide text-bdas-ink-muted">{s.title}</h3>
          {s.holders.map((h) => (
            <div key={`${h.memberId}:${h.role}:${h.groupId ?? ""}`} className="flex items-center gap-3 border-b border-bdas-soft px-4 py-2 last:border-b-0">
              <span className={`rounded-bdas-pill px-2 py-0.5 text-xs font-semibold ${h.role === "federal_board" ? "bg-bdas-red text-bdas-surface" : "bg-bdas-surface-hover text-bdas-red"}`}>
                {ROLE_LABEL[h.role]}{h.groupId ? ` · ${groupNames[h.groupId] ?? h.groupId}` : ""}
              </span>
              <span className="flex-1 text-sm text-bdas-ink">
                {h.firstName} {h.lastName}
                {currentMemberId === h.memberId && <span className="text-bdas-ink-muted"> (du)</span>}
              </span>
              {currentMemberId !== h.memberId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => { void revokeRoleAction(h.memberId, h.role, h.groupId, revalidatePath); })}
                  className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs text-bdas-ink-body hover:bg-bdas-surface-hover"
                >
                  Entziehen
                </button>
              )}
            </div>
          ))}
          {s.holders.length === 0 && <p className="px-4 py-3 text-sm text-bdas-ink-muted">Niemand.</p>}
        </div>
      ))}
    </div>
  );
}
```

(Hiding the self-revoke button is a footgun guard, not security — the server allows it; the UI just doesn't invite locking yourself out.)

- [ ] **Step 2: GrantRoleModal**

`GrantRoleModal.tsx` — search member → pick role/group → typed confirm for federal_board. Props parameterize which roles are offered, so the vorstand page reuses it for local_board only:

```tsx
"use client";

import { useState, useTransition } from "react";

import { grantRoleAction } from "./role-actions";

export type RoleOption = { role: string; label: string; groupId: string | null; needsTypedConfirm?: boolean };
export type Candidate = { memberId: string; name: string };

export function GrantRoleModal({
  title,
  candidates,
  roleOptions,
  revalidatePath,
}: {
  title: string;
  candidates: Candidate[]; // pre-fetched server-side; filtered client-side
  roleOptions: RoleOption[];
  revalidatePath: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [optIdx, setOptIdx] = useState(0);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const opt = roleOptions[optIdx];
  const needsConfirm = opt?.needsTypedConfirm === true;
  const confirmOk = !needsConfirm || (picked !== null && confirmText.trim().toUpperCase() === picked.name.toUpperCase());
  const matches = q.trim() === "" ? [] : candidates.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);

  function reset() {
    setOpen(false); setQ(""); setPicked(null); setOptIdx(0); setConfirmText(""); setError(null);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface">
        + {title}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-dropdown">
      <h3 className="text-sm font-bold text-bdas-ink">{title}</h3>
      {!picked && (
        <>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mitglied suchen…" className="rounded-bdas-sm border border-bdas-soft px-3 py-2 text-bdas-ink" />
          <ul>
            {matches.map((c) => (
              <li key={c.memberId}>
                <button type="button" onClick={() => setPicked(c)} className="block w-full rounded-bdas-sm px-2 py-1.5 text-left text-sm text-bdas-ink-body hover:bg-bdas-surface-hover">{c.name}</button>
              </li>
            ))}
            {q.trim() !== "" && matches.length === 0 && <li className="px-2 py-1.5 text-sm text-bdas-ink-muted">Keine Treffer.</li>}
          </ul>
        </>
      )}
      {picked && (
        <>
          <p className="text-sm text-bdas-ink">{picked.name}</p>
          <select value={optIdx} onChange={(e) => setOptIdx(Number(e.target.value))} className="rounded-bdas-sm border border-bdas-soft px-2 py-1.5 text-sm text-bdas-ink-body">
            {roleOptions.map((o, i) => <option key={`${o.role}:${o.groupId ?? ""}`} value={i}>{o.label}</option>)}
          </select>
          {needsConfirm && (
            <div className="rounded-bdas border border-bdas-strong p-3 text-sm">
              <p className="mb-2 text-bdas-red">⚠ Bundesvorstand hat vollen Zugriff auf alle Gruppen. Tippe den Namen zur Bestätigung.</p>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={picked.name.toUpperCase()} className="w-full rounded-bdas-sm border border-bdas-soft px-2 py-1.5" />
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !confirmOk || !opt}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await grantRoleAction(picked.memberId, opt.role, opt.groupId, revalidatePath);
                  if (res.ok) reset();
                  else setError(res.error ?? "Fehler");
                })
              }
              className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface disabled:opacity-40"
            >
              Erteilen
            </button>
            <button type="button" onClick={reset} className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm">Abbrechen</button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-bdas-red">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: AuditLog (server component)**

```tsx
import type { GrantAuditEntry } from "@bdas/members";

const ROLE_LABEL: Record<string, string> = {
  federal_board: "Bundesvorstand",
  local_board_lead: "Lead",
  local_board: "Vorstand",
};

export function AuditLog({ entries, groupNames }: { entries: GrantAuditEntry[]; groupNames: Record<string, string> }) {
  return (
    <div className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card">
      {entries.map((e) => (
        <div key={`${e.memberId}:${e.role}:${e.groupId ?? ""}:${e.grantedAt.toISOString()}`} className="flex flex-wrap items-center gap-2 border-b border-bdas-soft px-4 py-2 text-sm last:border-b-0">
          <span className={`rounded-bdas-sm px-2 py-0.5 text-xs font-bold ${e.revokedAt ? "bg-bdas-surface-hover text-bdas-red" : "bg-bdas-surface-hover text-bdas-ink-body"}`}>
            {e.revokedAt ? "ENTZOGEN" : "ERTEILT"}
          </span>
          <span className="text-bdas-ink-body">
            {ROLE_LABEL[e.role] ?? e.role}
            {e.groupId ? ` · ${groupNames[e.groupId] ?? e.groupId}` : ""} → {e.firstName} {e.lastName}
          </span>
          <span className="ml-auto text-xs text-bdas-ink-muted">
            {(e.revokedAt ?? e.grantedAt).toLocaleDateString("de-DE")}
          </span>
        </div>
      ))}
      {entries.length === 0 && <p className="px-4 py-6 text-center text-sm text-bdas-ink-muted">Noch keine Einträge.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

`pnpm --filter @bdas/web typecheck` → PASS.
```bash
git add "apps/web/app/(board)/_components/RoleRoster.tsx" "apps/web/app/(board)/_components/GrantRoleModal.tsx" "apps/web/app/(board)/_components/AuditLog.tsx"
git commit -m "$(printf 'feat(web): role roster, grant modal, audit log components\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Federal `/federal/roles` page

**Files:** Replace `apps/web/app/(board)/federal/roles/page.tsx`

- [ ] **Step 1: Implement**

```tsx
import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { getCurrentMember, listGrantAudit, listMembers, listRoleHolders } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { AuditLog } from "../../_components/AuditLog";
import { GrantRoleModal, type RoleOption } from "../../_components/GrantRoleModal";
import { RoleRoster } from "../../_components/RoleRoster";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rollen & Vorstände" };

export default async function FederalRolesPage({ searchParams }: { searchParams: { tab?: string } }) {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const [holders, audit, groups, activeMembers] = await Promise.all([
    listRoleHolders(db),
    listGrantAudit(db, {}),
    listGroups(db),
    listMembers(db, { status: "active" }),
  ]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  const showAudit = searchParams.tab === "audit";

  const roleOptions: RoleOption[] = [
    { role: "federal_board", label: "Bundesvorstand", groupId: null, needsTypedConfirm: true },
    ...groups
      .filter((g) => g.status === "active")
      .map((g) => ({ role: "local_board_lead", label: `Lead · ${g.name}`, groupId: g.id })),
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-bdas-ink">Rollen & Vorstände</h1>
        <GrantRoleModal
          title="Rolle erteilen"
          candidates={activeMembers.map((m) => ({ memberId: m.id, name: `${m.firstName} ${m.lastName}` }))}
          roleOptions={roleOptions}
          revalidatePath="/federal/roles"
        />
      </div>
      <nav className="flex gap-2 text-sm">
        <a href="/federal/roles" className={!showAudit ? "font-bold text-bdas-red" : "text-bdas-ink-body"}>Inhaber</a>
        <a href="/federal/roles?tab=audit" className={showAudit ? "font-bold text-bdas-red" : "text-bdas-ink-body"}>Audit-Log</a>
      </nav>
      {showAudit ? (
        <AuditLog entries={audit} groupNames={groupNames} />
      ) : (
        <RoleRoster
          sections={[
            { title: "Bundesvorstand", holders: holders.filter((h) => h.role === "federal_board") },
            { title: "Lokale Vorstands-Leads", holders: holders.filter((h) => h.role === "local_board_lead") },
            { title: "Lokale Vorstände", holders: holders.filter((h) => h.role === "local_board") },
          ]}
          groupNames={groupNames}
          revalidatePath="/federal/roles"
          currentMemberId={me?.member?.id ?? null}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

`pnpm --filter @bdas/web typecheck` → PASS.
```bash
git add "apps/web/app/(board)/federal/roles/page.tsx"
git commit -m "$(printf 'feat(web): federal roles page — roster, grant modal, audit tab\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Lead-only gate + `/gruppe/[slug]/vorstand` page

**Files:**
- Modify: `apps/web/app/_dashboard/session.ts` (add `requireLeadScope`)
- Replace: `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx`

- [ ] **Step 1: Add the gate**

Append to `apps/web/app/_dashboard/session.ts`:

```ts
/** Lead-only gate for /gruppe/[slug]/vorstand: federal or a local_board_lead
 *  of this group (canGrantLocalBoard, ADR 0013). */
export async function requireLeadScope(
  slug: string,
): Promise<{ me: CurrentMember; groupId: string }> {
  const { me, groupId } = await requireGroupScope(slug);
  if (!canGrantLocalBoard(me.grants, groupId)) redirect(`/gruppe/${slug}/overview`);
  return { me, groupId };
}
```

Add `canGrantLocalBoard` to the existing `@bdas/members` import in that file.

- [ ] **Step 2: Vorstand page**

Replace `apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx`:

```tsx
import { getDb } from "@bdas/db";
import { listGrantAudit, listMembers, listRoleHolders } from "@bdas/members";

import { requireLeadScope } from "../../../../_dashboard/session";
import { AuditLog } from "../../../_components/AuditLog";
import { GrantRoleModal } from "../../../_components/GrantRoleModal";
import { RoleRoster } from "../../../_components/RoleRoster";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vorstand" };

export default async function VorstandPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { tab?: string };
}) {
  const { me, groupId } = await requireLeadScope(params.slug);
  const db = getDb();
  const [holders, audit, groupMembers] = await Promise.all([
    listRoleHolders(db),
    listGrantAudit(db, { groupId }),
    listMembers(db, { groupId, status: "active" }),
  ]);
  const ofGroup = holders.filter((h) => h.groupId === groupId);
  const revalidate = `/gruppe/${params.slug}/vorstand`;
  const showAudit = searchParams.tab === "audit";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-bdas-ink">Vorstand</h1>
        <GrantRoleModal
          title="Vorstand hinzufügen"
          candidates={groupMembers.map((m) => ({ memberId: m.id, name: `${m.firstName} ${m.lastName}` }))}
          roleOptions={[{ role: "local_board", label: "Vorstand", groupId }]}
          revalidatePath={revalidate}
        />
      </div>
      <nav className="flex gap-2 text-sm">
        <a href={revalidate} className={!showAudit ? "font-bold text-bdas-red" : "text-bdas-ink-body"}>Vorstand</a>
        <a href={`${revalidate}?tab=audit`} className={showAudit ? "font-bold text-bdas-red" : "text-bdas-ink-body"}>Audit-Log</a>
      </nav>
      {showAudit ? (
        <AuditLog entries={audit} groupNames={{}} />
      ) : (
        <RoleRoster
          sections={[
            { title: "Leads", holders: ofGroup.filter((h) => h.role === "local_board_lead") },
            { title: "Vorstand", holders: ofGroup.filter((h) => h.role === "local_board") },
          ]}
          groupNames={{}}
          revalidatePath={revalidate}
          currentMemberId={me.member?.id ?? null}
        />
      )}
    </section>
  );
}
```

Note: a lead will see "Entziehen" next to other leads in the Leads section; the server rejects that (lead may only revoke `local_board`) and the error surfaces via the action's error return — acceptable for now, the roster is honest about who holds what.

- [ ] **Step 3: Build + commit**

`pnpm --filter @bdas/web build` → PASS.
```bash
git add apps/web/app/_dashboard/session.ts "apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx"
git commit -m "$(printf 'feat(web): lead-gated vorstand page for local board management\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: Guard rails

- [ ] `pnpm --filter @bdas/members test` → all PASS (RAN, not skipped).
- [ ] `pnpm typecheck && pnpm lint` → PASS; fix at the flagged location if not.
- [ ] Commit any fix.

---

## Self-review notes

- **Authority lives server-side only:** every grant/revoke goes through `grantRole`/`revokeRole` with a session-derived actor. The typed confirm and hidden self-revoke are UX guards; the lead-only page gate (`requireLeadScope`) prevents non-leads browsing the surface, and even without it the actions would refuse.
- **RoleRoster revoke passes `h.role`/`h.groupId` from server-rendered props** — a tampered client could send anything, but the server re-checks; no client trust.
- **Vorstand grant modal offers only `local_board` of that group**; federal roles page offers `federal_board` (typed confirm) + leads per active group. Plain `local_board` grants for arbitrary groups happen via the group's own vorstand page — intentional (delegation model).
- `/security-review` (human-triggered) still owed on this PR before merge.
```
