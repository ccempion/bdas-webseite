# Freigabe-Zähler, bedingter Pending-Hinweis, Bildzuschnitt, Spam-Hinweise — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vorstände sehen an ihrem Namen im Kopfmenü eine rote Zahl offener Freigaben, `/account` zeigt den Hinweis nur noch bei echter Arbeit, Profilbilder lassen sich vor dem Upload zuschneiden, und drei weitere Bestätigungsseiten nennen den Spam-Ordner.

**Architecture:** Zwei Module bekommen echte Zähl-Services (`countPendingApprovals` in `members`, `countOpenReports` in `blog`). Die App-Schicht komponiert sie in `apps/web/app/_dashboard/approvals.ts` hinter React `cache()` und bricht für Nicht-Vorstände vor der ersten Abfrage ab. Ein neues `Badge`-Primitive im Design-System rendert die Zahl. Der Bildzuschnitt ist rein client-seitig: eine pure Rechenschicht (`crop.ts`) plus ein `<dialog>`, dessen Ergebnis als 512×512-WebP in den bestehenden `uploadImage`-Pfad geht.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Components), Drizzle ORM, PostgreSQL, Tailwind + `core/design-system`, Vitest (`environment: "node"`), Playwright.

## Global Constraints

- CLAUDE.md §1 Rule 1: `members` besitzt `members`/`member_group_change_requests`, `blog` besitzt `post_reports`. Kein Modul liest die Tabellen eines anderen. Die App komponiert.
- CLAUDE.md §1 Rule 8: Neue Services sind nur nutzbar, wenn sie aus `modules/<name>/src/index.ts` re-exportiert werden.
- CLAUDE.md §7: Keine inline-Hexwerte, -Radien, -Schatten oder -Dauern. Nur Tailwind-Klassen aus `core/design-system/src/tailwind-preset.ts` (`bg-bdas-red`, `rounded-bdas-full`, `text-bdas-pill`, `duration-bdas-quick`, `ease-bdas`, …).
- CLAUDE.md §6: Keine Kommentare, die beschreiben *was* der Code tut. Kommentare erklären *warum*.
- Alle nutzersichtbaren Texte sind auf Deutsch.
- Vitest läuft in diesem Repo mit `environment: "node"`. Es gibt **kein** React-Component-Testing. Pure Logik wird per Vitest getestet, gerendertes Verhalten per Playwright.
- Integrationstests laufen gegen echtes Postgres (`postgres://bdas:bdas@localhost:5432/bdas`) und überspringen sich selbst, wenn die DB nicht erreichbar ist — siehe `dbReachable()` in `modules/members/src/index.test.ts`.
- Keine Migration, kein neues Feature-Flag, kein neues Modul.
- Spec: `docs/superpowers/specs/2026-07-27-freigaben-badge-bildzuschnitt-design.md`.

## File Structure

**Teil A — Freigabe-Zähler (Branch `feat/approval-badge`)**

- `modules/members/src/services/status.ts` — nimmt `scopedGroupIds` auf (heute dupliziert in `group-change.ts` und `list-pending.ts`).
- `modules/members/src/services/group-change.ts` — importiert `scopedGroupIds` statt es selbst zu definieren.
- `modules/members/src/services/list-pending.ts` — dito.
- `modules/members/src/services/approval-counts.ts` — **neu**, `countPendingApprovals`.
- `modules/members/src/index.ts` — Re-Export.
- `modules/members/src/approval-counts.test.ts` — **neu**, Integrationstest.
- `modules/blog/src/services/report.ts` — nimmt `countOpenReports` auf.
- `modules/blog/src/index.ts` — Re-Export.
- `modules/blog/src/index.test.ts` — ergänzt um zwei Fälle.
- `core/design-system/src/components/badge-count.ts` — **neu**, pure Formatierung.
- `core/design-system/src/components/badge-count.test.ts` — **neu**.
- `core/design-system/src/components/Badge.tsx` — **neu**.
- `core/design-system/src/index.ts` — Re-Export.
- `apps/web/app/_dashboard/approvals.ts` — **neu**, `loadApprovalCounts`.
- `apps/web/app/_dashboard/approvals.test.ts` — **neu**.
- `apps/web/app/_public/PublicHeader.tsx` — Badge an drei Stellen.
- `apps/web/app/account/page.tsx` — Alert ersetzt.
- `apps/web/app/account/ApprovalsAlert.tsx` — **neu**, Server Component.
- `e2e/approvals-badge.e2e.ts` — **neu**.

**Teil B — Bildzuschnitt (Branch `feat/profile-photo-crop`)**

- `apps/web/app/_profile/crop.ts` — **neu**, pure Rechenschicht.
- `apps/web/app/_profile/crop.test.ts` — **neu**.
- `apps/web/app/_profile/CropDialog.tsx` — **neu**, `"use client"`.
- `apps/web/app/account/AccountAvatar.tsx` — Zuschnitt zwischengeschaltet.
- `apps/web/app/profil/PhotoField.tsx` — dito.
- `e2e/profile-photo-crop.e2e.ts` — **neu**.

**Teil C — Spam-Hinweise (Branch `feat/spam-hinweise`)**

- `apps/web/app/passwort-zuruecksetzen/RequestForm.tsx`
- `apps/web/app/events/[id]/GuestRegisterForm.tsx`
- `apps/web/app/registrieren/erfolg/page.tsx`
- `e2e/auth.e2e.ts` — eine Assertion ergänzt.

---

# Teil A — Freigabe-Zähler

### Task A0: Branch

- [ ] **Step 1: Feature-Branch anlegen**

```bash
git checkout main && git pull && git checkout -b feat/approval-badge && git branch --show-current
```

Erwartet: `feat/approval-badge`.

---

### Task A1: `scopedGroupIds` entdoppeln

Die Regel „auf welche Gruppen ist dieser Actor als lokaler Vorstand gescoped" steht heute zweimal wörtlich im Modul: als private Funktion `scopedGroupIds` in `group-change.ts:343` und inline in `listPendingMembers` in `list-pending.ts`. Der neue Zähl-Service bräuchte sie ein drittes Mal. Sie zieht daher nach `status.ts`, wo `Actor`, `Db` und `groupHasActiveLocalBoard` bereits wohnen.

**Files:**

- Modify: `modules/members/src/services/status.ts`
- Modify: `modules/members/src/services/group-change.ts`
- Modify: `modules/members/src/services/list-pending.ts`

**Interfaces:**

- Produces: `scopedGroupIds(actor: Actor): string[]` aus `modules/members/src/services/status.ts`.

- [ ] **Step 1: `scopedGroupIds` in `status.ts` ergänzen**

Ans Ende von `modules/members/src/services/status.ts` anfügen:

```ts
/**
 * Groups this actor is scoped to as a local board. `local_board_lead` manages
 * its group too (ADR 0013), so both roles count. Federal grants carry no
 * groupId and are handled by `isFederalBoard` at each call site.
 */
export function scopedGroupIds(actor: Actor): string[] {
  return actor.grants
    .filter(
      (g): g is { role: "local_board" | "local_board_lead"; groupId: string } =>
        (g.role === "local_board" || g.role === "local_board_lead") && g.groupId !== null,
    )
    .map((g) => g.groupId);
}
```

- [ ] **Step 2: Die private Kopie in `group-change.ts` entfernen**

In `modules/members/src/services/group-change.ts` den Block ab `function scopedGroupIds(actor: Actor): string[] {` bis zur schließenden Klammer (heute Zeilen 343–350) **löschen** und die bestehende Import-Zeile

```ts
import { groupHasActiveLocalBoard, type Actor, type Db } from "./status";
```

ersetzen durch:

```ts
import { groupHasActiveLocalBoard, scopedGroupIds, type Actor, type Db } from "./status";
```

- [ ] **Step 3: Die inline-Kopie in `list-pending.ts` ersetzen**

In `modules/members/src/services/list-pending.ts` den Block

```ts
  const scopedGroupIds = actor.grants
    .filter(
      (g): g is { role: "local_board" | "local_board_lead"; groupId: string } =>
        (g.role === "local_board" || g.role === "local_board_lead") && g.groupId !== null,
    )
    .map((g) => g.groupId);
```

ersetzen durch:

```ts
  const scoped = scopedGroupIds(actor);
```

Danach im selben File die beiden Verwendungen `scopedGroupIds.length` → `scoped.length` und `scopedGroupIds.includes(r.primaryGroupId)` → `scoped.includes(r.primaryGroupId)` anpassen, und den Import ergänzen:

```ts
import { scopedGroupIds, type Actor } from "./status";
```

Die bestehende Zeile `import type { Actor } from "./status";` entfällt dabei.

- [ ] **Step 4: Bestehende Tests laufen lassen**

```bash
pnpm --filter @bdas/members exec vitest run
```

Erwartet: PASS (oder übersprungen, falls kein Postgres läuft — dann zusätzlich `pnpm exec tsc --noEmit -p modules/members/tsconfig.json` und PASS erwarten). Reines Refactoring, es darf sich kein Verhalten ändern.

- [ ] **Step 5: Commit**

```bash
git add modules/members/src/services/status.ts modules/members/src/services/group-change.ts modules/members/src/services/list-pending.ts
git commit -m "refactor(members): hoist scopedGroupIds into status.ts"
```

---

### Task A2: `countPendingApprovals` in `members`

**Files:**

- Create: `modules/members/src/services/approval-counts.ts`
- Modify: `modules/members/src/index.ts`
- Test: `modules/members/src/approval-counts.test.ts` (create)

**Interfaces:**

- Consumes: `scopedGroupIds(actor)`, `groupHasActiveLocalBoard(db, groupId)`, `type Actor`, `type Db` aus `./status` (Task A1); `isFederalBoard(grants)`, `canDecideJoinRequest(grants, groupId, hasLocalBoard)` aus `../roles`.
- Produces:
  ```ts
  export type ApprovalCounts = {
    readonly pendingMembers: number;
    readonly incomingGroupChanges: number;
  };
  export function countPendingApprovals(db: Db, actor: Actor): Promise<ApprovalCounts>;
  ```

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`modules/members/src/approval-counts.test.ts` anlegen. Es nutzt den vorhandenen Harness aus `./test-db` (`setupMembersDb`, `createUser`, `createGroup`, `dbReachable`) — dieselbe Schranke wie `index.test.ts`, aber ohne dessen inline dupliziertes Setup:

```ts
/**
 * Integration tests for the approval counter that feeds the header badge.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { countPendingApprovals } from "./services/approval-counts";
import { changePrimaryGroup } from "./services/group-change";
import { createProfile } from "./services/profile";
import { approveMember } from "./services/status";
import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";
import type { Grant } from "./types";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

const FEDERAL = {
  userId: "usr_fed",
  grants: [{ role: "federal_board", groupId: null }] as ReadonlyArray<Grant>,
};
const PLAIN = {
  userId: "usr_plain",
  grants: [{ role: "member", groupId: null }] as ReadonlyArray<Grant>,
};
const boardOf = (userId: string, groupId: string) => ({
  userId,
  grants: [{ role: "local_board", groupId }] as ReadonlyArray<Grant>,
});

describeIfDb("countPendingApprovals", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "bonn");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** A pending member in `groupId`. Pending is what createProfile writes. */
  async function pendingMember(userId: string, groupId: string): Promise<string> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Test",
      lastName: "Person",
      primaryGroupId: groupId,
    });
    return m.id;
  }

  async function activeMember(userId: string, groupId: string): Promise<string> {
    const id = await pendingMember(userId, groupId);
    await approveMember(t.db, id, FEDERAL);
    return id;
  }

  it("zählt für den Bundesvorstand alle offenen Mitglieder", async () => {
    await pendingMember("usr_1", "grp_a");
    await pendingMember("usr_2", "grp_b");

    const counts = await countPendingApprovals(t.db, FEDERAL);

    expect(counts.pendingMembers).toBe(2);
  });

  it("zählt für einen lokalen Vorstand nur die eigene Gruppe", async () => {
    await pendingMember("usr_1", "grp_a");
    await pendingMember("usr_2", "grp_b");

    const counts = await countPendingApprovals(t.db, boardOf("usr_board_a", "grp_a"));

    expect(counts.pendingMembers).toBe(1);
  });

  it("gibt einem einfachen Mitglied Nullen statt eines Fehlers", async () => {
    await pendingMember("usr_1", "grp_a");

    const counts = await countPendingApprovals(t.db, PLAIN);

    expect(counts).toEqual({ pendingMembers: 0, incomingGroupChanges: 0 });
  });

  it("zählt einen Gruppenwechsel beim Zielvorstand, nicht beim Herkunftsvorstand", async () => {
    const moverId = await activeMember("usr_mover", "grp_a");
    await changePrimaryGroup(t.db, moverId, "grp_b", {
      userId: "usr_mover",
      grants: PLAIN.grants,
    });

    const target = await countPendingApprovals(t.db, boardOf("usr_board_b", "grp_b"));
    const origin = await countPendingApprovals(t.db, boardOf("usr_board_a", "grp_a"));

    expect(target.incomingGroupChanges).toBe(1);
    expect(origin.incomingGroupChanges).toBe(0);
  });
});
```

> Der letzte Test verlässt sich auf ADR 0021's föderalen Rückfall: Gruppe B hat keinen aktiven lokalen Vorstandssitz, `canDecideJoinRequest` gibt dem `local_board` von B die Entscheidung trotzdem. Schlägt er mit `0` statt `1` fehl, lege vor dem Wechsel per `grantRole` einen echten `local_board`-Sitz in `grp_b` an — prüfe die Signatur von `grantRole` in `modules/members/src/services/roles.ts`.

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

```bash
pnpm --filter @bdas/members exec vitest run src/approval-counts.test.ts
```

Erwartet: FAIL mit „Cannot find module './services/approval-counts'".

- [ ] **Step 3: Den Service schreiben**

`modules/members/src/services/approval-counts.ts` anlegen:

```ts
/**
 * Counts for the header badge. Deliberately separate from `listPendingMembers`
 * and `listOpenGroupChanges`: the badge renders on every page, and loading full
 * rows plus a join for a single integer is the wrong trade there.
 *
 * Unlike `listPendingMembers`, an actor without a board role gets zeros instead
 * of a ForbiddenError — a thrown permission in a site-wide header is a page
 * error, not a zero.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { canDecideJoinRequest, isFederalBoard } from "../roles";
import { memberGroupChangeRequests, members } from "../schema";

import { scopedGroupIds, groupHasActiveLocalBoard, type Actor, type Db } from "./status";

export type ApprovalCounts = {
  readonly pendingMembers: number;
  readonly incomingGroupChanges: number;
};

const ZERO: ApprovalCounts = { pendingMembers: 0, incomingGroupChanges: 0 };

export async function countPendingApprovals(db: Db, actor: Actor): Promise<ApprovalCounts> {
  const federal = isFederalBoard(actor.grants);
  const scoped = scopedGroupIds(actor);
  if (!federal && scoped.length === 0) return ZERO;

  const memberWhere = federal
    ? eq(members.status, "pending")
    : and(eq(members.status, "pending"), inArray(members.primaryGroupId, scoped));

  const [memberRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(members)
    .where(memberWhere);

  const changeRows = await db
    .select({ toGroupId: memberGroupChangeRequests.toGroupId, n: sql<number>`count(*)::int` })
    .from(memberGroupChangeRequests)
    .where(eq(memberGroupChangeRequests.status, "pending"))
    .groupBy(memberGroupChangeRequests.toGroupId);

  // canDecide needs to know whether each destination group has a board of its
  // own (the federal fallback in ADR 0021). One probe per distinct destination,
  // same shape as listOpenGroupChanges.
  let incoming = 0;
  for (const row of changeRows) {
    if (row.toGroupId === null) continue;
    if (!federal && !scoped.includes(row.toGroupId)) continue;
    const hasBoard = await groupHasActiveLocalBoard(db, row.toGroupId);
    if (canDecideJoinRequest(actor.grants, row.toGroupId, hasBoard)) incoming += row.n;
  }

  return { pendingMembers: memberRow?.n ?? 0, incomingGroupChanges: incoming };
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

```bash
pnpm --filter @bdas/members exec vitest run src/approval-counts.test.ts
```

Erwartet: PASS (4 Tests). Läuft kein Postgres, ist SKIPPED das erwartete Ergebnis — dann zusätzlich `pnpm exec tsc --noEmit -p modules/members/tsconfig.json` mit Exit 0.

- [ ] **Step 5: Aus `index.ts` re-exportieren**

In `modules/members/src/index.ts` nach der Zeile `export { listPendingMembers } from "./services/list-pending";` einfügen:

```ts
export {
  countPendingApprovals,
  type ApprovalCounts,
} from "./services/approval-counts";
```

- [ ] **Step 6: Typprüfung und Commit**

```bash
pnpm exec tsc --noEmit -p modules/members/tsconfig.json
git add modules/members/src/services/approval-counts.ts modules/members/src/approval-counts.test.ts modules/members/src/index.ts
git commit -m "feat(members): count pending approvals for the header badge"
```

---

### Task A3: `countOpenReports` in `blog`

**Files:**

- Modify: `modules/blog/src/services/report.ts`
- Modify: `modules/blog/src/index.ts`
- Test: `modules/blog/src/index.test.ts`

**Interfaces:**

- Produces: `countOpenReports(db: Db): Promise<number>` aus `@bdas/blog`.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `modules/blog/src/index.test.ts` `countOpenReports` zum bestehenden Import aus `./services/report` hinzufügen (bzw. zum Import, über den `reportPost` und `dismissReport` bereits hereinkommen), und diesen Block ergänzen:

```ts
  it("countOpenReports zählt offene Meldungen und ignoriert verworfene", async () => {
    const p1 = await createPost(t.db, { title: "Erster Beitrag", content: doc("Text.") }, "usr_a");
    const p2 = await createPost(t.db, { title: "Zweiter Beitrag", content: doc("Text.") }, "usr_a");
    await reportPost(t.db, p1.id, "usr_reporter", "Wirkt wie Spam");
    await reportPost(t.db, p2.id, "usr_reporter", null);

    expect(await countOpenReports(t.db)).toBe(2);

    const [open] = await listOpenReports(t.db);
    await dismissReport(t.db, open!.id);

    expect(await countOpenReports(t.db)).toBe(1);
  });
```

`createPost(db, { title, content }, createdBy)` und der `doc(...)`-Helfer werden in derselben Datei bereits so verwendet; `reportPost` weist Selbstmeldungen ab, daher ist `usr_reporter` ein anderer Nutzer als der Autor `usr_a`.

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

```bash
pnpm --filter @bdas/blog exec vitest run src/index.test.ts -t countOpenReports
```

Erwartet: FAIL — `countOpenReports` existiert nicht.

- [ ] **Step 3: Den Zähler schreiben**

In `modules/blog/src/services/report.ts` direkt nach `listOpenReports` einfügen:

```ts
/** How many reports await review. Same predicate as `listOpenReports`, without the join payload. */
export async function countOpenReports(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(postReports)
    .innerJoin(posts, eq(postReports.postId, posts.id))
    .where(and(eq(postReports.status, "open"), isNull(posts.deletedAt)));
  return row?.n ?? 0;
}
```

`sql`, `and`, `eq` und `isNull` stehen bereits im Import-Kopf der Datei.

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

```bash
pnpm --filter @bdas/blog exec vitest run src/index.test.ts -t countOpenReports
```

Erwartet: PASS.

- [ ] **Step 5: Re-Export und Commit**

In `modules/blog/src/index.ts` die Zeile

```ts
export { reportPost, listOpenReports, dismissReport } from "./services/report";
```

ersetzen durch:

```ts
export { reportPost, listOpenReports, countOpenReports, dismissReport } from "./services/report";
```

```bash
pnpm exec tsc --noEmit -p modules/blog/tsconfig.json
git add modules/blog/src/services/report.ts modules/blog/src/index.ts modules/blog/src/index.test.ts
git commit -m "feat(blog): count open reports"
```

---

### Task A4: `Badge` im Design-System

**Files:**

- Create: `core/design-system/src/components/badge-count.ts`
- Create: `core/design-system/src/components/badge-count.test.ts`
- Create: `core/design-system/src/components/Badge.tsx`
- Modify: `core/design-system/src/index.ts`

**Interfaces:**

- Produces:
  ```ts
  export function badgeText(count: number): string;         // "3" | "99+"
  export function badgeLabel(count: number, label: string): string; // "3 offene Freigaben"
  export type BadgeProps = { count: number; label: string; className?: string };
  export function Badge(props: BadgeProps): JSX.Element | null;
  ```

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`core/design-system/src/components/badge-count.test.ts` anlegen:

```ts
import { describe, expect, it } from "vitest";

import { badgeLabel, badgeText } from "./badge-count";

describe("badgeText", () => {
  it("zeigt kleine Zahlen unverändert", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(99)).toBe("99");
  });

  it("deckelt ab 100 auf 99+", () => {
    expect(badgeText(100)).toBe("99+");
    expect(badgeText(4711)).toBe("99+");
  });
});

describe("badgeLabel", () => {
  it("nennt die echte Zahl, auch wenn die Anzeige gedeckelt ist", () => {
    expect(badgeLabel(3, "offene Freigaben")).toBe("3 offene Freigaben");
    expect(badgeLabel(150, "offene Freigaben")).toBe("150 offene Freigaben");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

```bash
pnpm --filter @bdas/design-system exec vitest run src/components/badge-count.test.ts
```

Erwartet: FAIL — Modul nicht gefunden.

- [ ] **Step 3: Die pure Schicht schreiben**

`core/design-system/src/components/badge-count.ts` anlegen:

```ts
/** Display cap: past two digits the exact number stops being readable at pill size. */
const MAX_SHOWN = 99;

export function badgeText(count: number): string {
  return count > MAX_SHOWN ? `${MAX_SHOWN}+` : String(count);
}

/** Screen readers get the real number even when the visible text is capped. */
export function badgeLabel(count: number, label: string): string {
  return `${count} ${label}`;
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

```bash
pnpm --filter @bdas/design-system exec vitest run src/components/badge-count.test.ts
```

Erwartet: PASS (4 Tests).

- [ ] **Step 5: Die Komponente schreiben**

`core/design-system/src/components/Badge.tsx` anlegen:

```tsx
import { cx } from "../cx";

import { badgeLabel, badgeText } from "./badge-count";

export type BadgeProps = {
  count: number;
  /** Plural noun for screen readers, e.g. "offene Freigaben". */
  label: string;
  className?: string;
};

/**
 * Count marker for "there is something to do here". Red is the brand's
 * active/open accent (CLAUDE.md §7), which is exactly this state.
 *
 * Renders nothing at zero so callers never have to guard the call site.
 */
export function Badge({ count, label, className }: BadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      role="status"
      aria-label={badgeLabel(count, label)}
      className={cx(
        "inline-flex min-w-[1.25rem] items-center justify-center rounded-bdas-full bg-bdas-red px-1.5 py-0.5 text-bdas-submenu-link font-medium leading-none text-white",
        className,
      )}
    >
      {badgeText(count)}
    </span>
  );
}
```

`text-bdas-submenu-link` ist die kleinste im Preset registrierte Schriftgröße (`typography.size.submenuLink`, 0.85rem) und damit die richtige Wahl. Erfinde keine neue Größe und schreibe keinen Pixelwert hin. `min-w-[1.25rem]` ist die einzige arbiträre Klasse hier — sie hält den Kreis bei einstelligen Zahlen rund und ist eine Geometrie, keine Design-Token-Entscheidung.

- [ ] **Step 6: Re-Export, Typprüfung, Commit**

In `core/design-system/src/index.ts` nach der `FilterChip`-Zeile ergänzen:

```ts
export { Badge, type BadgeProps } from "./components/Badge";
export { badgeText, badgeLabel } from "./components/badge-count";
```

```bash
pnpm exec tsc --noEmit -p core/design-system/tsconfig.json
git add core/design-system/src/components/Badge.tsx core/design-system/src/components/badge-count.ts core/design-system/src/components/badge-count.test.ts core/design-system/src/index.ts
git commit -m "feat(design-system): add Badge count marker"
```

---

### Task A5: `loadApprovalCounts` in der App-Schicht

**Files:**

- Create: `apps/web/app/_dashboard/approvals.ts`
- Test: `apps/web/app/_dashboard/approvals.test.ts` (create)

**Interfaces:**

- Consumes: `countPendingApprovals` (Task A2), `countOpenReports` (Task A3), `loadCurrentMember` aus `apps/web/app/_dashboard/session.ts`, `canAdministerBoard` aus `@bdas/dashboard-shell`, `isFederalBoard` aus `@bdas/members`, `isFlagOn` aus `@bdas/feature-flags`.
- Produces:
  ```ts
  export type ApprovalSummary = {
    readonly pendingMembers: number;
    readonly incomingGroupChanges: number;
    readonly openReports: number;
    readonly total: number;
  };
  export const loadApprovalCounts: () => Promise<ApprovalSummary>;
  ```

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`apps/web/app/_dashboard/approvals.test.ts` anlegen. Das Mock-Muster stammt aus `apps/web/app/_blog/access.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const countPendingApprovals = vi.fn();
const countOpenReports = vi.fn();
const loadCurrentMember = vi.fn();
const isFlagOn = vi.fn();

vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/navigation", () => ({}));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("@bdas/feature-flags", () => ({ isFlagOn: (f: string) => isFlagOn(f) }));
vi.mock("@bdas/dashboard-shell", () => ({
  canAdministerBoard: (grants: ReadonlyArray<{ role: string }>) =>
    grants.some((g) => g.role.includes("board")),
}));
vi.mock("@bdas/members", () => ({
  countPendingApprovals: (...a: unknown[]) => countPendingApprovals(...a),
  isFederalBoard: (grants: ReadonlyArray<{ role: string }>) =>
    grants.some((g) => g.role === "federal_board"),
}));
vi.mock("@bdas/blog", () => ({
  countOpenReports: (...a: unknown[]) => countOpenReports(...a),
}));
vi.mock("./session", () => ({ loadCurrentMember: () => loadCurrentMember() }));

import { loadApprovalCounts } from "./approvals";

const meWith = (roles: string[]) => ({
  user: { id: "usr_1" },
  member: { id: "mem_1" },
  grants: roles.map((role) => ({ role, groupId: null })),
});

describe("loadApprovalCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFlagOn.mockReturnValue(true);
    countPendingApprovals.mockResolvedValue({ pendingMembers: 0, incomingGroupChanges: 0 });
    countOpenReports.mockResolvedValue(0);
  });

  it("fragt für einen Gast nichts ab", async () => {
    loadCurrentMember.mockResolvedValue(null);

    const out = await loadApprovalCounts();

    expect(out.total).toBe(0);
    expect(countPendingApprovals).not.toHaveBeenCalled();
    expect(countOpenReports).not.toHaveBeenCalled();
  });

  it("fragt für ein einfaches Mitglied nichts ab", async () => {
    loadCurrentMember.mockResolvedValue(meWith([]));

    const out = await loadApprovalCounts();

    expect(out.total).toBe(0);
    expect(countPendingApprovals).not.toHaveBeenCalled();
  });

  it("summiert alle drei Quellen für den Bundesvorstand", async () => {
    loadCurrentMember.mockResolvedValue(meWith(["federal_board"]));
    countPendingApprovals.mockResolvedValue({ pendingMembers: 2, incomingGroupChanges: 1 });
    countOpenReports.mockResolvedValue(3);

    const out = await loadApprovalCounts();

    expect(out).toEqual({
      pendingMembers: 2,
      incomingGroupChanges: 1,
      openReports: 3,
      total: 6,
    });
  });

  it("zählt Meldungen nicht für einen lokalen Vorstand", async () => {
    loadCurrentMember.mockResolvedValue(meWith(["local_board"]));
    countPendingApprovals.mockResolvedValue({ pendingMembers: 1, incomingGroupChanges: 0 });
    countOpenReports.mockResolvedValue(5);

    const out = await loadApprovalCounts();

    expect(out.openReports).toBe(0);
    expect(out.total).toBe(1);
    expect(countOpenReports).not.toHaveBeenCalled();
  });

  it("zählt Meldungen nicht bei ausgeschaltetem blog-Flag", async () => {
    loadCurrentMember.mockResolvedValue(meWith(["federal_board"]));
    isFlagOn.mockImplementation((f: string) => f !== "blog");
    countOpenReports.mockResolvedValue(5);

    const out = await loadApprovalCounts();

    expect(out.openReports).toBe(0);
    expect(countOpenReports).not.toHaveBeenCalled();
  });

  it("zählt Mitglieder nicht bei ausgeschaltetem members-Flag", async () => {
    loadCurrentMember.mockResolvedValue(meWith(["federal_board"]));
    isFlagOn.mockImplementation((f: string) => f !== "members");
    countPendingApprovals.mockResolvedValue({ pendingMembers: 4, incomingGroupChanges: 2 });

    const out = await loadApprovalCounts();

    expect(out.pendingMembers).toBe(0);
    expect(out.incomingGroupChanges).toBe(0);
    expect(countPendingApprovals).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

```bash
pnpm exec vitest run apps/web/app/_dashboard/approvals.test.ts
```

Erwartet: FAIL — `./approvals` existiert nicht.

- [ ] **Step 3: Die Komposition schreiben**

`apps/web/app/_dashboard/approvals.ts` anlegen:

```ts
/**
 * How many decisions wait for the current viewer, across every queue that ends
 * in one click: pending members, incoming group transfers, open post reports.
 *
 * Rendered by the site-wide header, so the order of the guards below is load
 * bearing — a viewer with no board role must not cause a single query.
 */
import { cache } from "react";

import { countOpenReports } from "@bdas/blog";
import { canAdministerBoard } from "@bdas/dashboard-shell";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { countPendingApprovals, isFederalBoard } from "@bdas/members";

import { loadCurrentMember } from "./session";

export type ApprovalSummary = {
  readonly pendingMembers: number;
  readonly incomingGroupChanges: number;
  readonly openReports: number;
  readonly total: number;
};

const NONE: ApprovalSummary = {
  pendingMembers: 0,
  incomingGroupChanges: 0,
  openReports: 0,
  total: 0,
};

export const loadApprovalCounts = cache(async (): Promise<ApprovalSummary> => {
  const me = await loadCurrentMember();
  if (!me || !canAdministerBoard(me.grants)) return NONE;

  const db = getDb();
  const actor = { userId: me.user.id, grants: me.grants };

  const members = isFlagOn("members")
    ? await countPendingApprovals(db, actor)
    : { pendingMembers: 0, incomingGroupChanges: 0 };

  const openReports =
    isFederalBoard(me.grants) && isFlagOn("blog") ? await countOpenReports(db) : 0;

  return {
    pendingMembers: members.pendingMembers,
    incomingGroupChanges: members.incomingGroupChanges,
    openReports,
    total: members.pendingMembers + members.incomingGroupChanges + openReports,
  };
});
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

```bash
pnpm exec vitest run apps/web/app/_dashboard/approvals.test.ts
```

Erwartet: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_dashboard/approvals.ts apps/web/app/_dashboard/approvals.test.ts
git commit -m "feat(web): compose approval counts for header and account"
```

---

### Task A6: Badge im Kopfmenü

**Files:**

- Modify: `apps/web/app/_public/PublicHeader.tsx`

**Interfaces:**

- Consumes: `loadApprovalCounts` (Task A5), `Badge` (Task A4).

- [ ] **Step 1: Importe und Zählerabruf ergänzen**

In `apps/web/app/_public/PublicHeader.tsx` die Importe erweitern:

```tsx
import { Badge } from "@bdas/design-system";
```

und

```tsx
import { loadApprovalCounts } from "../_dashboard/approvals";
```

In `PublicHeader()` direkt nach `const isBoard = me ? canAdministerBoard(me.grants) : false;` einfügen:

```tsx
  const approvals = isBoard ? await loadApprovalCounts() : null;
  const openCount = approvals?.total ?? 0;
```

- [ ] **Step 2: Badge am Desktop-Namens-Pill**

Im Desktop-Zweig die `<summary>` mit `{displayName}` so ergänzen, dass der Badge zwischen Name und Pfeil steht:

```tsx
                      {displayName}
                      <Badge count={openCount} label="offene Freigaben" className="ml-2" />
                      <span
                        aria-hidden
                        className="ml-1 text-bdas-ink-muted transition-transform duration-bdas-quick group-open:rotate-180"
                      >
                        ▾
                      </span>
```

- [ ] **Step 3: Badge am „Board-Bereich"-Eintrag, Desktop und Mobil**

Beide Vorkommen von

```tsx
                          <Link href="/dashboard" className={DROPDOWN_LINK}>
                            Board-Bereich
                          </Link>
```

ersetzen durch (Einrückung jeweils beibehalten):

```tsx
                          <Link href="/dashboard" className={`${DROPDOWN_LINK} flex items-center justify-between gap-2`}>
                            <span>Board-Bereich</span>
                            <Badge count={openCount} label="offene Freigaben" />
                          </Link>
```

- [ ] **Step 4: Badge am mobilen „Menü"-Button**

Mobil gibt es kein Namens-Pill; ohne diesen Platz wäre die Zahl auf dem Handy unsichtbar. Die `<summary>` des mobilen Menüs ändern zu:

```tsx
            <summary
              aria-label="Menü öffnen"
              className="ml-auto flex cursor-pointer list-none items-center gap-2 rounded-bdas border border-bdas-strong px-3 py-1.5 text-bdas-ink [&::-webkit-details-marker]:hidden md:hidden"
            >
              Menü
              <Badge count={openCount} label="offene Freigaben" />
            </summary>
```

Das `ml-auto md:hidden` wandert damit vom `<details>` auf die `<summary>`; setze am `<details>` weiterhin `className="ml-auto md:hidden"`, damit das Layout unverändert bleibt, und lass an der `<summary>` nur `flex items-center gap-2` zusätzlich stehen. Prüfe das Ergebnis im Browser, bevor du committest.

- [ ] **Step 5: Typprüfung und Lint**

```bash
pnpm exec tsc --noEmit -p apps/web/tsconfig.json && pnpm exec eslint apps/web/app/_public/PublicHeader.tsx
```

Erwartet: beides Exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_public/PublicHeader.tsx
git commit -m "feat(web): show open approvals as a badge in the header menu"
```

---

### Task A7: `/account` — Hinweis nur bei echter Arbeit

**Files:**

- Create: `apps/web/app/account/ApprovalsAlert.tsx`
- Modify: `apps/web/app/account/page.tsx`

**Interfaces:**

- Consumes: `loadApprovalCounts` (Task A5).
- Produces: `<ApprovalsAlert groupSlug={string | null} />` — eine async Server Component, die bei `total === 0` `null` rendert.

- [ ] **Step 1: Die Komponente schreiben**

`apps/web/app/account/ApprovalsAlert.tsx` anlegen:

```tsx
import Link from "next/link";

import { Alert } from "@bdas/design-system";
import { isFederalBoard } from "@bdas/members";

import { loadApprovalCounts } from "../_dashboard/approvals";
import { loadCurrentMember } from "../_dashboard/session";

/**
 * The board's to-do line on /account. Renders only when something actually
 * waits — a permanent "you have board rights" banner reads as a task and is
 * one most of the time it is shown.
 */
export async function ApprovalsAlert({ groupSlug }: { groupSlug: string | null }) {
  const me = await loadCurrentMember();
  if (!me) return null;

  const counts = await loadApprovalCounts();
  if (counts.total === 0) return null;

  const federal = isFederalBoard(me.grants);
  const membersHref = federal
    ? "/admin/pending-members"
    : groupSlug
      ? `/gruppe/${groupSlug}/members`
      : null;

  return (
    <Alert variant="info" title="Es wartet etwas auf dich">
      <span className="flex flex-col gap-1">
        {counts.pendingMembers > 0 && membersHref ? (
          <Link href={membersHref} className="text-bdas-red hover:underline">
            {counts.pendingMembers} Mitglied(er) freigeben →
          </Link>
        ) : null}
        {counts.incomingGroupChanges > 0 && membersHref ? (
          <Link href={membersHref} className="text-bdas-red hover:underline">
            {counts.incomingGroupChanges} Gruppenwechsel entscheiden →
          </Link>
        ) : null}
        {counts.openReports > 0 ? (
          <Link href="/blog/meldungen" className="text-bdas-red hover:underline">
            {counts.openReports} gemeldete(r) Beitrag/Beiträge prüfen →
          </Link>
        ) : null}
      </span>
    </Alert>
  );
}
```

- [ ] **Step 2: Den alten Block in `page.tsx` ersetzen**

In `apps/web/app/account/page.tsx` diesen Block **löschen**:

```tsx
      {isBoard ? (
        <Alert variant="info" title="Bundesvorstand">
          Du hast Bundesvorstands-Rechte.{" "}
          <Link href="/admin/pending-members" className="text-bdas-red hover:underline">
            Pending-Mitglieder verwalten →
          </Link>
        </Alert>
      ) : null}
```

und an derselben Stelle einsetzen:

```tsx
      <ApprovalsAlert groupSlug={currentGroupSlug} />
```

- [ ] **Step 3: Den Slug bereitstellen und die tote Variable entfernen**

`groups` ist in `page.tsx` bereits geladen. Nach `const currentGroupName = groupName(me.member?.primaryGroupId ?? null);` einfügen:

```tsx
  const currentGroupSlug =
    groups.find((g) => g.id === me.member?.primaryGroupId)?.slug ?? null;
```

Den Import ergänzen:

```tsx
import { ApprovalsAlert } from "./ApprovalsAlert";
```

`const isBoard = isFederalBoard(me.grants);` hat danach keinen Verwender mehr — die Zeile löschen und `isFederalBoard` aus dem `@bdas/members`-Import entfernen, sofern es dort sonst nicht mehr gebraucht wird. `Link` bleibt importiert (die Datenexport-Zeile nutzt es weiterhin).

- [ ] **Step 4: Typprüfung und Lint**

```bash
pnpm exec tsc --noEmit -p apps/web/tsconfig.json && pnpm exec eslint apps/web/app/account/
```

Erwartet: beides Exit 0, insbesondere keine „unused variable"-Meldung für `isBoard` oder `isFederalBoard`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/account/ApprovalsAlert.tsx apps/web/app/account/page.tsx
git commit -m "feat(web): show the account board alert only when work is waiting"
```

---

### Task A8: E2E für den Zähler

**Files:**

- Create: `e2e/approvals-badge.e2e.ts`

- [ ] **Step 1: Den E2E-Test schreiben**

`e2e/approvals-badge.e2e.ts` anlegen:

```ts
/**
 * The approval badge: a board with something to decide sees a number at its
 * name and a to-do line on /account; a plain member sees neither.
 */
import { expect, test } from "@playwright/test";

import { grantLocalBoard, memberIdByEmail, seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import { createProfile, login, logout, registerVerifyLogin } from "./helpers/flows";

test("ein Vorstand mit offener Freigabe sieht Zahl und Hinweis", async ({ page }) => {
  const slug = uniqueSlug("badge");
  const groupId = await seedGroup({ slug, name: "Badge-Gruppe", city: "Aachen" });

  const boardEmail = uniqueEmail("board");
  await registerVerifyLogin(page, { email: boardEmail, firstName: "Bea", lastName: "Vorstand" });
  await createProfile(page, { firstName: "Bea", lastName: "Vorstand", groupId });
  await grantLocalBoard(boardEmail, groupId);
  await logout(page);

  const applicantEmail = uniqueEmail("bewerber");
  await registerVerifyLogin(page, { email: applicantEmail, firstName: "Ali", lastName: "Neu" });
  await createProfile(page, { firstName: "Ali", lastName: "Neu", groupId });
  expect(await memberIdByEmail(applicantEmail)).not.toBeNull();
  await logout(page);

  await login(page, boardEmail);
  await page.goto("/account");

  await expect(page.getByRole("status", { name: /offene Freigaben/ }).first()).toBeVisible();
  await expect(page.getByText("Es wartet etwas auf dich")).toBeVisible();
  await expect(page.getByRole("link", { name: /Mitglied\(er\) freigeben/ })).toBeVisible();
});

test("ein einfaches Mitglied sieht weder Zahl noch Hinweis", async ({ page }) => {
  const slug = uniqueSlug("kein-badge");
  const groupId = await seedGroup({ slug, name: "Ruhige Gruppe", city: "Köln" });

  const email = uniqueEmail("mitglied");
  await registerVerifyLogin(page, { email, firstName: "Mia", lastName: "Mitglied" });
  await createProfile(page, { firstName: "Mia", lastName: "Mitglied", groupId });

  await page.goto("/account");

  await expect(page.getByRole("status", { name: /offene Freigaben/ })).toHaveCount(0);
  await expect(page.getByText("Es wartet etwas auf dich")).toHaveCount(0);
});
```

> Signaturen (verifiziert): `seedGroup({ slug, name, city })`, `grantLocalBoard(email, groupId)`, `memberIdByEmail(email)` aus `e2e/helpers/db.ts`; `login(page, email, password?, opts?)` — **positional**, das Passwort hat mit `PASSWORD` einen Default —, `registerVerifyLogin(page, { email, firstName, lastName })`, `createProfile(page, { firstName, lastName, groupId })`, `logout(page)` aus `e2e/helpers/flows.ts`.
>
> Diese Suite läuft auf einem mobilen Viewport, auf dem der Desktop-Zweig des Headers nicht rendert. Der Badge am Namens-Pill ist dort also unsichtbar — die `getByRole("status")`-Zusicherung trifft den Badge am mobilen „Menü"-Button beziehungsweise den auf `/account`. Willst du den Desktop-Badge sehen, ruf vorher `await page.setViewportSize({ width: 1280, height: 800 })` auf.

- [ ] **Step 2: Den Test laufen lassen**

```bash
pnpm exec playwright test e2e/approvals-badge.e2e.ts
```

Erwartet: 2 passed. Läuft die lokale Umgebung nicht, siehe die Notizen zum lokalen E2E-Setup; scheitert der Lauf an der Umgebung statt am Code, halte das im PR fest, statt den Test abzuschwächen.

- [ ] **Step 3: Voller Testlauf und Commit**

```bash
pnpm test && pnpm exec tsc --noEmit -p apps/web/tsconfig.json
git add e2e/approvals-badge.e2e.ts
git commit -m "test(e2e): cover the approval badge and account alert"
```

- [ ] **Step 4: PR öffnen**

```bash
git push -u origin feat/approval-badge
gh pr create --title "feat: approval badge in the header, conditional account alert" --body "$(cat <<'EOF'
Zählt offene Freigaben (Mitglieder, Gruppenwechsel, Meldungen) und zeigt sie als rote Zahl am Namen im Kopfmenü. Der Board-Hinweis auf /account erscheint nur noch, wenn tatsächlich etwas offen ist — und jetzt auch für lokale Vorstände.

Spec: docs/superpowers/specs/2026-07-27-freigaben-badge-bildzuschnitt-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MRimTVLqzGD3UBayGbVKPr
EOF
)"
```

Danach `/review` auf dem PR laufen lassen (CLAUDE.md §4).

---

# Teil B — Bildzuschnitt

### Task B0: Branch

- [ ] **Step 1: Feature-Branch anlegen**

```bash
git checkout main && git pull && git checkout -b feat/profile-photo-crop && git branch --show-current
```

Erwartet: `feat/profile-photo-crop`.

---

### Task B1: Die pure Rechenschicht

**Files:**

- Create: `apps/web/app/_profile/crop.ts`
- Test: `apps/web/app/_profile/crop.test.ts` (create)

**Interfaces:**

- Produces:
  ```ts
  export type Size = { readonly width: number; readonly height: number };
  export type CropState = { readonly zoom: number; readonly x: number; readonly y: number };
  export type SourceRect = { readonly sx: number; readonly sy: number; readonly sw: number; readonly sh: number };
  export function minZoom(natural: Size, frame: number): number;
  export function clampOffset(state: CropState, natural: Size, frame: number): CropState;
  export function sourceRect(state: CropState, natural: Size, frame: number): SourceRect;
  ```

Modell: `zoom` ist der Faktor, mit dem das Bild dargestellt wird. Die dargestellte Größe ist `natural.width * zoom` × `natural.height * zoom`. `x`/`y` sind der Versatz der linken oberen Bildecke gegenüber der linken oberen Rahmenecke, in Anzeige-Pixeln, und damit stets `<= 0`.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`apps/web/app/_profile/crop.test.ts` anlegen:

```ts
import { describe, expect, it } from "vitest";

import { clampOffset, minZoom, sourceRect } from "./crop";

const FRAME = 300;

describe("minZoom", () => {
  it("skaliert ein Querformat auf die Höhe", () => {
    expect(minZoom({ width: 1200, height: 600 }, FRAME)).toBeCloseTo(0.5);
  });

  it("skaliert ein Hochformat auf die Breite", () => {
    expect(minZoom({ width: 600, height: 1200 }, FRAME)).toBeCloseTo(0.5);
  });

  it("vergrößert ein zu kleines Bild, bis es den Rahmen füllt", () => {
    expect(minZoom({ width: 150, height: 150 }, FRAME)).toBeCloseTo(2);
  });
});

describe("clampOffset", () => {
  const natural = { width: 1200, height: 600 };

  it("lässt oben und links keinen leeren Rand zu", () => {
    const out = clampOffset({ zoom: 0.5, x: 50, y: 20 }, natural, FRAME);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it("lässt unten und rechts keinen leeren Rand zu", () => {
    const out = clampOffset({ zoom: 0.5, x: -9999, y: -9999 }, natural, FRAME);
    expect(out.x).toBe(-(1200 * 0.5 - FRAME));
    expect(out.y).toBe(-(600 * 0.5 - FRAME));
  });

  it("lässt einen gültigen Versatz unverändert", () => {
    const out = clampOffset({ zoom: 0.5, x: -100, y: 0 }, natural, FRAME);
    expect(out).toEqual({ zoom: 0.5, x: -100, y: 0 });
  });

  it("hebt einen Zoom unterhalb von minZoom auf minZoom an", () => {
    const out = clampOffset({ zoom: 0.1, x: 0, y: 0 }, natural, FRAME);
    expect(out.zoom).toBeCloseTo(0.5);
  });
});

describe("sourceRect", () => {
  it("liefert bei minZoom und zentriertem Versatz den mittigen Quadrat-Ausschnitt", () => {
    const natural = { width: 1200, height: 600 };
    const zoom = minZoom(natural, FRAME);
    const centered = clampOffset(
      { zoom, x: -(1200 * zoom - FRAME) / 2, y: 0 },
      natural,
      FRAME,
    );

    const rect = sourceRect(centered, natural, FRAME);

    expect(rect.sw).toBeCloseTo(600);
    expect(rect.sh).toBeCloseTo(600);
    expect(rect.sx).toBeCloseTo(300);
    expect(rect.sy).toBeCloseTo(0);
  });

  it("wandert mit dem Versatz nach rechts", () => {
    const natural = { width: 1200, height: 600 };
    const rect = sourceRect({ zoom: 0.5, x: -300, y: 0 }, natural, FRAME);
    expect(rect.sx).toBeCloseTo(600);
    expect(rect.sw).toBeCloseTo(600);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

```bash
pnpm exec vitest run apps/web/app/_profile/crop.test.ts
```

Erwartet: FAIL — `./crop` existiert nicht.

- [ ] **Step 3: Die Rechenschicht schreiben**

`apps/web/app/_profile/crop.ts` anlegen:

```ts
/**
 * Geometry for the square avatar cropper. Framework-free so it can be tested
 * under vitest's node environment, where there is no DOM.
 *
 * `zoom` is the display factor; `x`/`y` are the image's top-left corner
 * relative to the frame's top-left corner, in displayed pixels, and are
 * therefore never positive once clamped.
 */
export type Size = { readonly width: number; readonly height: number };
export type CropState = { readonly zoom: number; readonly x: number; readonly y: number };
export type SourceRect = {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
};

/** The factor at which the shorter side exactly fills the frame. Below it, gaps appear. */
export function minZoom(natural: Size, frame: number): number {
  return Math.max(frame / natural.width, frame / natural.height);
}

export function clampOffset(state: CropState, natural: Size, frame: number): CropState {
  const zoom = Math.max(state.zoom, minZoom(natural, frame));
  const maxX = natural.width * zoom - frame;
  const maxY = natural.height * zoom - frame;
  return {
    zoom,
    x: Math.min(0, Math.max(-maxX, state.x)),
    y: Math.min(0, Math.max(-maxY, state.y)),
  };
}

/** The frame, expressed in the source image's own pixels — the arguments `drawImage` wants. */
export function sourceRect(state: CropState, natural: Size, frame: number): SourceRect {
  const { zoom, x, y } = clampOffset(state, natural, frame);
  const side = frame / zoom;
  return { sx: -x / zoom, sy: -y / zoom, sw: side, sh: side };
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

```bash
pnpm exec vitest run apps/web/app/_profile/crop.test.ts
```

Erwartet: PASS (9 Tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_profile/crop.ts apps/web/app/_profile/crop.test.ts
git commit -m "feat(web): add crop geometry for the avatar cropper"
```

---

### Task B2: Der Zuschnitt-Dialog

**Files:**

- Create: `apps/web/app/_profile/CropDialog.tsx`

**Interfaces:**

- Consumes: `clampOffset`, `minZoom`, `sourceRect`, `type CropState`, `type Size` aus `./crop` (Task B1).
- Produces:
  ```ts
  export type CropDialogProps = {
    file: File;
    onCancel: () => void;
    onDone: (cropped: File) => void;
  };
  export function CropDialog(props: CropDialogProps): JSX.Element;
  ```
  Der Aufrufer rendert `<CropDialog>` genau dann, wenn eine Datei zur Bearbeitung ansteht. `onDone` bekommt eine `File` mit MIME-Typ `image/webp`.

- [ ] **Step 1: Die Komponente schreiben**

`apps/web/app/_profile/CropDialog.tsx` anlegen:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@bdas/design-system";

import { clampOffset, minZoom, sourceRect, type CropState, type Size } from "./crop";

/** Preview frame in CSS pixels. The output is always OUTPUT_SIZE, independent of this. */
const FRAME = 280;
/** Stored edge length. Large enough for the 112px avatar on a 2x display, with room to spare. */
const OUTPUT_SIZE = 512;
const NUDGE = 8;
const ZOOM_STEP = 0.1;

export type CropDialogProps = {
  file: File;
  onCancel: () => void;
  onDone: (cropped: File) => void;
};

export function CropDialog({ file, onCancel, onDone }: CropDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragFrom = useRef<{ x: number; y: number; state: CropState } | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [state, setState] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    imageRef.current = img;
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    setNatural(size);
    const zoom = minZoom(size, FRAME);
    setState(
      clampOffset(
        { zoom, x: -(size.width * zoom - FRAME) / 2, y: -(size.height * zoom - FRAME) / 2 },
        size,
        FRAME,
      ),
    );
  }

  function move(next: CropState) {
    if (!natural) return;
    setState(clampOffset(next, natural, FRAME));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragFrom.current = { x: e.clientX, y: e.clientY, state };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const from = dragFrom.current;
    if (!from) return;
    move({
      zoom: from.state.zoom,
      x: from.state.x + (e.clientX - from.x),
      y: from.state.y + (e.clientY - from.y),
    });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragFrom.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const byKey: Record<string, Partial<CropState>> = {
      ArrowLeft: { x: state.x - NUDGE },
      ArrowRight: { x: state.x + NUDGE },
      ArrowUp: { y: state.y - NUDGE },
      ArrowDown: { y: state.y + NUDGE },
      "+": { zoom: state.zoom + ZOOM_STEP },
      "-": { zoom: state.zoom - ZOOM_STEP },
    };
    const patch = byKey[e.key];
    if (!patch) return;
    e.preventDefault();
    move({ ...state, ...patch });
  }

  async function confirm() {
    const img = imageRef.current;
    if (!img || !natural) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      const { sx, sy, sw, sh } = sourceRect(state, natural, FRAME);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.9),
      );
      // Rather no photo than one the user did not confirm: an unclipped upload
      // here would silently ignore the crop they just made.
      if (!blob) throw new Error("toBlob returned null");

      const base = file.name.replace(/\.[^.]+$/, "");
      onDone(new File([blob], `${base}.webp`, { type: "image/webp" }));
    } catch {
      setError("Zuschneiden fehlgeschlagen. Bitte ein anderes Bild versuchen.");
    } finally {
      setBusy(false);
    }
  }

  const zoomFloor = natural ? minZoom(natural, FRAME) : 1;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="rounded-bdas border border-bdas-strong bg-bdas-surface p-6 shadow-bdas-dropdown backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-bdas-ink">Bildausschnitt wählen</h2>

        <div
          role="application"
          aria-label="Bildausschnitt verschieben: Pfeiltasten bewegen, Plus und Minus zoomen"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
          onWheel={(e) => move({ ...state, zoom: state.zoom - Math.sign(e.deltaY) * ZOOM_STEP })}
          style={{ width: FRAME, height: FRAME }}
          className="relative touch-none overflow-hidden rounded-bdas-full border border-bdas-soft bg-bdas-overlay-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bdas-red"
        >
          {url ? (
            <img
              src={url}
              alt=""
              onLoad={onImageLoad}
              draggable={false}
              style={{
                position: "absolute",
                left: state.x,
                top: state.y,
                width: natural ? natural.width * state.zoom : undefined,
                maxWidth: "none",
              }}
            />
          ) : null}
        </div>

        <label className="flex items-center gap-3 text-sm text-bdas-ink-body">
          Zoom
          <input
            type="range"
            min={zoomFloor}
            max={zoomFloor * 4}
            step={0.01}
            value={state.zoom}
            onChange={(e) => move({ ...state, zoom: Number(e.currentTarget.value) })}
            className="flex-1"
          />
        </label>

        {error ? <p className="text-sm text-bdas-red">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={busy || !natural}>
            {busy ? "Wird zugeschnitten…" : "Übernehmen"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 2: Typprüfung und Lint**

```bash
pnpm exec tsc --noEmit -p apps/web/tsconfig.json && pnpm exec eslint apps/web/app/_profile/CropDialog.tsx
```

Erwartet: beides Exit 0. Beanstandet ESLint `role="application"`, ersetze es durch `role="img"` plus `aria-label` und behalte `tabIndex={0}`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/_profile/CropDialog.tsx
git commit -m "feat(web): add the avatar crop dialog"
```

---

### Task B3: Zuschnitt in beide Aufrufer einhängen

**Files:**

- Modify: `apps/web/app/account/AccountAvatar.tsx`
- Modify: `apps/web/app/profil/PhotoField.tsx`

**Interfaces:**

- Consumes: `CropDialog` (Task B2).

Beide Dateien fahren heute dasselbe Muster: `DropZone accept={PROFILE_IMAGE}` und ein verstecktes `<input type="file">` rufen jeweils `handle(file)`, das direkt `uploadImage` aufruft. Der Zuschnitt schiebt sich dazwischen: die eingehende Datei landet in `pending`, der Dialog erscheint, und erst sein Ergebnis geht an das bisherige `handle`.

- [ ] **Step 1: `AccountAvatar.tsx` umbauen**

Import ergänzen:

```tsx
import { CropDialog } from "../_profile/CropDialog";
```

State ergänzen, neben den bestehenden `useState`-Zeilen:

```tsx
  const [pending, setPending] = useState<File | null>(null);
```

Die bestehende Funktion `handle` **unverändert lassen** und beide Aufrufer stattdessen auf `setPending` umstellen:

```tsx
      onFile={(file) => setPending(file)}
```

und im `<input onChange=...>`:

```tsx
          if (file) setPending(file);
```

Innerhalb des `<DropZone>`, direkt vor dem schließenden `</DropZone>`, den Dialog rendern:

```tsx
      {pending ? (
        <CropDialog
          file={pending}
          onCancel={() => setPending(null)}
          onDone={(cropped) => {
            setPending(null);
            void handle(cropped);
          }}
        />
      ) : null}
```

- [ ] **Step 2: `PhotoField.tsx` genauso umbauen**

Import ergänzen (relativer Pfad beachten — die Datei liegt in `apps/web/app/profil/`):

```tsx
import { CropDialog } from "../_profile/CropDialog";
```

Denselben `pending`-State ergänzen, `onFile` und den `<input onChange>` auf `setPending` umstellen und denselben `<CropDialog>`-Block vor dem schließenden `</DropZone>` einsetzen. Der Name der Upload-Funktion in dieser Datei kann abweichen — verdrahte den `onDone`-Callback mit genau der Funktion, die dort bisher direkt aus `onFile` aufgerufen wurde.

- [ ] **Step 3: Typprüfung, Lint, bestehende Tests**

```bash
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm exec eslint apps/web/app/account/AccountAvatar.tsx apps/web/app/profil/PhotoField.tsx
pnpm test
```

Erwartet: alle drei Exit 0.

- [ ] **Step 4: Im Browser prüfen**

Dev-Server starten, auf `/account` ein Querformat-Bild auswählen und ein zweites per Drag & Drop ablegen. Erwartet in beiden Fällen: der Dialog öffnet, das Bild lässt sich ziehen und zoomen, es entstehen an keiner Position leere Ränder, „Übernehmen" schließt den Dialog und der Kreis zeigt den gewählten Ausschnitt. „Abbrechen" lädt nichts hoch.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/account/AccountAvatar.tsx apps/web/app/profil/PhotoField.tsx
git commit -m "feat(web): crop the profile photo before uploading it"
```

---

### Task B4: E2E für den Zuschnitt

**Files:**

- Create: `e2e/profile-photo-crop.e2e.ts`

- [ ] **Step 1: Den E2E-Test schreiben**

`e2e/profile-photo-crop.e2e.ts` anlegen:

```ts
/**
 * Picking a profile photo opens the cropper; only what it produces is uploaded.
 */
import { expect, test } from "@playwright/test";

import { seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import { createProfile, registerVerifyLogin } from "./helpers/flows";

// A 2x1 PNG, so the square crop has something to actually decide.
const WIDE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4nGP8z8DAwMDAwMAAAA4AAv0Ay5cAAAAASUVORK5CYII=",
  "base64",
);

test("Bildauswahl öffnet den Zuschnitt und lädt erst nach Übernehmen hoch", async ({ page }) => {
  const slug = uniqueSlug("crop");
  const groupId = await seedGroup({ slug, name: "Crop-Gruppe", city: "Bonn" });
  const email = uniqueEmail("crop");

  await registerVerifyLogin(page, { email, firstName: "Cara", lastName: "Crop" });
  await createProfile(page, { firstName: "Cara", lastName: "Crop", groupId });

  await page.goto("/account");
  await page.locator('input[type="file"]').setInputFiles({
    name: "breit.png",
    mimeType: "image/png",
    buffer: WIDE_PNG,
  });

  await expect(page.getByText("Bildausschnitt wählen")).toBeVisible();

  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByText("Bildausschnitt wählen")).toHaveCount(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: "breit.png",
    mimeType: "image/png",
    buffer: WIDE_PNG,
  });
  await expect(page.getByText("Bildausschnitt wählen")).toBeVisible();

  const upload = page.waitForRequest((r) => r.url().includes("/api/profile/upload-url"));
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await upload;

  await expect(page.getByText("Bildausschnitt wählen")).toHaveCount(0);
});
```

- [ ] **Step 2: Den Test laufen lassen**

```bash
pnpm exec playwright test e2e/profile-photo-crop.e2e.ts
```

Erwartet: 1 passed.

- [ ] **Step 3: Voller Testlauf und Commit**

```bash
pnpm test && pnpm exec playwright test e2e/account-profile.e2e.ts e2e/profile-onboarding.e2e.ts
git add e2e/profile-photo-crop.e2e.ts
git commit -m "test(e2e): cover the avatar crop dialog"
```

Die beiden bestehenden E2E-Dateien laufen mit, weil sie ebenfalls Bilder auswählen und jetzt durch den Dialog müssen. Schlagen sie fehl, ergänze dort den Klick auf „Übernehmen" — schwäche nicht den Dialog ab.

- [ ] **Step 4: PR öffnen**

```bash
git push -u origin feat/profile-photo-crop
gh pr create --title "feat: crop and zoom the profile photo before upload" --body "$(cat <<'EOF'
Nach Auswahl oder Drop öffnet ein Dialog mit Zoom und verschiebbarem Bild im quadratischen Rahmen. Hochgeladen wird ein 512×512-WebP; Server und Upload-Route bleiben unverändert.

Spec: docs/superpowers/specs/2026-07-27-freigaben-badge-bildzuschnitt-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MRimTVLqzGD3UBayGbVKPr
EOF
)"
```

Danach `/review` **und** `/security-review` (Files/Upload-PR, CLAUDE.md §4).

---

# Teil C — Spam-Hinweise

### Task C1: Drei Bestätigungsseiten nennen den Spam-Ordner

**Files:**

- Modify: `apps/web/app/passwort-zuruecksetzen/RequestForm.tsx`
- Modify: `apps/web/app/events/[id]/GuestRegisterForm.tsx`
- Modify: `apps/web/app/registrieren/erfolg/page.tsx`
- Modify: `e2e/auth.e2e.ts`

- [ ] **Step 1: Branch anlegen**

```bash
git checkout main && git pull && git checkout -b feat/spam-hinweise && git branch --show-current
```

- [ ] **Step 2: Passwort-Zurücksetzen**

In `apps/web/app/passwort-zuruecksetzen/RequestForm.tsx` den Alert-Text

```tsx
        Falls die E-Mail-Adresse bei uns registriert ist, haben wir dir einen Link zum Zurücksetzen
        geschickt. Der Link ist 1 Stunde gültig.
```

ersetzen durch:

```tsx
        Falls die E-Mail-Adresse bei uns registriert ist, haben wir dir einen Link zum Zurücksetzen
        geschickt. Der Link ist 1 Stunde gültig. Schau auch in deinen Spam-Ordner.
```

- [ ] **Step 3: Gast-Anmeldung zu Events**

In `apps/web/app/events/[id]/GuestRegisterForm.tsx` den Alert-Text

```tsx
        Wir haben dir eine Bestätigung per E-Mail geschickt. Über den Link darin kannst du dich
        jederzeit wieder abmelden.
```

ersetzen durch:

```tsx
        Wir haben dir eine Bestätigung per E-Mail geschickt. Über den Link darin kannst du dich
        jederzeit wieder abmelden. Schau auch in deinen Spam-Ordner.
```

- [ ] **Step 4: Registrierung — Hinweis in die Box ziehen**

In `apps/web/app/registrieren/erfolg/page.tsx` den Alert und den Absatz darunter ersetzen durch:

```tsx
      <Alert variant="success" title="Bestätigungslink versendet">
        Wir haben dir einen Link an deine E-Mail-Adresse geschickt. Bitte klicke darauf, um dein
        Konto zu aktivieren. Der Link ist 24 Stunden gültig. Schau auch in deinen Spam-Ordner.
      </Alert>
      <p className="text-sm text-bdas-ink-body">
        Keine E-Mail erhalten?{" "}
        <Link href="/verifizierung-erneut-senden" className="text-bdas-red hover:underline">
          Fordere einen neuen Link an
        </Link>
        .
      </p>
```

- [ ] **Step 5: E2E-Assertion ergänzen**

In `e2e/auth.e2e.ts` den Test finden, der nach der Registrierung auf `/registrieren/erfolg` landet, und dort ergänzen:

```ts
  await expect(page.getByText(/Spam-Ordner/)).toBeVisible();
```

Findest du keinen solchen Test, lege die Assertion stattdessen im Test in `e2e/resend-verification.e2e.ts` ab, der diese Seite besucht.

- [ ] **Step 6: Tests und Typprüfung**

```bash
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm exec playwright test e2e/auth.e2e.ts e2e/events.e2e.ts
```

Erwartet: beides grün.

- [ ] **Step 7: Commit und PR**

```bash
git add apps/web/app/passwort-zuruecksetzen/RequestForm.tsx "apps/web/app/events/[id]/GuestRegisterForm.tsx" apps/web/app/registrieren/erfolg/page.tsx e2e/auth.e2e.ts
git commit -m "feat(web): point at the spam folder on every mail confirmation"
git push -u origin feat/spam-hinweise
gh pr create --title "feat: mention the spam folder on all mail confirmations" --body "$(cat <<'EOF'
Passwort-Zurücksetzen und die Gast-Anmeldung nennen jetzt ebenfalls den Spam-Ordner; auf /registrieren/erfolg steht der Hinweis in der Box statt in der grauen Fußzeile.

Spec: docs/superpowers/specs/2026-07-27-freigaben-badge-bildzuschnitt-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MRimTVLqzGD3UBayGbVKPr
EOF
)"
```
