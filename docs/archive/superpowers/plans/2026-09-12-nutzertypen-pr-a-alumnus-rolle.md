# Nutzertypen-Fundament PR A: Alumnus wird Rolle, `inactive` entfällt — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `alumnus` existiert nur noch einmal — als Grant in `member_role_grants`. Der gleichnamige `MemberStatus` und der faktisch tote Status `inactive` verschwinden; `MemberStatus` schrumpft auf `pending | active` und bekommt erstmals einen CHECK-Constraint in der Datenbank.

**Architecture:** Es wird nichts gebaut, sondern eine Dublette gelöscht. Die Rolle `alumnus` ist im `Role`-Union und in jedem `member_role_grants_role_check` bereits vorhanden und über `grantRole` vergebbar. Die Arbeit besteht aus drei Sorten Änderung: (1) jede Stelle, die Alumni heute über den **Status** erkennt, fragt künftig die **Grants**; (2) eine Migration überführt die verbliebenen `alumnus`- und `inactive`-Zeilen nach `status = 'active'` plus Grant-Zeile; (3) der Typ schrumpft, wodurch der Compiler die letzten Fundstellen aufzeigt. Die Reihenfolge ist bewusst so gewählt, dass jede Task für sich grün ist: alle Verhaltensänderungen (1) landen **vor** Migration und Typverkleinerung (2/3).

**Tech Stack:** TypeScript, PostgreSQL (rohes SQL), Drizzle ORM, Next.js 14 App Router, React 18, Vitest (Unit + Integration gegen Docker-Postgres).

**Spec:** [`docs/superpowers/specs/2026-09-12-nutzertypen-fundament-design.md`](../specs/2026-09-12-nutzertypen-fundament-design.md) — Abschnitt 2 („PR A"). Die Entscheidung ist als ADR festgehalten; sie liegt bei Planerstellung unter `docs/decisions/0041-alumnus-ist-eine-rolle.md` und wird in **Task 1** auf `0043` umnummeriert (siehe Global Constraints).

---

## Global Constraints

- **Nur betroffene Tests ausführen.** Ausdrückliche Anweisung des Nutzers: niemals `pnpm test` über die ganze Suite. Immer nur die in der jeweiligen Task genannten Dateien, z. B. `pnpm exec vitest run modules/members/src/pool.test.ts`.
- **Vitest erfasst zusätzlich Kopien unter `.claude/worktrees/`.** Ein Lauf über einen Pfad meldet deshalb u. U. zwei Testdateien. Das ist bekannt und kein Fehler — nur die Datei ohne `worktrees/` im Pfad zählt.
- **ADR-Nummer:** `0041` ist auf `origin/main` durch das Karussell-Coverflow-ADR belegt, `0042` durch den offenen PR #224 (Bundesvorstand-Verteiler). Die Alumnus-Entscheidung bekommt daher **`0043`**. Vor dem Umbenennen mit `git ls-tree --name-only origin/main docs/decisions/ | sort | tail -3` gegenprüfen und, falls inzwischen auch 0043 belegt ist, die nächste freie Nummer nehmen und alle Verweise in diesem Plan mitziehen.
- **Integrationstests brauchen Postgres:** `pnpm db:up` (Docker) muss laufen, sonst überspringen sich die `describeIfDb`-Blöcke stillschweigend und melden fälschlich Grün. Vor jedem „Erwartet: PASS"-Schritt prüfen, dass die Tests tatsächlich **liefen** und nicht als `skipped` gezählt wurden.
- **CLAUDE.md §1 Regel 1:** nur `modules/members` liest und schreibt `members` und `member_role_grants`. Die App-Schicht bekommt die Alumnus-Information ausschließlich über die neuen Service-Exporte, nie über eigene Queries.
- **CLAUDE.md §1 Regel 7/8:** die Migration liegt in `modules/members/migrations/`, nächste freie Nummer ist `0011`. Jeder neue Export geht durch `modules/members/src/index.ts`.
- **CLAUDE.md §4:** Tests liegen im selben PR. Dieser PR ändert Autorisierung (`requireCanGrant`) → vor dem Merge `/security-review`.
- **Keine Datenbank-Mocks.** Alle Migrations- und Service-Tests laufen gegen echtes Postgres über `setupMembersDb()`.
- **Alumni behalten vollen Zugriff.** Das ist der Kern von ADR 0043: `viewerFrom` (`apps/web/lib/event-viewer.ts`) leitet `isActiveMember` aus `status === "active"` ab — Alumni werden `active` und bekommen damit Event-Anmeldung. Diese Datei wird **nicht angefasst**; dass sie unverändert bleibt, ist das gewünschte Ergebnis, kein Versehen.
- **Kein Ausschluss-Mechanismus.** Mit `inactive` fällt der letzte (ohnehin unverdrahtete) Weg weg, jemandem den Zugang zu entziehen. Das ist in ADR 0043 „Konsequenzen" bewusst so entschieden. Drei Tests in `group-change.test.ts`, die den deaktivierten Zustand prüfen, entfallen ersatzlos (Task 6) — das ist kein zu rettender Testverlust, sondern das Wegfallen eines Zustands.
- **Der Registrierungsprozess wird gerade neu konzipiert und ist NICHT Teil dieses PRs.** Die Richtung steht fest: man wählt zuerst, was man ist, und bekommt dann die dazu passenden Felder; ein Alumnus soll dort später eine Stadt **oder** eine Hochschulgruppe angeben können. Die Einzelheiten sind offen. PR A liefert nur die Logik darunter — den Grant mit optionalem Scope. Kein Feld im Registrierungsformular, keine Verzweigung im Wizard (`apps/web/app/profil/`), keine Stadt-Auswahl für Alumni. Der ungescopte Fall aus ADR 0043 §3 („Auswahl direkt bei der Registrierung") beschreibt, was der Grant später tragen **kann** — nicht, was hier gebaut wird.
- **Abweichung von der Spec-Tabelle in §2.5 (bewusst, einmalig):** die Spec listet keine Oberfläche zum Setzen der Markierung. Ohne sie wäre die in §2.4 geforderte Kennzeichnung nicht erreichbar und PR A würde tote UI ausliefern. **Task 7** ergänzt deshalb einen Umschalter im Mitglieder-Detail, der ausschließlich die bestehenden Server Actions `grantRoleAction`/`revokeRoleAction` benutzt — keine neue Action, kein neuer Service. Wer diesen Zusatz nicht will, lässt Task 7 weg; die Tasks 1–6 und 8 sind davon unabhängig.
- **Branch:** `feat/alumnus-ist-eine-rolle`, abgezweigt von **`docs/alumnus-rolle-und-gruppen-kind`** (`7f8f35d`) — **nicht** von `origin/main`. Dort liegen Spec und ADR, die Task 1 umbenennt; von `main` abgezweigt gäbe es die Datei gar nicht. Der PR trägt damit die Entscheidung und ihre Umsetzung zusammen, so wie PR #224 es für den Verteilerordner getan hat.
- **Commit-Fußzeile:** jeder Commit endet mit `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: ADR von 0041 auf 0043 umnummerieren

**Files:**

- Umbenennen: `docs/decisions/0041-alumnus-ist-eine-rolle.md` → `docs/decisions/0043-alumnus-ist-eine-rolle.md`
- Modify: `docs/decisions/0043-alumnus-ist-eine-rolle.md:1` (Überschrift)
- Modify: `docs/superpowers/specs/2026-09-12-nutzertypen-fundament-design.md:68` (Verweis „Deshalb ADR 0041.")

**Interfaces:**

- Consumes: nichts.
- Produces: die verbindliche ADR-Nummer **0043** für alles Weitere in diesem Plan und in PR B.

Reine Dokumentationsarbeit, kein Test. Sie steht zuerst, weil jeder folgende Commit-Text und jeder Code-Kommentar auf die richtige Nummer verweisen muss.

- [ ] **Step 1: Belegte Nummern gegenprüfen**

```bash
git fetch origin
git ls-tree --name-only origin/main docs/decisions/ | sort | tail -3
gh pr list --state open --json number,headRefName,files --jq '.[] | select(.files[].path | test("docs/decisions/")) | {number, headRefName}'
```

Erwartet: `0041-karussell-coverflow-darstellung.md` ist die höchste Nummer auf `origin/main`; PR #224 (`feat/board-broadcast-folder`) belegt `0042`. Erste freie Nummer ist damit `0043`. Weicht das ab, in allen folgenden Schritten die tatsächlich erste freie Nummer verwenden.

- [ ] **Step 2: Datei umbenennen**

```bash
git mv docs/decisions/0041-alumnus-ist-eine-rolle.md docs/decisions/0043-alumnus-ist-eine-rolle.md
```

- [ ] **Step 3: Überschrift und Verweis ziehen**

In `docs/decisions/0043-alumnus-ist-eine-rolle.md` Zeile 1:

```markdown
# ADR 0043: Alumnus ist eine Rolle, kein Status — und `inactive` entfällt
```

In `docs/superpowers/specs/2026-09-12-nutzertypen-fundament-design.md`, Ende von Abschnitt 2.4:

```markdown
Der Newsletter-Opt-in bleibt davon unberührt. Deshalb ADR 0043.
```

- [ ] **Step 4: Prüfen, dass keine `0041`-Verweise auf die Alumnus-Entscheidung übrig sind**

```bash
grep -rn "ADR 0041\|0041-alumnus" docs
```

Erwartet: keine Treffer (das Karussell-ADR heißt `0041-karussell-coverflow-darstellung.md` und wird von `grep "ADR 0041"` nur getroffen, falls ein Dokument es so zitiert — solche Treffer bleiben unverändert stehen).

- [ ] **Step 5: Commit**

```bash
git add docs/decisions docs/superpowers/specs
git commit -m "$(cat <<'EOF'
docs: ADR zur Alumnus-Rolle auf 0043 umnummerieren

0041 ist auf main durch das Karussell-Coverflow-ADR belegt, 0042 durch
den offenen Verteilerordner-PR. Die Kollision war beim Schreiben der
Spec bekannt; aufgelöst wird sie hier, vor dem ersten Code-Commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `listAlumnusIds` — und der Transfer-Pool schließt Alumni über den Grant aus

**Files:**

- Modify: `modules/members/src/services/list-members.ts` (neuer Export `listAlumnusIds`)
- Modify: `modules/members/src/services/pool.ts:36-40` (zusätzlicher Ausschluss)
- Modify: `modules/members/src/index.ts:48` (Export)
- Test: `modules/members/src/pool.test.ts`

**Interfaces:**

- Consumes: `members` und `memberRoleGrants` aus `modules/members/src/schema.ts`.
- Produces:
  - `listAlumnusIds(db: Db, q?: { readonly groupId?: string }): Promise<string[]>` — die IDs aller Mitglieder mit mindestens einem aktiven (`revoked_at IS NULL`) `alumnus`-Grant. `groupId` filtert über `members.primary_group_id`, **nicht** über den Scope des Grants: gefragt ist „wer in dieser Gruppe ist Alumnus", und der Grant-Scope ist laut ADR 0043 §3 eine Herkunftsangabe, kein Ort.
  - `listGrouplessMembers` liefert unverändert `GrouplessMember[]`, schließt aber zusätzlich jeden mit aktivem Alumnus-Grant aus.

Dies ist die Regressionsstelle aus Spec §2.5: sobald Alumni `active` werden, rutschen sie ohne diese Änderung in den Transfer-Pool zurück. Die Änderung kommt deshalb **vor** der Migration.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `modules/members/src/pool.test.ts` im `beforeEach` nach `mem_5` ein sechstes Fixture ergänzen — ein aktives Mitglied ohne Gruppe, das einen Alumnus-Grant hält:

```typescript
// aktiv und gruppenlos, aber per Grant als Alumnus gekennzeichnet —
// das ist der Zustand, in den die Migration alle Alumni überführt
await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_6', 'usr_6', 'Fritz', 'Fertig', NULL, 'active', now())
    `;
await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
      VALUES ('mrg_6', 'mem_6', 'alumnus', NULL, 'system')
    `;
```

Dazu `["usr_6", "6@example.de"]` in die `createUser`-Schleife aufnehmen und den neuen Test anhängen:

```typescript
it("excludes members carrying an alumnus grant, whatever their status", async () => {
  const pool = await listGrouplessMembers(t.db, FEDERAL);
  expect(pool.map((p) => p.member.id)).not.toContain("mem_6");
});
```

Außerdem die bestehende Erwartung in `"returns groupless applicants and members between groups"` unverändert lassen — `mem_6` darf dort nicht auftauchen.

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm db:up
pnpm exec vitest run modules/members/src/pool.test.ts
```

Erwartet: FAIL. `excludes members carrying an alumnus grant` schlägt fehl (`mem_6` ist enthalten), und `returns groupless applicants and members between groups` schlägt ebenfalls fehl, weil die Liste jetzt `["mem_1","mem_2","mem_6"]` ist.

- [ ] **Step 3: `listAlumnusIds` schreiben**

Ans Ende von `modules/members/src/services/list-members.ts`:

```typescript
/**
 * IDs aller Mitglieder mit aktivem `alumnus`-Grant (ADR 0043). `groupId`
 * filtert über `members.primary_group_id` — gefragt ist „wer in dieser Gruppe
 * ist Alumnus", nicht „wessen Grant trägt diese Gruppe im Scope": der Scope
 * ist laut ADR eine Herkunftsangabe und kann von der heutigen Gruppe
 * abweichen.
 */
export async function listAlumnusIds(
  db: Db,
  q: { readonly groupId?: string } = {},
): Promise<string[]> {
  const conds: SQL[] = [
    eq(memberRoleGrants.role, "alumnus"),
    isNull(memberRoleGrants.revokedAt) as SQL,
  ];
  if (q.groupId) conds.push(eq(members.primaryGroupId, q.groupId));
  const rows = await db
    .selectDistinct({ memberId: memberRoleGrants.memberId })
    .from(memberRoleGrants)
    .innerJoin(members, eq(members.id, memberRoleGrants.memberId))
    .where(and(...conds));
  return rows.map((r) => r.memberId);
}
```

Der Import-Kopf der Datei wird dafür zu:

```typescript
import { and, asc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { members, memberRoleGrants } from "../schema";
import type { Member, MemberStatus } from "../types";
```

- [ ] **Step 4: Den Pool über den Grant filtern**

`modules/members/src/services/pool.ts` — Kopfkommentar und Query anpassen:

```typescript
/**
 * The groupless pool (ADR 0031): everyone in good standing who currently
 * belongs to no group — applicants who were never accepted anywhere, and
 * members between groups. Alumni are excluded; they are not looking for a
 * group. Since ADR 0043 that exclusion runs over the `alumnus` grant, not the
 * member status — an alumnus is an ordinary `active` member with a marking.
 *
 * Federal-board only. A local board gets an empty list rather than an error:
 * the pool is federation-wide oversight, and a group's own queue is the surface
 * a local board acts on.
 */
import { and, asc, inArray, isNull, notInArray } from "drizzle-orm";

import { isFederalBoard } from "../roles";
import { members } from "../schema";
import type { Member } from "../types";

import { row2member } from "./get";
import { listAlumnusIds } from "./list-members";
import type { Actor, Db } from "./status";
```

und im Rumpf von `listGrouplessMembers`, direkt nach dem `isFederalBoard`-Guard:

```typescript
const alumni = await listAlumnusIds(db);

const rows = await db
  .select()
  .from(members)
  .where(
    and(
      isNull(members.primaryGroupId),
      inArray(members.status, ["pending", "active"]),
      ...(alumni.length > 0 ? [notInArray(members.id, alumni)] : []),
    ),
  )
  .orderBy(asc(members.createdAt));
```

- [ ] **Step 5: Export ergänzen**

`modules/members/src/index.ts`, in der Zeile, die `listMembers` exportiert:

```typescript
export { listMembers, listAlumnusIds, type MemberQuery } from "./services/list-members";
```

- [ ] **Step 6: Tests laufen lassen, Grün bestätigen**

```bash
pnpm exec vitest run modules/members/src/pool.test.ts
```

Erwartet: PASS, sechs Tests, keiner `skipped`.

- [ ] **Step 7: Commit**

```bash
git add modules/members/src/services/list-members.ts modules/members/src/services/pool.ts modules/members/src/index.ts modules/members/src/pool.test.ts
git commit -m "$(cat <<'EOF'
feat(members): Alumni über den Grant aus dem Transfer-Pool nehmen

Vorbereitung auf ADR 0043: sobald Alumni den Status `active` tragen,
würde der Pool sie als „sucht eine Gruppe" führen. Der Ausschluss läuft
deshalb ab jetzt über den aktiven alumnus-Grant statt über den Status.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Statistik — der Alumni-Eimer kommt aus den Grants

**Files:**

- Modify: `modules/members/src/services/stats.ts:5-26`
- Modify: `modules/members/src/index.ts:56-61` (Typ-Export)
- Test: `modules/members/src/index.test.ts` (bestehender Test ab Zeile 425)

**Interfaces:**

- Consumes: `listAlumnusIds` aus Task 2 (nur konzeptionell — `stats.ts` zählt selbst, statt eine Liste zu holen und zu messen).
- Produces:
  - `type MemberCounts = { readonly pending: number; readonly active: number; readonly alumnus: number }`
  - `countMembersByStatus(db, q?): Promise<MemberCounts>` — `pending`/`active` aus `members.status`, `alumnus` aus aktiven Grants.
  - `StatusCounts` bleibt als **Alias auf `MemberCounts`** exportiert, damit kein Aufrufer bricht.

`MemberCounts` ist bewusst **nicht** als `Record<MemberStatus, number>` formuliert: der Alumni-Eimer ist ab hier kein Status mehr, und der Typ soll das sagen. Das macht diese Task auch unabhängig von der Typverkleinerung in Task 6.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `modules/members/src/index.test.ts`, im Test `"countMembersByStatus and signupsOverTime aggregate, group-scopable"`, direkt nach `await approveMember(t.db, s1.id, BOARD);` einfügen:

```typescript
await grantRole(t.db, s1.id, "alumnus", BOARD, "grp_a");
```

und nach den bestehenden Erwartungen anhängen:

```typescript
// Der Alumni-Eimer kommt aus den Grants, nicht aus dem Status (ADR 0043):
// s1 bleibt aktiv UND wird als Alumnus gezählt.
expect(counts.active).toBe(1);
expect(counts.alumnus).toBe(1);
expect(scoped.alumnus).toBe(1);
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/members/src/index.test.ts -t "countMembersByStatus"
```

Erwartet: FAIL mit `expected undefined to be 1` auf `counts.alumnus` (der Schlüssel existiert heute nur, weil `ZERO` ihn setzt — dort steht `0`, weil kein Mitglied den _Status_ `alumnus` hat).

- [ ] **Step 3: `stats.ts` umbauen**

Kopf und `countMembersByStatus` in `modules/members/src/services/stats.ts` ersetzen:

```typescript
import { and, eq, gte, isNull, sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { members, memberRoleGrants } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Die Zahlen der Vorstands-Übersicht. `pending`/`active` sind Kontostände aus
 * `members.status`; `alumnus` ist seit ADR 0043 kein Status mehr, sondern ein
 * Grant — der Eimer bleibt trotzdem, sonst zählte der Bundesvorstand ab dem
 * Merge stillschweigend etwas anderes als vorher. Ein Alumnus zählt in BEIDEN
 * Eimern: er ist ein aktives Mitglied mit einer Kennzeichnung.
 */
export type MemberCounts = {
  readonly pending: number;
  readonly active: number;
  readonly alumnus: number;
};

/** @deprecated Name aus der Zeit, als alle Eimer Status waren. Alias auf MemberCounts. */
export type StatusCounts = MemberCounts;

export type SignupPoint = { readonly day: string; readonly count: number };

export async function countMembersByStatus(
  db: Db,
  q: { readonly groupId?: string } = {},
): Promise<MemberCounts> {
  const scope = q.groupId ? eq(members.primaryGroupId, q.groupId) : undefined;

  const statusRows = await db
    .select({ status: members.status, n: sql<number>`count(*)::int` })
    .from(members)
    .where(scope)
    .groupBy(members.status);

  const alumnusConds: SQL[] = [
    eq(memberRoleGrants.role, "alumnus"),
    isNull(memberRoleGrants.revokedAt) as SQL,
  ];
  if (q.groupId) alumnusConds.push(eq(members.primaryGroupId, q.groupId));
  const alumnusRows = await db
    .select({ n: sql<number>`count(distinct ${memberRoleGrants.memberId})::int` })
    .from(memberRoleGrants)
    .innerJoin(members, eq(members.id, memberRoleGrants.memberId))
    .where(and(...alumnusConds));

  let pending = 0;
  let active = 0;
  for (const r of statusRows) {
    if (r.status === "pending") pending = r.n;
    if (r.status === "active") active = r.n;
  }
  return { pending, active, alumnus: alumnusRows[0]?.n ?? 0 };
}
```

`signupsOverTime` bleibt unverändert. Der Import von `MemberStatus` entfällt ersatzlos.

- [ ] **Step 4: Export ergänzen**

`modules/members/src/index.ts`:

```typescript
export {
  countMembersByStatus,
  signupsOverTime,
  type MemberCounts,
  type StatusCounts,
  type SignupPoint,
} from "./services/stats";
```

- [ ] **Step 5: Tests laufen lassen, Grün bestätigen**

```bash
pnpm exec vitest run modules/members/src/index.test.ts -t "countMembersByStatus"
pnpm --filter @bdas/members typecheck
```

Erwartet: PASS und ein sauberer Typecheck.

- [ ] **Step 6: Commit**

```bash
git add modules/members/src/services/stats.ts modules/members/src/index.ts modules/members/src/index.test.ts
git commit -m "$(cat <<'EOF'
feat(members): Alumni-Zahl aus den Grants statt aus dem Status

Vorbereitung auf ADR 0043. Der Eimer bleibt in der Vorstands-Übersicht
erhalten, seine Quelle wechselt. `StatusCounts` bleibt als Alias
bestehen, damit kein Aufrufer bricht.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Die Kennzeichnung in Mitgliederliste und Konto kommt aus dem Grant

**Files:**

- Modify: `apps/web/app/(board)/_components/MembersTable.tsx:9-21,36,50-57,109-116,138-141`
- Modify: `apps/web/app/(board)/federal/members/page.tsx:16-30`
- Modify: `apps/web/app/(board)/gruppe/[slug]/members/page.tsx`
- Modify: `apps/web/app/account/view-model.ts:33`
- Test: `apps/web/app/account/view-model.test.ts`

**Interfaces:**

- Consumes: `listAlumnusIds` aus Task 2.
- Produces: `MembersTable` nimmt eine zusätzliche Pflicht-Prop `alumnusIds: string[]`. Der Filter „Alumni" und die Status-Spalte lesen daraus statt aus `m.status`.

Der Status-Typ wird hier noch **nicht** verkleinert — `STATUS_LABEL` behält vorerst alle vier Schlüssel. Diese Task macht nur die Herkunft der Kennzeichnung richtig; der Typ folgt in Task 6.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`apps/web/app/account/view-model.test.ts` — neuen Test anhängen:

```typescript
it("zeigt den Alumnus-Grant als Chip (ADR 0043)", () => {
  const chips = roleChips([{ role: "alumnus", groupId: "grp_a" }]);
  expect(chips.map((c) => c.label)).toEqual(["Alumnus"]);
});

it("zeigt den impliziten member-Grant weiterhin nicht", () => {
  expect(roleChips([{ role: "member", groupId: null }])).toEqual([]);
});
```

Falls `roleChips` in dieser Datei noch nicht importiert ist, den Import ergänzen:

```typescript
import { buildIdentityRows, layoutMode, roleChips } from "./view-model";
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run apps/web/app/account/view-model.test.ts
```

Erwartet: FAIL — `zeigt den Alumnus-Grant als Chip` bekommt `[]`, weil `alumnus` in `IMPLICIT_ROLES` steht.

- [ ] **Step 3: `alumnus` aus den impliziten Rollen nehmen**

`apps/web/app/account/view-model.ts`:

```typescript
/** Rollen, die jedes aktive Mitglied ohnehin hat. Ein Chip „Mitglied" sagt
 *  niemandem etwas Neues. `alumnus` steht seit ADR 0043 NICHT mehr hier: die
 *  Rolle ist ab dort eine ausdrücklich vergebene Kennzeichnung und damit die
 *  einzige Stelle, an der ein Mitglied sie über sich selbst erfährt. */
const IMPLICIT_ROLES: ReadonlySet<Role> = new Set<Role>(["member"]);
```

- [ ] **Step 4: Test laufen lassen, Grün bestätigen**

```bash
pnpm exec vitest run apps/web/app/account/view-model.test.ts
```

Erwartet: PASS.

- [ ] **Step 5: `MembersTable` auf die Grant-Liste umstellen**

In `apps/web/app/(board)/_components/MembersTable.tsx`:

Den Filter-Schlüssel von `MemberStatus` entkoppeln (er ist ab jetzt „Status **oder** Kennzeichnung"):

```typescript
type MemberFilter = "all" | "active" | "alumnus";

/** No `pending` filter: an applicant is no longer a member row awaiting a
 *  verdict but a request on the group's Bewerbungen queue (ADR 0031).
 *  „Alumni" ist kein Status mehr, sondern die Grant-Kennzeichnung (ADR 0043). */
const FILTERS: ReadonlyArray<{ key: MemberFilter; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Aktiv" },
  { key: "alumnus", label: "Alumni" },
];
```

Die Prop aufnehmen und den Zustand umtypen:

```typescript
export function MembersTable({
  members,
  groupNames,
  alumnusIds,
  openChanges,
  revalidatePath,
  rejectionCategories,
}: {
  members: Member[];
  groupNames: Record<string, string>;
  /** IDs mit aktivem alumnus-Grant (ADR 0043) — die Kennzeichnung kommt aus
   *  den Grants, nicht aus dem Status. */
  alumnusIds: string[];
  openChanges: OpenGroupChange[];
  revalidatePath: string;
  rejectionCategories: ReadonlyArray<{ key: RejectionCategory; label: string }>;
}) {
  const [filter, setFilter] = useState<MemberFilter>("all");
```

Ein Set daraus bauen und die Zeilenfilterung darauf stützen:

```typescript
const isAlumnus = useMemo(() => new Set(alumnusIds), [alumnusIds]);

const rows = useMemo(
  () =>
    members.filter(
      (m) =>
        (filter === "all" || (filter === "alumnus" ? isAlumnus.has(m.id) : m.status === filter)) &&
        (q.trim() === "" || `${m.firstName} ${m.lastName}`.toLowerCase().includes(q.toLowerCase())),
    ),
  [members, filter, q, isAlumnus],
);
```

In der Status-Zelle der Tabelle die Kennzeichnung als zweiten Chip hinter den Status setzen:

```tsx
<td className="p-3">
  <span
    className={`rounded-bdas-pill px-2 py-0.5 text-xs font-semibold ${m.status === "pending" ? "bg-bdas-surface-hover text-bdas-red" : "bg-bdas-surface-hover text-bdas-ink-body"}`}
  >
    {STATUS_LABEL[m.status]}
  </span>
  {isAlumnus.has(m.id) && (
    <span className="ml-1 rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-ink-muted">
      Alumnus
    </span>
  )}
</td>
```

Und in der Detail-Spalte rechts eine eigene Zeile ergänzen, direkt nach der `Status`-Zeile:

```tsx
<div className="flex justify-between border-b border-bdas-soft pb-1">
  <dt className="text-bdas-ink-muted">Alumnus</dt>
  <dd className="text-bdas-ink-body">{isAlumnus.has(selected.id) ? "Ja" : "Nein"}</dd>
</div>
```

- [ ] **Step 6: Beide aufrufenden Seiten die Liste mitliefern lassen**

`apps/web/app/(board)/federal/members/page.tsx`:

```typescript
import { listAlumnusIds, listMembers, listOpenGroupChanges } from "@bdas/members";
```

```typescript
const [members, groups, openChanges, alumnusIds] = await Promise.all([
  listMembers(db, {}),
  listGroups(db),
  listOpenGroupChanges(db, { userId: me.user.id, grants: me.grants }),
  listAlumnusIds(db),
]);
```

```tsx
<MembersTable
  members={members}
  groupNames={groupNames}
  alumnusIds={alumnusIds}
  openChanges={openChanges}
  revalidatePath="/federal/members"
  rejectionCategories={REJECTION_CATEGORIES}
/>
```

`apps/web/app/(board)/gruppe/[slug]/members/page.tsx` — dieselben drei Änderungen, hier gruppengescoped:

```typescript
import { listAlumnusIds, listMembers, listOpenGroupChanges } from "@bdas/members";
```

```typescript
const [members, groups, openChanges, alumnusIds] = await Promise.all([
  listMembers(db, { groupId }),
  listGroups(db),
  listOpenGroupChanges(db, actor),
  listAlumnusIds(db, { groupId }),
]);
```

```tsx
<MembersTable
  members={members}
  groupNames={groupNames}
  alumnusIds={alumnusIds}
  openChanges={openChanges}
  revalidatePath={`/gruppe/${params.slug}/members`}
  rejectionCategories={REJECTION_CATEGORIES}
/>
```

- [ ] **Step 7: Typecheck und Build-Prüfung**

```bash
pnpm --filter @bdas/web typecheck
pnpm exec vitest run apps/web/app/account/view-model.test.ts
```

Erwartet: beides sauber. Meldet der Typecheck eine weitere Stelle, die `MembersTable` ohne `alumnusIds` rendert, diese Stelle genauso nachziehen.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/(board)/_components/MembersTable.tsx" "apps/web/app/(board)/federal/members/page.tsx" "apps/web/app/(board)/gruppe/[slug]/members/page.tsx" apps/web/app/account/view-model.ts apps/web/app/account/view-model.test.ts
git commit -m "$(cat <<'EOF'
feat(web): Alumnus-Kennzeichnung aus dem Grant lesen

Mitgliederliste und Kontoseite zeigen Alumni ab jetzt über den aktiven
alumnus-Grant. Der Status bleibt vorerst unangetastet; er verschwindet
mit der Migration.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Den Lead der eigenen Gruppe `alumnus` vergeben lassen

**Files:**

- Modify: `modules/members/src/services/roles.ts:28-53` (`requireCanGrant`)
- Test: `modules/members/src/index.test.ts`

**Interfaces:**

- Consumes: `canGrantLocalRoles` aus `modules/members/src/roles.ts` (unverändert).
- Produces: `grantRole`/`revokeRole` akzeptieren `alumnus` vom Lead der Zielgruppe. Ungescoped (`groupId === null`) bleibt es beim Bundesvorstand, weil `canManageGroup` für `null` nur `federal_board` durchlässt.

`requireValidScope` wird **nicht** angefasst: `alumnus` steht in keiner der beiden Listen und ist damit bereits optional gescoped.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `modules/members/src/index.test.ts` einen neuen Test anlegen, gebaut nach dem Muster von `"a local_board_lead grants page_editor within its group, but not across groups or higher roles"` (ab Zeile 456):

```typescript
it("a lead marks members of its own group as alumnus, but not elsewhere (ADR 0043)", async () => {
  await createGroup("grp_a", "aachen");
  await createGroup("grp_b", "bonn");
  await createUser("usr_lead_al", "lead_al@example.de");
  await createUser("usr_mem_al", "mem_al@example.de");

  const lead = await createProfile(t.db, {
    userId: "usr_lead_al",
    firstName: "Lea",
    lastName: "Lead",
    primaryGroupId: "grp_a",
  });
  await grantRole(t.db, lead.id, "local_board_lead", BOARD, "grp_a");
  const LEAD_A = {
    userId: "usr_lead_al",
    grants: [{ role: "local_board_lead", groupId: "grp_a" }] as ReadonlyArray<Grant>,
  };

  const m = await createProfile(t.db, {
    userId: "usr_mem_al",
    firstName: "Max",
    lastName: "Mitglied",
    primaryGroupId: "grp_a",
  });

  // im eigenen Scope: erlaubt
  await grantRole(t.db, m.id, "alumnus", LEAD_A, "grp_a");
  const active = await t.client`
      SELECT id FROM member_role_grants
       WHERE member_id = ${m.id} AND role = 'alumnus' AND revoked_at IS NULL
    `;
  expect(active).toHaveLength(1);

  // fremder Scope: verboten
  await expect(grantRole(t.db, m.id, "alumnus", LEAD_A, "grp_b")).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  // ungescoped: nur der Bundesvorstand
  await expect(grantRole(t.db, m.id, "alumnus", LEAD_A, null)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await grantRole(t.db, m.id, "alumnus", BOARD, null);

  // und der Lead darf die Markierung im eigenen Scope auch wieder entziehen
  await revokeRole(t.db, m.id, "alumnus", LEAD_A, "grp_a");
  const left = await t.client`
      SELECT group_id FROM member_role_grants
       WHERE member_id = ${m.id} AND role = 'alumnus' AND revoked_at IS NULL
    `;
  expect(left).toHaveLength(1);
  expect(left[0]!["group_id"]).toBeNull();
});
```

`Grant`, `revokeRole` und `BOARD` sind in dieser Datei bereits vorhanden; fehlt ein Import, ihn ergänzen.

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/members/src/index.test.ts -t "marks members of its own group as alumnus"
```

Erwartet: FAIL beim ersten `grantRole(..., "alumnus", LEAD_A, "grp_a")` mit `FORBIDDEN` — `alumnus` fällt heute in den „everything else → federal_board only"-Zweig.

- [ ] **Step 3: `requireCanGrant` erweitern**

`modules/members/src/services/roles.ts`:

```typescript
/**
 * Who may grant/revoke (ADR 0013, extended by ADR 0026, the local role
 * redesign, and ADR 0043):
 *  - `event_organizer`, `page_editor`, `file_manager`, `blogger` → federal_board OR the group's Lead
 *  - `alumnus`                                                   → federal_board OR the group's Lead
 *    (eine Kennzeichnung, keine Befugnis: der Lead kennt seine Ehemaligen,
 *     der Bundesvorstand vergibt sie ungescoped bei der Registrierung)
 *  - everything else                                            → federal_board only
 *    (appointing leads and federal_board stays central).
 * `role` must already be validated to a known Role and `groupId` to its scope.
 */
function requireCanGrant(actor: Actor, role: Role, groupId: string | null): void {
  if (
    role === "event_organizer" ||
    role === "page_editor" ||
    role === "file_manager" ||
    role === "blogger" ||
    role === "alumnus"
  ) {
    if (canGrantLocalRoles(actor.grants, groupId)) return;
    throw new ForbiddenError(
      "Nur der Bundesvorstand oder der Lead dieser Gruppe darf diese Rolle vergeben.",
    );
  }
  if (!isFederalBoard(actor.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand darf diese Rolle vergeben.");
  }
}
```

Zusätzlich den Modul-Kopfkommentar (Zeilen 1–9) um `alumnus` ergänzen, damit die Aufzählung dort nicht unvollständig zurückbleibt.

- [ ] **Step 4: Test laufen lassen, Grün bestätigen**

```bash
pnpm exec vitest run modules/members/src/index.test.ts -t "marks members of its own group as alumnus"
pnpm exec vitest run modules/members/src/index.test.ts -t "grantRole/revokeRole"
```

Erwartet: beide PASS — der zweite belegt, dass die bestehende Autorisierung für alle anderen Rollen unverändert blieb.

- [ ] **Step 5: Commit**

```bash
git add modules/members/src/services/roles.ts modules/members/src/index.test.ts
git commit -m "$(cat <<'EOF'
feat(members): Lead darf alumnus im eigenen Scope vergeben (ADR 0043)

Eine Zeile in requireCanGrant. requireValidScope bleibt unangetastet —
alumnus war bereits optional gescoped. Ungescoped bleibt es beim
Bundesvorstand, weil canManageGroup für groupId null nur ihn durchlässt.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Migration 0011 — und `MemberStatus` schrumpft auf `pending | active`

**Files:**

- Create: `modules/members/migrations/0011_alumnus_is_a_role.sql`
- Create: `modules/members/src/alumnus-role-migration.test.ts`
- Modify: `modules/members/src/test-db.ts:16-30` (Migrationsliste)
- Modify: `modules/members/src/types.ts:3`
- Modify: `modules/members/src/roles.ts:24,44-46,112-117`
- Modify: `modules/members/src/services/group-change.ts:178-181,360-363`
- Modify: `apps/web/app/_blog/access.ts:46-55`
- Modify: `apps/web/app/(board)/_components/MembersTable.tsx:9-14`
- Modify: `apps/web/app/account/view-model.ts:24-29`
- Modify: `apps/web/app/account/page.tsx:32-37`
- Modify: `apps/web/app/profil/page.tsx:24-25` (nur Kommentar)
- Modify: `modules/blog/src/services/comments.ts:127-131`, `modules/blog/src/services/manage.ts:5` (nur Kommentare)
- Modify: `apps/web/app/_blog/CommentsSection.tsx:16` (nur Kommentar)
- Test (anzupassen): `modules/members/src/pool.test.ts`, `modules/members/src/application-migration.test.ts`, `modules/members/src/group-change.test.ts`, `modules/members/src/index.test.ts`, `modules/files/src/permissions.test.ts`, `apps/web/app/_blog/access.test.ts`, `apps/web/app/account/view-model.test.ts`

**Interfaces:**

- Consumes: alles aus den Tasks 2–5.
- Produces:
  - `type MemberStatus = "pending" | "active"`
  - DB-Constraint `members_status_check CHECK (status IN ('pending','active'))`
  - `effectiveGrants` leitet keinen Grant mehr aus dem Status ab außer `member` für `active`.
  - `canTransition` kennt genau eine Kante: `pending → active`.

Migration und Typ sind dieselbe Entscheidung, zweimal ausgedrückt — sie gehören in einen Commit. Alles davor ist bereits grün, sodass diese Task nur noch aufräumt.

- [ ] **Step 1: Den fehlschlagenden Migrationstest schreiben**

`modules/members/src/alumnus-role-migration.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

/**
 * Die Migration läuft bereits in setupMembersDb, ein hier eingefügtes Fixture
 * ist also schon migriert. Um die Migration selbst zu prüfen, wird der von ihr
 * gesetzte CHECK kurz gelöst, der Vor-Migrations-Zustand eingefügt und der
 * Datenschritt erneut ausgeführt — er ist durch den NOT-EXISTS-Guard und
 * ON CONFLICT DO NOTHING idempotent. Dass der CHECK danach wieder gesetzt
 * werden KANN, ist selbst die schärfste Zusicherung: er greift nur, wenn der
 * Datenschritt jede Zeile sauber überführt hat.
 */
describeIfDb("0011 alumnus is a role — Datenmigration", () => {
  let t: TestDb;
  let hadStatusCheck = false;

  beforeEach(async () => {
    t = await setupMembersDb();
    hadStatusCheck =
      (await t.client`SELECT 1 FROM pg_constraint WHERE conname = 'members_status_check'`)
        .length === 1;

    await t.client.unsafe(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check`);
    await createGroup(t, "grp_a", "aachen");
    for (const [id, email] of [
      ["usr_al", "al@example.de"],
      ["usr_in", "in@example.de"],
      ["usr_ac", "ac@example.de"],
      ["usr_pe", "pe@example.de"],
      ["usr_dp", "dp@example.de"],
    ]) {
      await createUser(t, id!, email!);
    }
    // Alumnus mit Gruppe
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_al', 'usr_al', 'Alma', 'Alumna', 'grp_a', 'alumnus', now())
    `;
    // Inaktives Ex-Mitglied ohne Gruppe (0008 hat die Nie-Mitglieder bereits befreit)
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_in', 'usr_in', 'Ina', 'Inaktiv', NULL, 'inactive', now())
    `;
    // gewöhnliches aktives Mitglied
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_ac', 'usr_ac', 'Ada', 'Aktiv', 'grp_a', 'active', now())
    `;
    // Bewerberin
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_pe', 'usr_pe', 'Pia', 'Pending', NULL, 'pending')
    `;
    // Alumnus, der den Grant BEREITS hat — darf keinen zweiten bekommen
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_dp', 'usr_dp', 'Doro', 'Doppelt', 'grp_a', 'alumnus', now())
    `;
    await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
      VALUES ('mrg_dp', 'mem_dp', 'alumnus', 'grp_a', 'system')
    `;

    await runDataSteps(t);
    await t.client.unsafe(
      `ALTER TABLE members ADD CONSTRAINT members_status_check CHECK (status IN ('pending', 'active'))`,
    );
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("die Migration setzt einen CHECK auf members.status", () => {
    expect(hadStatusCheck).toBe(true);
  });

  it("macht aus einem Alumnus ein aktives Mitglied mit Grant", async () => {
    const [m] = await t.client`SELECT status FROM members WHERE id = 'mem_al'`;
    expect(m!["status"]).toBe("active");

    const grants = await t.client`
      SELECT group_id FROM member_role_grants
       WHERE member_id = 'mem_al' AND role = 'alumnus' AND revoked_at IS NULL
    `;
    expect(grants).toHaveLength(1);
    expect(grants[0]!["group_id"]).toBe("grp_a");
  });

  it("behandelt ein inaktives Ex-Mitglied genauso — ohne Gruppe im Scope", async () => {
    const [m] = await t.client`SELECT status FROM members WHERE id = 'mem_in'`;
    expect(m!["status"]).toBe("active");

    const grants = await t.client`
      SELECT group_id FROM member_role_grants
       WHERE member_id = 'mem_in' AND role = 'alumnus' AND revoked_at IS NULL
    `;
    expect(grants).toHaveLength(1);
    expect(grants[0]!["group_id"]).toBeNull();
  });

  it("lässt aktive Mitglieder und Bewerberinnen unberührt", async () => {
    const [a] = await t.client`SELECT status FROM members WHERE id = 'mem_ac'`;
    expect(a!["status"]).toBe("active");
    const [p] = await t.client`SELECT status FROM members WHERE id = 'mem_pe'`;
    expect(p!["status"]).toBe("pending");
    const grants = await t.client`
      SELECT id FROM member_role_grants WHERE member_id IN ('mem_ac', 'mem_pe')
    `;
    expect(grants).toHaveLength(0);
  });

  it("vergibt keinen zweiten Grant an jemanden, der ihn schon hat", async () => {
    const grants = await t.client`
      SELECT id FROM member_role_grants
       WHERE member_id = 'mem_dp' AND role = 'alumnus' AND revoked_at IS NULL
    `;
    expect(grants).toHaveLength(1);
  });

  it("ist idempotent — ein zweiter Lauf ändert nichts", async () => {
    await runDataSteps(t);
    const grants = await t.client`
      SELECT member_id FROM member_role_grants WHERE role = 'alumnus' AND revoked_at IS NULL
    `;
    expect(grants).toHaveLength(3);
  });

  it("weist nach der Migration jeden anderen Status ab", async () => {
    await createUser(t, "usr_bad", "bad@example.de");
    await expect(
      t.client`
        INSERT INTO members (id, user_id, first_name, last_name, status)
        VALUES ('mem_bad', 'usr_bad', 'Bad', 'Value', 'alumnus')
      `,
    ).rejects.toThrow(/members_status_check/);
  });
});

/** Schritt 1 der Migration, gegen das Fixture wiederholt. */
async function runDataSteps(t: TestDb): Promise<void> {
  await t.client.unsafe(`
    INSERT INTO member_role_grants (id, member_id, role, group_id, granted_at, granted_by)
    SELECT 'mrg_alum_' || m.id, m.id, 'alumnus', m.primary_group_id, now(), 'system'
      FROM members m
     WHERE m.status IN ('alumnus', 'inactive')
       AND NOT EXISTS (
             SELECT 1 FROM member_role_grants g
              WHERE g.member_id = m.id AND g.role = 'alumnus' AND g.revoked_at IS NULL
           )
    ON CONFLICT (id) DO NOTHING;

    UPDATE members
       SET status = 'active', updated_at = now()
     WHERE status IN ('alumnus', 'inactive');
  `);
}
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/members/src/alumnus-role-migration.test.ts
```

Erwartet: FAIL. `die Migration setzt einen CHECK auf members.status` bekommt `false`, und `weist nach der Migration jeden anderen Status ab` scheitert nicht am erwarteten Constraint-Namen, sondern daran, dass das INSERT durchgeht (der Constraint im `beforeEach` wurde ja per Hand gesetzt — er greift, aber der erste Test zeigt, dass die Migration ihn nicht liefert).

- [ ] **Step 3: Die Migration schreiben**

`modules/members/migrations/0011_alumnus_is_a_role.sql`:

```sql
-- Members module — Alumnus ist eine Rolle, kein Status (ADR 0043).
--
-- `alumnus` existierte doppelt: als MemberStatus (aus dem effectiveGrants
-- einen ungescopten Grant ableitete) und als regulär vergebbare Role in
-- member_role_grants. Die Dublette wird hier aufgelöst — die Rolle bleibt,
-- der Status verschwindet.
--
-- `inactive` fällt mit: Migration 0008 (ADR 0031) hat den Wert geleert, indem
-- sie abgelehnte Bewerber*innen nach `pending` zurücksetzte. Was hier noch mit
-- `inactive` dasteht, ist per Definition ein ehemaliges Mitglied mit
-- gestempeltem joined_at — für das ist Alumnus die richtige Einordnung.

-- Schritt 1: verbliebene Alumni und Inaktive nach active, mit Grant-Zeile.
-- Der NOT-EXISTS-Guard und ON CONFLICT machen den Schritt idempotent: der
-- Guard fängt den Normalfall, ON CONFLICT den Sonderfall, dass jemand einen
-- bereits widerrufenen 'mrg_alum_'-Grant aus einem früheren Lauf trägt.
INSERT INTO member_role_grants (id, member_id, role, group_id, granted_at, granted_by)
SELECT 'mrg_alum_' || m.id, m.id, 'alumnus', m.primary_group_id, now(), 'system'
  FROM members m
 WHERE m.status IN ('alumnus', 'inactive')
   AND NOT EXISTS (
         SELECT 1 FROM member_role_grants g
          WHERE g.member_id = m.id AND g.role = 'alumnus' AND g.revoked_at IS NULL
       )
ON CONFLICT (id) DO NOTHING;

UPDATE members
   SET status = 'active', updated_at = now()
 WHERE status IN ('alumnus', 'inactive');

-- Schritt 2: members.status bekommt erstmals einen CHECK. Bis hierher lebten
-- die zulässigen Werte ausschließlich in TypeScript (0001_init.sql: reines
-- `text NOT NULL DEFAULT 'pending'`). Dass der Constraint jetzt greift, ist
-- zugleich die Zusicherung, dass Schritt 1 jede Zeile erwischt hat.
ALTER TABLE members
  ADD CONSTRAINT members_status_check
  CHECK (status IN ('pending', 'active'));
```

- [ ] **Step 4: Migration in die Testliste aufnehmen**

`modules/members/src/test-db.ts`, ans Ende von `MEMBERS_TEST_MIGRATIONS`:

```typescript
  ["..", "migrations", "0011_alumnus_is_a_role.sql"],
```

- [ ] **Step 5: Migrationstest laufen lassen, Grün bestätigen**

```bash
pnpm exec vitest run modules/members/src/alumnus-role-migration.test.ts
```

Erwartet: PASS, sieben Tests.

- [ ] **Step 6: Die Fixtures der bestehenden Integrationstests constraint-tauglich machen**

Drei Testdateien fügen heute Zeilen mit den entfallenen Statuswerten ein und werden durch den neuen CHECK rot.

`modules/members/src/application-migration.test.ts` — die Datei stellt absichtlich den Zustand **vor** 0008 her. Im `beforeEach` direkt nach `t = await setupMembersDb();`:

```typescript
// Diese Datei stellt den Zustand vor Migration 0008 her, in dem `inactive`
// noch existierte. Der CHECK aus 0011 muss dafür weichen und wird nach dem
// Datenschritt nicht wieder gesetzt — 0008 kennt ihn nicht.
await t.client.unsafe(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check`);
```

`modules/members/src/pool.test.ts` — die Fixtures `mem_4` (`inactive`) und `mem_5` (`alumnus`) beschreiben Zustände, die es nicht mehr gibt. `mem_4` ersatzlos löschen samt seines Tests `"excludes deactivated people — they are not looking"`; `mem_5` auf `active` plus Grant umstellen und seinen Test entsprechend umbenennen:

```typescript
// Alumna: aktiv mit Grant — der einzige Zustand, den es nach ADR 0043 gibt
await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_5', 'usr_5', 'Eva', 'Alumna', NULL, 'active', now())
    `;
await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
      VALUES ('mrg_5', 'mem_5', 'alumnus', NULL, 'system')
    `;
```

`usr_4` bleibt in der `createUser`-Schleife stehen oder entfällt — beides ist in Ordnung, solange kein `members`-Fixture mehr auf ihn zeigt. Das in Task 2 ergänzte `mem_6` bleibt unverändert und deckt denselben Fall doppelt ab; eines von beiden kann entfallen.

`modules/members/src/group-change.test.ts` — drei Tests prüfen den deaktivierten Zustand, den es nicht mehr gibt:

- `"refuses a transfer for an inactive member"` (ab Zeile 263) — ersatzlos löschen.
- `"refuses to decide a request whose member was deactivated"` (ab Zeile 810) — ersatzlos löschen.
- `"tells an unauthorized actor they may not decide, not that the member was deactivated"` (ab Zeile 826) — dieser Test pinnt die **Reihenfolge** der beiden Prüfungen (Autorisierung vor Zustandsoffenlegung) und ist wertvoll; sein Auslöser verschwindet aber zusammen mit dem Conflict-Zweig. Ebenfalls löschen und den Verlust im Commit-Text nennen.

- [ ] **Step 7: Den Typ verkleinern**

`modules/members/src/types.ts:3`:

```typescript
/** Kontolebenszyklus, nichts weiter: wartet auf Aufnahme, oder aufgenommen.
 *  Alles Übrige ist Rolle (ADR 0043) — `alumnus` lebt in member_role_grants,
 *  `inactive` gibt es seit ADR 0031 faktisch und seit 0011 auch formal nicht
 *  mehr. */
export type MemberStatus = "pending" | "active";
```

`modules/members/src/roles.ts` — der Kommentar über `effectiveGrants` (Zeile 24) und der Rumpf:

```typescript
 *   - status-implied: active → member (unscoped). `alumnus` ist seit ADR 0043
 *     kein Status mehr, sondern ein regulärer Grant aus member_role_grants.
```

```typescript
if (member && member.status === "active") add("member", null);
```

und die Übergangstabelle:

```typescript
/** Die einzige verbliebene Kante: eine Bewerbung wird angenommen. Austritt
 *  läuft über primary_group_id (ADR 0022), Ablehnung über
 *  member_group_change_requests (ADR 0031), Alumnus über einen Grant
 *  (ADR 0043) — keiner davon ist ein Statuswechsel. */
const TRANSITIONS: Record<MemberStatus, ReadonlySet<MemberStatus>> = {
  pending: new Set<MemberStatus>(["active"]),
  active: new Set<MemberStatus>([]),
};
```

Außerdem den Kommentar in `canDecideJoinRequest` (Zeile 94) korrigieren: „accept (→ active) or reject (→ inactive)" stimmt seit ADR 0031 nicht mehr und jetzt erst recht nicht:

```typescript
 * A join decision — accept (→ active), or reject, which leaves the member
 * `pending` and records the refusal on the request (ADR 0031) — belongs to the
```

Dazu die beiden Unit-Tests aus Spec §2.8 in `modules/members/src/roles.unit.test.ts` anlegen. Die Datei prüft heute nur die Prädikate; `effectiveGrants` und `canTransition` haben dort noch keinen Block:

```typescript
describe("effectiveGrants", () => {
  const member = (status: MemberStatus): Member => ({
    id: "mem_1",
    userId: "usr_1",
    firstName: "A",
    lastName: "B",
    primaryGroupId: "grp_a",
    status,
    joinedAt: new Date("2024-01-01"),
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  });

  it("leitet aus dem Status nur noch `member` ab, nie `alumnus` (ADR 0043)", () => {
    const grants = effectiveGrants([], member("active"), []);
    expect(grants).toEqual([{ role: "member", groupId: null }]);
  });

  it("gibt einer Bewerberin gar keinen impliziten Grant", () => {
    expect(effectiveGrants([], member("pending"), [])).toEqual([]);
  });

  it("reicht einen alumnus-Grant aus der Datenbank samt Scope durch", () => {
    const grants = effectiveGrants([], member("active"), [{ role: "alumnus", groupId: "grp_a" }]);
    expect(grants).toEqual([
      { role: "alumnus", groupId: "grp_a" },
      { role: "member", groupId: null },
    ]);
  });
});

describe("canTransition", () => {
  it("kennt genau eine Kante: pending → active", () => {
    expect(canTransition("pending", "active")).toBe(true);
    expect(canTransition("active", "pending")).toBe(false);
  });
});
```

Der Importkopf der Datei wird dafür zu:

```typescript
import type { Grant, Member, MemberStatus } from "./types";

import {
  canDecideJoinRequest,
  canEditGroupPage,
  canGrantLocalRoles,
  canManageGroup,
  canTransition,
  effectiveGrants,
  isRole,
} from "./roles";
```

Die Reihenfolge in `effectiveGrants` ist relevant: JWT-Rollen, dann DB-Grants, dann status-impliziert — der Erwartungswert im dritten Test spiegelt genau das.

- [ ] **Step 8: Die toten Wächter in `group-change.ts` entfernen**

Beide Blöcke sind unter dem neuen Typ unerreichbar, weil der CHECK jetzt garantiert, was sie prüfen.

In `changePrimaryGroup` (ab Zeile 178) ersetzen durch — nichts; die drei Zeilen samt der lokalen Konstante `status` entfallen. Falls `status` weiter unten verwendet wird, die Verwendung auf `row.status` umstellen.

In `decideGroupChange` (ab Zeile 360) entfallen `memberStatus` und der `ConflictError`-Block ebenso. Der Kommentar unmittelbar darüber („over the destination group cannot learn a third party's member state") bezog sich auf diese Offenlegung und wird mit entfernt. Der `SELECT` darüber holt `status` nur noch, falls `joinedAt` weiter gebraucht wird — die Spalte `status` aus der Projektion streichen, wenn sie danach niemand mehr liest. Der Typimport `MemberStatus` in dieser Datei entfällt damit ebenfalls.

- [ ] **Step 9: Die Record-Maps und Kommentare in der App nachziehen**

`apps/web/app/(board)/_components/MembersTable.tsx`:

```typescript
const STATUS_LABEL: Record<MemberStatus, string> = {
  pending: "Ausstehend",
  active: "Aktiv",
};
```

`apps/web/app/account/view-model.ts`:

```typescript
const STATUS_TEXT: Record<MemberStatus, string> = {
  pending: "Bewerbung eingereicht",
  active: "Aktives Mitglied",
};
```

`apps/web/app/account/page.tsx`:

```typescript
const STATUS_LABEL: Record<string, string> = {
  pending: "Warte auf Freigabe durch den lokalen Vorstand.",
  active: "Aktives Mitglied.",
};
```

`apps/web/app/_blog/access.ts` — `canComment` verkürzt sich, der Kommentar zieht mit:

```typescript
/**
 * Eligible to COMMENT (read or write): an active member. Pending accounts
 * (not yet confirmed by a Lead) cannot (ADR 0030's original rule, preserved
 * for comments by ADR 0037 even though blog *authoring* eligibility has since
 * narrowed — see that ADR's "Comments are unaffected" section). Seit ADR 0043
 * sind Alumni aktive Mitglieder und damit ohne Sonderfall eingeschlossen.
 */
export function canComment(me: CurrentMember | null): boolean {
  return me !== null && me.member?.status === "active";
}
```

Reine Kommentarkorrekturen, gleicher Commit: `apps/web/app/profil/page.tsx:24` („Active/inactive/alumni" → „Aktive Mitglieder"), `apps/web/app/_blog/CommentsSection.tsx:16`, `modules/blog/src/services/comments.ts:127-131`, `modules/blog/src/services/manage.ts:5`.

- [ ] **Step 10: Die restlichen Tests nachziehen**

`modules/members/src/index.test.ts`:

- `"federal_board keeps authority over non-join transitions of a boarded group (ADR 0021)"` (Zeile 278) benutzt `transitionStatus(..., "alumnus", ...)`, um zu zeigen, dass Föderal auch bei besetztem lokalem Vorstand noch handeln darf. Es gibt keinen zweiten Übergang mehr, mit dem sich das zeigen ließe — den Test ersatzlos löschen und den Verlust im Commit nennen. Die Regel selbst bleibt durch `"federal_board may NOT decide a join for a group that has a local board"` und `"federal_board decides a join only as fallback"` abgedeckt.
- `"rejects illegal status transitions"` (Zeile 297) auf die verbliebene unerlaubte Kante umstellen:

```typescript
it("rejects illegal status transitions", async () => {
  await createUser("usr_d", "d@example.de");
  const m = await createProfile(t.db, { userId: "usr_d", firstName: "D", lastName: "x" });
  await approveMember(t.db, m.id, BOARD);
  // active → pending ist nicht in der Matrix: eine Aufnahme wird nicht zurückgedreht
  await expect(transitionStatus(t.db, m.id, "pending", BOARD)).rejects.toMatchObject({
    code: "CONFLICT",
  });
});
```

- Der Test in Zeile 224 (`transitionStatus(..., "inactive", ...)`) liegt innerhalb von `"federal_board may NOT decide a join for a group that has a local board (ADR 0021)"`. Das Zielargument wird zu `"active"` — geprüft wird dort die Autorisierung, nicht das Ziel.

`apps/web/app/_blog/access.test.ts`: die Fixture-Signatur `memberWithStatus(status: "pending" | "active" | "inactive" | "alumnus")` wird zu `(status: "pending" | "active")`. Die Erwartungen in Zeile 84 (`canComment(alumnus) === true`) und 92 (`canComment(inactive) === false`) entfallen; an ihre Stelle tritt ein Test, der zeigt, dass die Kennzeichnung nichts einschränkt:

```typescript
it("ein Alumnus kommentiert wie jedes aktive Mitglied (ADR 0043)", () => {
  const alumnus = memberWithStatus("active");
  expect(canComment({ ...alumnus, grants: [{ role: "alumnus", groupId: "grp_a" }] })).toBe(true);
});
```

Zeile 135 (`canAuthorPost(memberWithStatus("alumnus")) === false`) und Zeile 160 (`plainAlumnus`) auf `"active"` plus Alumnus-Grant umbauen — die Aussage („eine Kennzeichnung berechtigt nicht zum Schreiben") bleibt und wird sogar schärfer.

`apps/web/app/account/view-model.test.ts` Zeilen 12–13: `layoutMode("inactive")` und `layoutMode("alumnus")` entfallen; stattdessen bleibt `layoutMode("pending") === "plain"` und `layoutMode(null) === "plain"`.

`modules/files/src/permissions.test.ts:56`: `member({ status: "inactive" })` wird zu `member({ status: "pending" })` — geprüft wird dort, dass ein Nicht-Aktiver `members_all` nicht lesen darf; `pending` trägt dieselbe Aussage.

- [ ] **Step 11: Alle betroffenen Tests und beide Typechecks laufen lassen**

```bash
pnpm exec vitest run modules/members/src/alumnus-role-migration.test.ts modules/members/src/pool.test.ts modules/members/src/application-migration.test.ts modules/members/src/group-change.test.ts modules/members/src/index.test.ts modules/members/src/roles.unit.test.ts
pnpm exec vitest run modules/files/src/permissions.test.ts
pnpm exec vitest run apps/web/app/_blog/access.test.ts apps/web/app/account/view-model.test.ts
pnpm -r typecheck
pnpm lint
```

Erwartet: alles PASS, kein `skipped` in den Postgres-Blöcken, Typecheck und Lint sauber. Meldet der Typecheck weitere Stellen mit den entfallenen Statuswerten, diese nach demselben Muster nachziehen — das ist der eigentliche Zweck dieses Schritts.

- [ ] **Step 12: Migration gegen eine frische Datenbank probelaufen lassen**

```bash
pnpm db:down && pnpm db:up
pnpm db:migrate:dry
pnpm db:migrate
```

Erwartet: `0011_alumnus_is_a_role.sql` wird von `infra/migrations` erkannt (die Manifest-Datei listet Module, innerhalb eines Moduls laufen die Dateien lexikalisch — es ist also **kein** Eintrag in `infra/migrations/src/manifest.ts` nötig) und läuft fehlerfrei durch.

- [ ] **Step 13: Commit**

```bash
git add modules/members apps/web modules/blog modules/files
git commit -m "$(cat <<'EOF'
feat(members)!: Alumnus ist eine Rolle, `inactive` entfällt (ADR 0043)

MemberStatus schrumpft auf `pending | active` und bekommt erstmals einen
CHECK-Constraint. Migration 0011 überführt verbliebene alumnus- und
inactive-Zeilen nach active plus Grant-Zeile; sie ist idempotent.

Drei Tests entfallen ersatzlos, weil ihr Gegenstand verschwindet: die
beiden Wächter gegen „deaktiviertes Mitglied" in group-change und der
Reihenfolge-Test, der die Offenlegung dieses Zustands absicherte. Mit
`inactive` gibt es keinen Ausschluss-Mechanismus mehr — das ist in
ADR 0043 so entschieden, nicht übersehen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Die Markierung setzen und entfernen

**Files:**

- Modify: `apps/web/app/(board)/_components/MembersTable.tsx` (Schaltfläche im Detail)
- Test: `apps/web/app/(board)/_components/MembersTable.alumnus.test.tsx` (neu)

**Interfaces:**

- Consumes: `grantRoleAction` / `revokeRoleAction` aus `apps/web/app/(board)/_components/role-actions.ts` — beide existieren bereits und prüfen die Befugnis serverseitig über `requireCanGrant` (Task 5).
- Produces: keine neue öffentliche Schnittstelle.

Diese Task geht über die Dateitabelle der Spec hinaus — siehe Global Constraints. Sie ist bewusst klein gehalten: kein neuer Service, keine neue Server Action, kein neues Autorisierungsprädikat. Der Scope des Grants ist `selected.primaryGroupId`; für ein Mitglied ohne Gruppe ist er `null`, was serverseitig nur der Bundesvorstand passieren lässt — genau die Aufteilung aus ADR 0043 §3.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`apps/web/app/(board)/_components/MembersTable.alumnus.test.tsx`:

```tsx
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const grantRoleAction = vi.fn(async () => ({ ok: true }));
const revokeRoleAction = vi.fn(async () => ({ ok: true }));
vi.mock("./role-actions", () => ({ grantRoleAction, revokeRoleAction }));

import { MembersTable } from "./MembersTable";

const member = {
  id: "mem_1",
  userId: "usr_1",
  firstName: "Alma",
  lastName: "Alumna",
  primaryGroupId: "grp_a",
  status: "active" as const,
  joinedAt: new Date("2024-01-01"),
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

function renderTable(alumnusIds: string[]) {
  return render(
    <MembersTable
      members={[member]}
      groupNames={{ grp_a: "BDAS Aachen" }}
      alumnusIds={alumnusIds}
      openChanges={[]}
      revalidatePath="/gruppe/aachen/members"
      rejectionCategories={[]}
    />,
  );
}

describe("Alumnus-Markierung im Mitglieder-Detail", () => {
  it("vergibt den Grant im Scope der Gruppe des Mitglieds", () => {
    renderTable([]);
    fireEvent.click(screen.getByText(/Alma Alumna/));
    fireEvent.click(screen.getByRole("button", { name: "Als Alumnus markieren" }));
    expect(grantRoleAction).toHaveBeenCalledWith(
      "mem_1",
      "alumnus",
      "grp_a",
      "/gruppe/aachen/members",
    );
  });

  it("entzieht den Grant, wenn die Markierung bereits gesetzt ist", () => {
    renderTable(["mem_1"]);
    fireEvent.click(screen.getByText(/Alma Alumna/));
    fireEvent.click(screen.getByRole("button", { name: "Markierung entfernen" }));
    expect(revokeRoleAction).toHaveBeenCalledWith(
      "mem_1",
      "alumnus",
      "grp_a",
      "/gruppe/aachen/members",
    );
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run "apps/web/app/(board)/_components/MembersTable.alumnus.test.tsx"
```

Erwartet: FAIL — die Schaltflächen existieren nicht.

- [ ] **Step 3: Den Umschalter einbauen**

In `MembersTable.tsx` die Actions importieren:

```typescript
import { grantRoleAction, revokeRoleAction } from "./role-actions";
```

und die in Task 4 ergänzte „Alumnus"-Detailzeile zu einer Zeile mit Schaltfläche ausbauen:

```tsx
<div className="flex items-center justify-between border-b border-bdas-soft pb-1">
  <dt className="text-bdas-ink-muted">Alumnus</dt>
  <dd>
    <button
      type="button"
      onClick={() => {
        const fn = isAlumnus.has(selected.id) ? revokeRoleAction : grantRoleAction;
        void fn(selected.id, "alumnus", selected.primaryGroupId, revalidatePath);
      }}
      className="rounded-bdas-pill border border-bdas-soft px-3 py-1 text-sm text-bdas-ink-body transition-colors hover:bg-bdas-surface-hover"
    >
      {isAlumnus.has(selected.id) ? "Markierung entfernen" : "Als Alumnus markieren"}
    </button>
  </dd>
</div>
```

Die Server Action ruft `revalidatePath` auf; die Liste kommt mit aktualisiertem `alumnusIds` zurück. Ein optimistisches Nachführen des lokalen Zustands ist damit nicht nötig und wird bewusst weggelassen.

- [ ] **Step 4: Test laufen lassen, Grün bestätigen**

```bash
pnpm exec vitest run "apps/web/app/(board)/_components/MembersTable.alumnus.test.tsx"
pnpm --filter @bdas/web typecheck
```

Erwartet: PASS und sauberer Typecheck.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(board)/_components/MembersTable.tsx" "apps/web/app/(board)/_components/MembersTable.alumnus.test.tsx"
git commit -m "$(cat <<'EOF'
feat(web): Alumnus-Markierung im Mitglieder-Detail setzen und entfernen

Über die bestehenden Server Actions, im Scope der Gruppe des Mitglieds.
Wer darf, entscheidet serverseitig requireCanGrant — der Lead in seiner
Gruppe, der Bundesvorstand überall und als einziger ungescoped.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: FAQ-Text und Modul-README

**Files:**

- Modify: `apps/web/content/faq/mitglieder.ts:82-91`
- Modify: `modules/members/README.md`

**Interfaces:**

- Consumes: nichts.
- Produces: nichts.

Der heutige FAQ-Text sagt das Gegenteil dessen, was ADR 0043 entscheidet („Für Veranstaltungen kannst du dich erst wieder anmelden, sobald du erneut als aktiv geführt wirst") und ist zusätzlich seit ADR 0037 falsch („Du kannst weiterhin Blog-Beiträge verfassen").

- [ ] **Step 1: Den FAQ-Eintrag ersetzen**

```typescript
    {
      id: "alumni",
      question: "Was ändert sich als Alumni?",
      body: [
        {
          kind: "p",
          text: "Wenig. Du bleibst aktives Mitglied im BDAS-Netzwerk und kannst dich weiterhin zu Veranstaltungen anmelden. In der Mitgliederliste deiner Hochschulgruppe bist du als Alumnus gekennzeichnet — das ist eine Einordnung, keine Einschränkung. Ob du Blog-Beiträge verfassen kannst, hängt wie bei allen anderen an deiner Rolle, nicht an dieser Kennzeichnung.",
        },
      ],
    },
```

- [ ] **Step 2: Die README des Moduls nachziehen**

In `modules/members/README.md` die Stellen suchen, die `MemberStatus` oder die Statuswerte aufzählen, und auf `pending | active` plus den Alumnus-Grant umstellen. Mindestens ein Satz muss festhalten, wer die Rolle vergeben darf (Bundesvorstand ungescoped, Lead im eigenen Scope, ADR 0043 §3) und dass die Kennzeichnung nichts einschränkt.

```bash
grep -n "alumnus\|inactive\|Status" modules/members/README.md
```

- [ ] **Step 3: Formatierung prüfen**

```bash
pnpm exec prettier --check apps/web/content/faq/mitglieder.ts modules/members/README.md
pnpm exec vitest run apps/web/lib/faq
```

Erwartet: `prettier` meldet keine Abweichung (sonst `--write` nachziehen), und die FAQ-Tests bleiben grün.

- [ ] **Step 4: Commit**

```bash
git add apps/web/content/faq/mitglieder.ts modules/members/README.md
git commit -m "$(cat <<'EOF'
docs: FAQ und members-README auf ADR 0043 ziehen

Der Alumni-Eintrag sagte bislang das Gegenteil der Entscheidung
(keine Event-Anmeldung) und war zusätzlich seit ADR 0037 falsch
(Blog-Beiträge hängen an der Rolle, nicht am Status).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Abschluss

- [ ] **`/review` auf dem PR.**
- [ ] **`/security-review` auf dem PR** — dieser PR ändert `requireCanGrant` und damit die Frage, wer eine Rolle vergeben darf (CLAUDE.md §4).
- [ ] **Deploy-Reihenfolge beachten:** `deploy-migrations.yml` wendet Migrationen nach grünem CI auf `main` an (ADR 0010), Deploy und Migration sind aber nicht atomar. Zwischen beiden steht Code, der `pending | active` erwartet, gegen ein Schema, das noch vier Werte zulässt — das ist unkritisch (der Code schreibt die alten Werte ohnehin nie), der umgekehrte Fall wäre es nicht. Nach dem Merge prüfen, dass der Migrationslauf tatsächlich durchging, bevor jemand die Mitgliederliste öffnet.
