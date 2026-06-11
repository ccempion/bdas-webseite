# Phase 3 PR 2 — Dashboard Shell (route group, scope-switcher, gates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the board cockpit chrome inside `apps/web`: a `(board)` route group with a sidebar + scope-switcher, a scope-landing page, and per-scope access gates — no data pages yet (those are PRs 3–6).

**Architecture:** A new framework-agnostic module `modules/dashboard-shell` owns the *pure* shell logic — the `Scope` model, deriving a user's scopes from their grants, and the access predicates — with its own vitest tests. The Next.js glue (route-group layouts that call those predicates then `redirect`, plus the React sidebar/switcher components) lives in `apps/web/app/(board)/`. The module owns no tables (spec §13) and depends only on the `members` and `groups` type interfaces.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Components, `force-dynamic`), Tailwind via `core/design-system` tokens, Vitest, Playwright (e2e smoke).

---

## Background the executor needs

- **Design tokens — use these exact Tailwind classes, never inline hex/radius/shadow** (CLAUDE.md §7):
  - Colors: `text-bdas-ink` (#333), `text-bdas-ink-body` (#555), `text-bdas-ink-muted` (#888), `text-bdas-red` / `bg-bdas-red` (#d12020 — active/open only), `bg-bdas-surface`, `bg-bdas-surface-hover`.
  - Borders: `border-bdas-soft`, `border-bdas-strong`.
  - Radii: `rounded-bdas` (12px, cards/dropdowns), `rounded-bdas-sm` (6px, inner items), `rounded-bdas-pill` (20px, desktop nav pills).
  - Shadows: `shadow-bdas-card`, `shadow-bdas-card-low`, `shadow-bdas-dropdown`.
- **Session read pattern (Server Component):** `getCurrentMember(getDb(), readSessionCookie())` → `CurrentMember | null`, where `CurrentMember = { user: CurrentUser; member: Member | null; grants: ReadonlyArray<Grant> }`. Imports: `getDb` from `@bdas/db`, `readSessionCookie` from `apps/web/lib/auth-cookie`, `getCurrentMember` from `@bdas/members`.
- **Every board page reads the session + DB at request time** → its segment must export `export const dynamic = "force-dynamic";` (mirror `apps/web/app/admin/layout.tsx`). Putting it on the `(board)/layout.tsx` covers the whole group.
- **`Grant = { role: Role; groupId: string | null }`** (exported from `@bdas/members`). `Role` includes `"federal_board" | "local_board" | "local_board_lead" | "member" | "alumnus"`.
- **`GroupSummary = { id; slug; name; city; status }`**, from `listGroups(getDb())` in `@bdas/groups`.
- **Existing predicates in `@bdas/members`:** `isFederalBoard(grants)`, `canManageGroup(grants, groupId)`, `canGrantLocalBoard(grants, groupId)`. Reuse — do NOT reimplement.
- **Feature flags:** `FLAGS` array in `core/feature-flags/src/index.ts`; `isFlagOn(name)`. apps/web wraps these in tiny helpers under `app/_<module>/flag.ts` that call `notFound()` when off.
- **Workspace package naming:** modules are `@bdas/<name>` (see any `modules/*/package.json`). New module mirrors `modules/groups` structure.
- **Module README + flag are mandatory** (CLAUDE.md §3, §5).

Run module tests: `pnpm --filter @bdas/dashboard-shell test`. Run web build: `pnpm --filter @bdas/web build`. Typecheck all: `pnpm typecheck`.

---

## File structure created/modified

```
core/feature-flags/src/index.ts                      MOD  add "dashboard" to FLAGS
modules/dashboard-shell/                              NEW  module
  package.json, tsconfig.json, README.md, vitest.config.ts
  src/index.ts                                        public surface
  src/scope.ts                                        Scope type + boardScopes()
  src/access.ts                                       canSeeGroupScope / canSeeFederalScope / canAdministerBoard
  src/scope.test.ts, src/access.test.ts               vitest
apps/web/app/_dashboard/flag.ts                       NEW  requireDashboardFlag()
apps/web/app/_dashboard/session.ts                    NEW  requireBoardAccess / requireFederalScope / requireGroupScope (Next glue: gate + redirect)
apps/web/app/(board)/layout.tsx                        NEW  group gate + shell frame
apps/web/app/(board)/page.tsx                          NEW  scope landing
apps/web/app/(board)/Sidebar.tsx                       NEW  server component: nav for active scope
apps/web/app/(board)/ScopeSwitcher.tsx                 NEW  client component: scope dropdown
apps/web/app/(board)/nav.ts                            NEW  nav item definitions per scope kind
apps/web/app/(board)/federal/layout.tsx                NEW  requireFederalScope
apps/web/app/(board)/federal/overview/page.tsx         NEW  placeholder
apps/web/app/(board)/federal/{members,events,groups,roles,files}/page.tsx   NEW placeholders
apps/web/app/(board)/gruppe/[slug]/layout.tsx          NEW  requireGroupScope(slug)
apps/web/app/(board)/gruppe/[slug]/overview/page.tsx   NEW placeholder
apps/web/app/(board)/gruppe/[slug]/{members,events,profile,files}/page.tsx  NEW placeholders
apps/web/app/(board)/gruppe/[slug]/vorstand/page.tsx   NEW placeholder (lead-gated later)
e2e/board-shell.spec.ts                                NEW  Playwright smoke
```

---

## Task 1: Add the `dashboard` feature flag + web helper

**Files:**
- Modify: `core/feature-flags/src/index.ts` (the `FLAGS` array)
- Test: `core/feature-flags/src/index.test.ts` (if it exists; else skip the test step)
- Create: `apps/web/app/_dashboard/flag.ts`

- [ ] **Step 1: Add the flag to the runtime list**

In `core/feature-flags/src/index.ts`, add `"dashboard"` to the `FLAGS` array (append before the closing bracket):

```ts
export const FLAGS = [
  "auth",
  "members",
  "groups",
  "events",
  "files",
  "notifications",
  "projects",
  "handover",
  "payments",
  "dashboard",
] as const;
```

- [ ] **Step 2: Verify feature-flags still type-checks**

Run: `pnpm --filter @bdas/feature-flags typecheck`
Expected: PASS (`FlagName` now includes `"dashboard"`).

- [ ] **Step 3: Create the web flag helper**

Create `apps/web/app/_dashboard/flag.ts`:

```ts
import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * The board cockpit (the `(board)` route group) is gated behind BDAS_FLAG_DASHBOARD
 * until Phase 3 is acceptance-complete (CLAUDE.md §3). Off in production today.
 */
export function requireDashboardFlag(): void {
  if (!isFlagOn("dashboard")) notFound();
}
```

- [ ] **Step 4: Commit**

```bash
git add core/feature-flags/src/index.ts apps/web/app/_dashboard/flag.ts
git commit -m "$(printf 'feat(feature-flags): add dashboard flag + web guard\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Scaffold `modules/dashboard-shell` + the Scope model

**Files:**
- Create: `modules/dashboard-shell/package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`
- Create: `modules/dashboard-shell/src/index.ts`, `src/scope.ts`
- Test: `modules/dashboard-shell/src/scope.test.ts`

Copy the exact shape of `modules/groups/package.json`, `modules/groups/tsconfig.json`, and `modules/groups/vitest.config.ts` for the three config files. Change the package name to `@bdas/dashboard-shell` AND set its `dependencies` to exactly the two it consumes (type-only, but they must resolve):

```json
  "dependencies": {
    "@bdas/members": "workspace:*",
    "@bdas/groups": "workspace:*"
  }
```

Keep whatever `devDependencies`/`scripts` (`test`, `typecheck`) the groups package uses. Do not invent other fields. The module has **no** `migrations/` folder and is **not** added to `infra/migrations/src/manifest.ts` (it owns no tables).

If `eslint.config.mjs` uses `eslint-plugin-boundaries` with an explicit element/dependency allowlist, register `dashboard-shell` there as a module permitted to depend on `members` and `groups` (mirror how an existing consumer module is declared). The full lint run in Task 7 will surface this if needed.

- [ ] **Step 1: Write the failing test**

Create `modules/dashboard-shell/src/scope.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { boardScopes, type Scope } from "./scope";
import type { Grant } from "@bdas/members";
import type { GroupSummary } from "@bdas/groups";

const groups: GroupSummary[] = [
  { id: "grp_mg", slug: "moenchengladbach", name: "HG Mönchengladbach", city: "MG", status: "active" },
  { id: "grp_ac", slug: "aachen", name: "HG Aachen", city: "Aachen", status: "active" },
];

describe("boardScopes", () => {
  it("federal_board yields the federal scope plus every active group scope", () => {
    const grants: Grant[] = [{ role: "federal_board", groupId: null }];
    const scopes = boardScopes(grants, groups);
    expect(scopes).toEqual<Scope[]>([
      { kind: "federal" },
      { kind: "group", groupId: "grp_mg", slug: "moenchengladbach", name: "HG Mönchengladbach" },
      { kind: "group", groupId: "grp_ac", slug: "aachen", name: "HG Aachen" },
    ]);
  });

  it("a local_board grant yields only that group scope", () => {
    const grants: Grant[] = [{ role: "local_board", groupId: "grp_ac" }];
    expect(boardScopes(grants, groups)).toEqual<Scope[]>([
      { kind: "group", groupId: "grp_ac", slug: "aachen", name: "HG Aachen" },
    ]);
  });

  it("a local_board_lead grant also yields that group scope (a lead boards its group)", () => {
    const grants: Grant[] = [{ role: "local_board_lead", groupId: "grp_mg" }];
    expect(boardScopes(grants, groups)).toEqual<Scope[]>([
      { kind: "group", groupId: "grp_mg", slug: "moenchengladbach", name: "HG Mönchengladbach" },
    ]);
  });

  it("a plain member has no board scopes", () => {
    expect(boardScopes([{ role: "member", groupId: null }], groups)).toEqual([]);
  });

  it("de-duplicates when a user holds both local_board and local_board_lead of one group", () => {
    const grants: Grant[] = [
      { role: "local_board", groupId: "grp_mg" },
      { role: "local_board_lead", groupId: "grp_mg" },
    ];
    expect(boardScopes(grants, groups)).toEqual<Scope[]>([
      { kind: "group", groupId: "grp_mg", slug: "moenchengladbach", name: "HG Mönchengladbach" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/dashboard-shell test`
Expected: FAIL — `./scope` has no `boardScopes`.

- [ ] **Step 3: Implement the Scope model**

Create `modules/dashboard-shell/src/scope.ts`:

```ts
import type { Grant } from "@bdas/members";
import type { GroupSummary } from "@bdas/groups";

/** A view the sidebar can switch into. Federal is the federation-wide cockpit;
 *  a group scope is one Hochschulgruppe. */
export type Scope =
  | { readonly kind: "federal" }
  | { readonly kind: "group"; readonly groupId: string; readonly slug: string; readonly name: string };

/**
 * The scopes a user may switch between, derived from their grants (ADR 0007 /
 * 0013). Federal board is a superset: it yields the federal scope AND every
 * active group. `local_board` and `local_board_lead` each yield their own
 * group. Order: federal first, then groups in the order `groups` is given
 * (callers pass them city-then-name sorted). De-duplicated by group id.
 */
export function boardScopes(
  grants: ReadonlyArray<Grant>,
  groups: ReadonlyArray<GroupSummary>,
): Scope[] {
  const isFederal = grants.some((g) => g.role === "federal_board");
  const out: Scope[] = [];
  if (isFederal) out.push({ kind: "federal" });

  const wanted = new Set<string>();
  if (isFederal) {
    for (const g of groups) if (g.status === "active") wanted.add(g.id);
  } else {
    for (const grant of grants) {
      if ((grant.role === "local_board" || grant.role === "local_board_lead") && grant.groupId) {
        wanted.add(grant.groupId);
      }
    }
  }

  for (const g of groups) {
    if (wanted.has(g.id)) {
      out.push({ kind: "group", groupId: g.id, slug: g.slug, name: g.name });
    }
  }
  return out;
}
```

- [ ] **Step 4: Create the public surface**

Create `modules/dashboard-shell/src/index.ts`:

```ts
/**
 * @bdas/dashboard-shell — pure board-cockpit logic (scope model + access
 * predicates). Owns no tables (spec §13). The React shell and route-group
 * layouts live in apps/web and consume this surface.
 */
export { boardScopes, type Scope } from "./scope";
export {
  canAdministerBoard,
  canSeeFederalScope,
  canSeeGroupScope,
} from "./access";
```

(`./access` is created in Task 3. If the test run in Step 5 errors on the missing `./access` import, comment those two lines out, run Step 5, then restore them in Task 3 — but prefer doing Task 3 immediately after so the surface stays whole. For now, to keep Step 5 green, create a temporary `src/access.ts` containing only `export {};` and replace it in Task 3.)

Create the temporary `modules/dashboard-shell/src/access.ts`:

```ts
export {};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bdas/dashboard-shell test`
Expected: PASS — all `boardScopes` cases green.

- [ ] **Step 6: Write the module README**

Create `modules/dashboard-shell/README.md`:

```markdown
# dashboard-shell

Pure logic for the board cockpit (Phase 3). Owns **no tables** (spec §13). Provides:

- `Scope` + `boardScopes(grants, groups)` — the scopes a user can switch between.
- `canAdministerBoard` / `canSeeFederalScope` / `canSeeGroupScope` — access predicates the `(board)` route-group layouts in `apps/web` call before rendering.

The React shell (sidebar, scope-switcher) and the `(board)` route group live in `apps/web/app/(board)/` and consume this module. Gated by the `dashboard` feature flag.
```

- [ ] **Step 7: Commit**

```bash
git add modules/dashboard-shell core/feature-flags
git commit -m "$(printf 'feat(dashboard-shell): scaffold module + scope model\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Access predicates

**Files:**
- Replace: `modules/dashboard-shell/src/access.ts` (was the temporary stub)
- Test: `modules/dashboard-shell/src/access.test.ts`

- [ ] **Step 1: Write the failing test**

Create `modules/dashboard-shell/src/access.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { canAdministerBoard, canSeeFederalScope, canSeeGroupScope } from "./access";
import type { Grant } from "@bdas/members";

const federal: Grant[] = [{ role: "federal_board", groupId: null }];
const localAc: Grant[] = [{ role: "local_board", groupId: "grp_ac" }];
const member: Grant[] = [{ role: "member", groupId: null }];

describe("board access predicates", () => {
  it("canAdministerBoard: any board grant qualifies; a plain member does not", () => {
    expect(canAdministerBoard(federal)).toBe(true);
    expect(canAdministerBoard(localAc)).toBe(true);
    expect(canAdministerBoard(member)).toBe(false);
    expect(canAdministerBoard([])).toBe(false);
  });

  it("canSeeFederalScope: only federal_board", () => {
    expect(canSeeFederalScope(federal)).toBe(true);
    expect(canSeeFederalScope(localAc)).toBe(false);
  });

  it("canSeeGroupScope: federal sees any group; local only its own", () => {
    expect(canSeeGroupScope(federal, "grp_ac")).toBe(true);
    expect(canSeeGroupScope(federal, "grp_other")).toBe(true);
    expect(canSeeGroupScope(localAc, "grp_ac")).toBe(true);
    expect(canSeeGroupScope(localAc, "grp_other")).toBe(false);
    expect(canSeeGroupScope(member, "grp_ac")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/dashboard-shell test -- access`
Expected: FAIL — `./access` exports nothing.

- [ ] **Step 3: Implement the predicates (reusing members' predicates)**

Replace `modules/dashboard-shell/src/access.ts` with:

```ts
import { canManageGroup, isFederalBoard } from "@bdas/members";
import type { Grant } from "@bdas/members";

/** May this user enter the cockpit at all? Any board grant (federal, local
 *  board, or lead) qualifies; a plain member does not. */
export function canAdministerBoard(grants: ReadonlyArray<Grant>): boolean {
  return grants.some(
    (g) =>
      g.role === "federal_board" || g.role === "local_board" || g.role === "local_board_lead",
  );
}

/** The `/federal/*` scope is federal-board only. */
export function canSeeFederalScope(grants: ReadonlyArray<Grant>): boolean {
  return isFederalBoard(grants);
}

/** A `/gruppe/[slug]` scope: federal (superset) or a board of that group.
 *  `canManageGroup` already encodes "federal OR local_board of this group";
 *  a lead also manages its group, so include it explicitly. */
export function canSeeGroupScope(grants: ReadonlyArray<Grant>, groupId: string): boolean {
  if (canManageGroup(grants, groupId)) return true;
  return grants.some((g) => g.role === "local_board_lead" && g.groupId === groupId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/dashboard-shell test`
Expected: PASS — both `scope` and `access` suites green.

- [ ] **Step 5: Commit**

```bash
git add modules/dashboard-shell/src/access.ts modules/dashboard-shell/src/access.test.ts
git commit -m "$(printf 'feat(dashboard-shell): board access predicates\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: `(board)` group gate (Next glue) + nav definitions

**Files:**
- Create: `apps/web/app/_dashboard/session.ts`
- Create: `apps/web/app/(board)/nav.ts`

These have no unit tests (Next-runtime glue / static data); they are exercised by the e2e smoke in Task 8 and by `pnpm build`.

- [ ] **Step 1: Create the gate helpers**

Create `apps/web/app/_dashboard/session.ts`:

```ts
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import {
  canAdministerBoard,
  canSeeFederalScope,
  canSeeGroupScope,
} from "@bdas/dashboard-shell";
import { getCurrentMember, type CurrentMember } from "@bdas/members";
import { getGroupBySlug } from "@bdas/groups";

import { readSessionCookie } from "../../lib/auth-cookie";

/** Resolve the signed-in board user, or redirect. Used by the (board) layout. */
export async function requireBoardAccess(): Promise<CurrentMember> {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) redirect("/anmelden");
  if (!canAdministerBoard(me.grants)) redirect("/account");
  return me;
}

/** Federal scope gate. Assumes requireBoardAccess already ran in a parent layout. */
export async function requireFederalScope(): Promise<CurrentMember> {
  const me = await requireBoardAccess();
  if (!canSeeFederalScope(me.grants)) redirect("/account");
  return me;
}

/** Group scope gate. Resolves the slug → group; 404 on unknown slug; redirect
 *  to /account when the user may not see that group. Returns the member + group id. */
export async function requireGroupScope(
  slug: string,
): Promise<{ me: CurrentMember; groupId: string }> {
  const me = await requireBoardAccess();
  const group = await getGroupBySlug(getDb(), slug);
  if (!group) redirect("/account");
  if (!canSeeGroupScope(me.grants, group.id)) redirect("/account");
  return { me, groupId: group.id };
}
```

(Confirm `getGroupBySlug` is exported from `@bdas/groups` — it is, per `modules/groups/src/index.ts`. It returns `Group | null`.)

- [ ] **Step 2: Create the nav definitions**

Create `apps/web/app/(board)/nav.ts`:

```ts
/** Sidebar nav items per scope kind. Hrefs are relative to the scope root.
 *  Pages that depend on unbuilt modules (payments, broadcasts, handover,
 *  projects, join-policy, group-change) are intentionally absent — PR 3+. */
export type NavItem = { readonly href: string; readonly label: string };

export const FEDERAL_NAV: ReadonlyArray<NavItem> = [
  { href: "/federal/overview", label: "Übersicht" },
  { href: "/federal/members", label: "Mitglieder" },
  { href: "/federal/events", label: "Events" },
  { href: "/federal/groups", label: "Gruppen" },
  { href: "/federal/roles", label: "Rollen" },
  { href: "/federal/files", label: "Dateien" },
];

export function groupNav(slug: string): ReadonlyArray<NavItem> {
  const base = `/gruppe/${slug}`;
  return [
    { href: `${base}/overview`, label: "Übersicht" },
    { href: `${base}/members`, label: "Mitglieder" },
    { href: `${base}/events`, label: "Events" },
    { href: `${base}/vorstand`, label: "Vorstand" },
    { href: `${base}/profile`, label: "Profil" },
    { href: `${base}/files`, label: "Dateien" },
  ];
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bdas/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_dashboard/session.ts "apps/web/app/(board)/nav.ts"
git commit -m "$(printf 'feat(web): board scope gates + nav definitions\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Shell frame — `(board)` layout, ScopeSwitcher, Sidebar, scope landing

**Files:**
- Create: `apps/web/app/(board)/layout.tsx`, `ScopeSwitcher.tsx`, `Sidebar.tsx`, `page.tsx`

- [ ] **Step 1: ScopeSwitcher (client component)**

Create `apps/web/app/(board)/ScopeSwitcher.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { Scope } from "@bdas/dashboard-shell";

function scopeHref(s: Scope): string {
  return s.kind === "federal" ? "/federal/overview" : `/gruppe/${s.slug}/overview`;
}
function scopeLabel(s: Scope): string {
  return s.kind === "federal" ? "Bundesverband" : s.name;
}

/** Top-of-sidebar dropdown. Selecting a scope navigates to that scope's
 *  overview; the sidebar re-renders server-side with the new nav. */
export function ScopeSwitcher({ scopes, activeLabel }: { scopes: Scope[]; activeLabel: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  if (scopes.length <= 1) {
    return (
      <div className="rounded-bdas-pill border border-bdas-soft bg-bdas-surface px-4 py-2 text-bdas-pill font-semibold text-bdas-ink">
        {activeLabel}
      </div>
    );
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-bdas-pill border border-bdas-soft bg-bdas-surface px-4 py-2 text-bdas-pill font-semibold text-bdas-ink transition-colors hover:bg-bdas-surface-hover"
      >
        <span>{activeLabel}</span>
        <span className="text-bdas-ink-muted">▾</span>
      </button>
      {open && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-dropdown">
          {scopes.map((s) => (
            <li key={s.kind === "federal" ? "federal" : s.slug}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(scopeHref(s));
                }}
                className="block w-full px-4 py-2 text-left text-bdas-dropdown-link text-bdas-ink-body transition-colors hover:bg-bdas-surface-hover"
              >
                {scopeLabel(s)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Sidebar (server component)**

Create `apps/web/app/(board)/Sidebar.tsx`:

```tsx
import Link from "next/link";

import type { Scope } from "@bdas/dashboard-shell";

import { ScopeSwitcher } from "./ScopeSwitcher";
import { FEDERAL_NAV, groupNav, type NavItem } from "./nav";

function navFor(active: Scope): ReadonlyArray<NavItem> {
  return active.kind === "federal" ? FEDERAL_NAV : groupNav(active.slug);
}
function labelFor(active: Scope): string {
  return active.kind === "federal" ? "Bundesverband" : active.name;
}

/** Sidebar: scope switcher on top, then the active scope's nav. `activePath`
 *  is the current pathname so the active item gets the brand-red treatment. */
export function Sidebar({
  scopes,
  active,
  activePath,
}: {
  scopes: Scope[];
  active: Scope;
  activePath: string;
}) {
  const items = navFor(active);
  return (
    <nav className="flex w-60 shrink-0 flex-col gap-1 border-r border-bdas-soft bg-bdas-surface p-3">
      <div className="mb-2">
        <ScopeSwitcher scopes={scopes} activeLabel={labelFor(active)} />
      </div>
      {items.map((item) => {
        const isActive = activePath === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive
                ? "rounded-bdas-sm bg-bdas-surface-hover px-3 py-2 font-semibold text-bdas-red shadow-[inset_2px_0_0_var(--bdas-accent,#d12020)]"
                : "rounded-bdas-sm px-3 py-2 text-bdas-ink-body transition-colors hover:bg-bdas-surface-hover"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

NOTE on the active-item inset shadow: the design forbids inline hex, but Tailwind has no token utility for an inset accent bar. Use the CSS variable form shown (`var(--bdas-accent,#d12020)`); if `--bdas-accent` is not defined globally, add it to `apps/web/app/globals.css` `:root` as `--bdas-accent: #d12020;` in this step so the literal hex lives in one tokens-adjacent place, not in the component. Verify `globals.css` exists and append the variable.

- [ ] **Step 3: The (board) layout — gate + frame**

Create `apps/web/app/(board)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { headers } from "next/headers";

import { getDb } from "@bdas/db";
import { boardScopes, type Scope } from "@bdas/dashboard-shell";
import { listGroups } from "@bdas/groups";

import { requireDashboardFlag } from "../_dashboard/flag";
import { requireBoardAccess } from "../_dashboard/session";
import { Sidebar } from "./Sidebar";

// Board pages read the per-request session + DB; never statically prerender.
export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

function activeScope(scopes: Scope[], pathname: string): Scope {
  if (pathname.startsWith("/gruppe/")) {
    const slug = pathname.split("/")[2];
    const g = scopes.find((s) => s.kind === "group" && s.slug === slug);
    if (g) return g;
  }
  return scopes.find((s) => s.kind === "federal") ?? scopes[0];
}

export default async function BoardLayout({ children }: { children: ReactNode }) {
  requireDashboardFlag();
  const me = await requireBoardAccess();
  const groups = await listGroups(getDb());
  const scopes = boardScopes(me.grants, groups);

  // next/headers exposes the matched pathname via the x-… header Next sets on
  // RSC requests; fall back to the federal/first scope when unavailable.
  const pathname = headers().get("x-pathname") ?? headers().get("x-invoke-path") ?? "";
  const active = activeScope(scopes, pathname);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-var(--header-h,0px))] w-full max-w-7xl">
      <Sidebar scopes={scopes} active={active} activePath={pathname} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

NOTE: Next.js does not set `x-pathname` by default. To make `activePath`/`activeScope` reliable, add a tiny `apps/web/middleware.ts` that copies the pathname into a request header (this is pathname plumbing only — NOT auth; auth stays in the layout gates per the design spec). Create `apps/web/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

/** Plumbing only: expose the pathname to Server Components so the board sidebar
 *  can mark the active scope/item. Authorization lives in the (board) layouts,
 *  not here (Phase 3 design: local grants are in the DB, not the JWT).
 *
 *  IMPORTANT: the value must be set on the *request* headers (via
 *  NextResponse.next({ request: { headers } })) — `headers()` in a Server
 *  Component reads request headers, NOT the response headers. Setting
 *  res.headers would be invisible to the layout. */
export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

If `apps/web/middleware.ts` already exists, merge the header-set line into it instead of overwriting.

- [ ] **Step 4: Scope landing page**

Create `apps/web/app/(board)/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { boardScopes } from "@bdas/dashboard-shell";
import { listGroups } from "@bdas/groups";

import { requireBoardAccess } from "../_dashboard/session";

export const dynamic = "force-dynamic";

/** Landing: send the user straight to their only scope, or to the federal
 *  overview when they have several (the switcher handles the rest). */
export default async function BoardLanding() {
  const me = await requireBoardAccess();
  const scopes = boardScopes(me.grants, await listGroups(getDb()));
  const first = scopes[0];
  if (!first) redirect("/account");
  redirect(first.kind === "federal" ? "/federal/overview" : `/gruppe/${first.slug}/overview`);
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @bdas/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(board)/layout.tsx" "apps/web/app/(board)/page.tsx" "apps/web/app/(board)/Sidebar.tsx" "apps/web/app/(board)/ScopeSwitcher.tsx" apps/web/middleware.ts apps/web/app/globals.css
git commit -m "$(printf 'feat(web): board shell — layout, sidebar, scope-switcher, landing\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: Scope layouts + placeholder pages

Every placeholder page is the same shape. Here is the **canonical template** — create one file per route in the table using it, swapping only the `<h1>` title and the import’d gate.

**Federal pages** import `requireFederalScope`; **group pages** import `requireGroupScope` and `await` it with `params.slug`.

- [ ] **Step 1: Federal scope layout**

Create `apps/web/app/(board)/federal/layout.tsx`:

```tsx
import type { ReactNode } from "react";

import { requireFederalScope } from "../../_dashboard/session";

export const dynamic = "force-dynamic";

export default async function FederalLayout({ children }: { children: ReactNode }) {
  await requireFederalScope();
  return children;
}
```

- [ ] **Step 2: Federal placeholder pages**

For each of `overview, members, events, groups, roles, files`, create `apps/web/app/(board)/federal/<name>/page.tsx` using this template (title from the second column):

```tsx
import { Card } from "@bdas/design-system";

export const metadata = { title: "Übersicht" }; // ← change per page

export default function Page() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Übersicht</h1>
      <Card>
        <p className="text-bdas-ink-body">Dieser Bereich wird in einem späteren Schritt gebaut.</p>
      </Card>
    </section>
  );
}
```

| Folder | Title |
|---|---|
| `overview` | Übersicht |
| `members` | Mitglieder |
| `events` | Events |
| `groups` | Gruppen |
| `roles` | Rollen & Vorstände |
| `files` | Dateien |

- [ ] **Step 3: Group scope layout**

Create `apps/web/app/(board)/gruppe/[slug]/layout.tsx`:

```tsx
import type { ReactNode } from "react";

import { requireGroupScope } from "../../../_dashboard/session";

export const dynamic = "force-dynamic";

export default async function GroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { slug: string };
}) {
  await requireGroupScope(params.slug);
  return children;
}
```

- [ ] **Step 4: Group placeholder pages**

For each of `overview, members, events, vorstand, profile, files`, create `apps/web/app/(board)/gruppe/[slug]/<name>/page.tsx` using the SAME template as Step 2 (title from the table). For `vorstand`, add a one-line note that lead-only gating arrives with the roles PR:

| Folder | Title |
|---|---|
| `overview` | Übersicht |
| `members` | Mitglieder |
| `events` | Events |
| `vorstand` | Vorstand |
| `profile` | Profil |
| `files` | Dateien |

- [ ] **Step 5: Build the web app**

Run: `pnpm --filter @bdas/web build`
Expected: PASS — all `(board)` routes compile; no static-prerender error (every segment is `force-dynamic` via the group layout).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(board)/federal" "apps/web/app/(board)/gruppe"
git commit -m "$(printf 'feat(web): board scope layouts + placeholder pages\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: Wire the new module into the workspace + manifest sanity

**Files:**
- Verify: root `pnpm-workspace.yaml` already globs `modules/*` (it does) — no edit needed; run `pnpm install` to link `@bdas/dashboard-shell`.
- Note: `dashboard-shell` owns **no migrations**, so it is NOT added to `infra/migrations/src/manifest.ts`. Confirm this is intentional (the module owns no tables).

- [ ] **Step 1: Link the new package**

Run: `pnpm install`
Expected: adds `@bdas/dashboard-shell` to the workspace; lockfile updates.

- [ ] **Step 2: Full typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS across all packages.

- [ ] **Step 3: Commit the lockfile if it changed**

```bash
git add pnpm-lock.yaml
git commit -m "$(printf 'chore: link @bdas/dashboard-shell workspace package\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')" || echo "nothing to commit"
```

---

## Task 8: e2e smoke — gates redirect, board user sees the shell

**Files:**
- Create: `e2e/board-shell.spec.ts`

Inspect an existing spec in `e2e/` first to copy the project's helpers (base URL, how they create a logged-in session / seed a board user). Match those patterns exactly; do NOT invent a new login mechanism.

- [ ] **Step 1: Write the smoke test**

Create `e2e/board-shell.spec.ts` following the existing `e2e/*` patterns. It must assert:

```ts
import { test, expect } from "@playwright/test";

// Requires BDAS_FLAG_DASHBOARD=true in the e2e env (set it alongside the other
// flags in the e2e setup, mirroring how auth/members flags are enabled).

test.describe("board shell", () => {
  test("anonymous visitor to /federal/overview is redirected to /anmelden", async ({ page }) => {
    await page.goto("/federal/overview");
    await expect(page).toHaveURL(/\/anmelden/);
  });

  test("a non-board member visiting the cockpit is redirected to /account", async ({ page }) => {
    // Use the existing helper that logs in a plain member (copy from another spec).
    // await loginAsMember(page);
    await page.goto("/");
    // ...navigate to a board URL and assert redirect to /account.
    await page.goto("/federal/overview");
    await expect(page).toHaveURL(/\/account/);
  });
});
```

Replace the commented helper calls with the project's real login helpers found in `e2e/`. If no member-login helper exists, implement the anonymous-redirect test only and leave a `test.fixme` with a clear note for the member case.

- [ ] **Step 2: Run the smoke test**

Run: `pnpm e2e -- board-shell` (ensure `BDAS_FLAG_DASHBOARD=true` and a DB are available, as the other e2e tests require).
Expected: the anonymous-redirect test passes. (If the full e2e harness isn’t wired locally, this may be CI-only — note it and proceed.)

- [ ] **Step 3: Commit**

```bash
git add e2e/board-shell.spec.ts
git commit -m "$(printf 'test(e2e): board shell access redirects\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-review notes (already reconciled)

- **Spec coverage:** implements design-spec §4.1 (shell scope-switcher), §6 (route-group layout gates, not edge middleware — the `middleware.ts` here is pathname plumbing only, explicitly NOT authorization), and the buildable surface map (placeholders only; data pages are PRs 3–6). Deferred surfaces (payments/broadcasts/handover/projects/join-policy/group-change) are absent from `nav.ts` by design.
- **Type consistency:** `boardScopes(grants, groups)`, `Scope`, `canAdministerBoard/canSeeFederalScope/canSeeGroupScope`, `requireBoardAccess/requireFederalScope/requireGroupScope` are used with identical signatures across tasks.
- **No new tables / no manifest entry** for `dashboard-shell` (spec §13: the dashboard owns no tables).
- **Tokens only:** components use `bdas-*` utility classes; the single accent hex lives in a `:root` CSS variable, not inline in a component.
- **Security:** authorization is enforced in the `(board)` layouts via the pure predicates; `middleware.ts` does not gate. The federal/group layouts re-gate independently so a deep link cannot bypass a parent.
```
