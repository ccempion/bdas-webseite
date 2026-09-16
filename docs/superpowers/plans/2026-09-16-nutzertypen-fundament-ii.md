# Nutzertypen-Fundament II — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Plattform unterscheidet Mitglieder von Nicht-Mitgliedern, kennt die Gruppenart `netzwerk`, sperrt Nicht-Mitglieder standardmäßig aus internen Funktionen aus, gibt dem Bundesvorstand Ordner pro Person frei und schließt die Autorisierungslücke bei der Event-Anmeldung.

**Architecture:** Eine abgeleitete Wahrheit (`isBdasMember`) statt eines neuen Feldes, gebaut aus den Achsen, die PR A und PR B gelegt haben: Kontostatus, Gruppenart, Alumnus-Markierung. Der ungescopte `member`-Grant folgt ab hier der Mitgliedschaft, nicht dem Status — damit sperrt jede künftige Prüfung Nicht-Mitglieder von selbst aus. Modulgrenzen bleiben: `members` fragt `groups` ausschließlich über `getGroupKind`/`listGroupIdsByKind`, `files` erfährt die Art über `@bdas/groups`.

**Tech Stack:** TypeScript, PostgreSQL (rohes SQL), Drizzle ORM, Next.js 14 App Router, Vitest (Unit + Integration gegen Docker-Postgres), zod.

**Spec:** [`docs/superpowers/specs/2026-09-16-nutzertypen-fundament-ii-design.md`](../specs/2026-09-16-nutzertypen-fundament-ii-design.md)

## Global Constraints

- **Nur betroffene Tests ausführen.** Niemals `pnpm test` über die ganze Suite — immer nur die in der Task genannten Dateien.
- **Vitest erfasst zusätzlich Kopien unter `.claude/worktrees/`.** Nur der Treffer ohne `worktrees/` im Pfad zählt.
- **Integrationstests brauchen Postgres:** `pnpm db:up`, sonst überspringen sich die `describeIfDb`-Blöcke still und melden fälschlich Grün. Vor jedem „Erwartet: PASS" prüfen, dass die Tests wirklich liefen.
- **CLAUDE.md §1 Regel 1:** kein Modul liest fremde Tabellen. `members` und `files` erfahren die Gruppenart nur über die öffentliche Schnittstelle von `@bdas/groups`.
- **CLAUDE.md §1 Regel 7:** Migrationen liegen beim Modul. Nächste freie Nummern: `groups/0008`, `files/0005`. `members` braucht keine.
- **CLAUDE.md §4:** Tests im selben PR. PR 2, 3 und 4 ändern Autorisierung → vor dem Merge `/security-review`.
- **Kein Wizard.** Kein öffentlicher Einstiegspunkt für Förderer oder Alumni, kein Feld im Registrierungsformular, keine Verzweigung in `apps/web/app/profil/`. Wer beim Umsetzen den Drang verspürt, „dann kann man ja gleich …", hat die Grenze überschritten.
- **Keine `affiliate`-Zeile.** BDAJ bekommt seine Zeile mit seiner eigenen Spec. Dieser Plan legt nur die `netzwerk`-Zeile an, weil Förderer sie brauchen.
- **ADR:** Task 14 schreibt ADR **0045** (höchste vergebene Nummer ist 0044).
- **Branches:** ein Branch je PR, abgezweigt von `origin/main`, in der Reihenfolge der PRs gemergt. `feat/groups-netzwerk`, `feat/members-mitgliedschaft`, `feat/rechte-schicht`, `feat/ordnerfreigabe`, `feat/board-aufnahme`.
- **Commit-Fußzeile:** jeder Commit endet mit `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

# PR 1 — `groups`: die Art `netzwerk` (Branch `feat/groups-netzwerk`)

### Task 1: Migration `0008_group_kind_netzwerk.sql`

**Files:**

- Create: `modules/groups/migrations/0008_group_kind_netzwerk.sql`
- Test: `modules/groups/src/index.test.ts` (neuer `describeIfDb`-Block am Dateiende)

**Interfaces:**

- Consumes: `groups.kind` und `groups_kind_check` aus `0007_group_kind.sql`.
- Produces: `kind` akzeptiert zusätzlich `netzwerk`; eine `netzwerk`-Zeile hat keine Stadt.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Ans Ende von `modules/groups/src/index.test.ts`:

```typescript
describeIfDb("0008 netzwerk kind", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      "0001_init.sql",
      "0002_status_check.sql",
      "0003_drop_university_description.sql",
      "0004_location.sql",
      "0005_image_key.sql",
      "0006_link_scheme_guard.sql",
      "0007_group_kind.sql",
      "0008_group_kind_netzwerk.sql",
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("lässt eine netzwerk-Zeile ohne Stadt zu", async () => {
    await t.client`
      INSERT INTO groups (id, slug, name, city, kind)
      VALUES ('grp_nw', 'netzwerk', 'BDAS Netzwerk', NULL, 'netzwerk')
    `;
    const [row] = await t.client`SELECT city, kind FROM groups WHERE id = 'grp_nw'`;
    expect(row!["kind"]).toBe("netzwerk");
    expect(row!["city"]).toBeNull();
  });

  it("verbietet einer netzwerk-Zeile eine Stadt", async () => {
    await expect(
      t.client`
        INSERT INTO groups (id, slug, name, city, kind)
        VALUES ('grp_nw2', 'netzwerk-zwei', 'Netzwerk Zwei', 'Köln', 'netzwerk')
      `,
    ).rejects.toThrow(/groups_kind_city_check/);
  });

  it("weist eine weiterhin unbekannte Art ab", async () => {
    await expect(
      t.client`
        INSERT INTO groups (id, slug, name, city, kind)
        VALUES ('grp_x', 'verein', 'Verein', NULL, 'verein')
      `,
    ).rejects.toThrow(/groups_kind_check/);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm db:up
pnpm exec vitest run modules/groups/src/index.test.ts -t "0008 netzwerk kind"
```

Erwartet: FAIL im `beforeEach` mit `ENOENT: … 0008_group_kind_netzwerk.sql`.

- [ ] **Step 3: Die Migration schreiben**

`modules/groups/migrations/0008_group_kind_netzwerk.sql`:

```sql
-- Groups module — dritte Gruppenart: netzwerk.
--
-- Zuhause für Accounts ohne Anspruch auf Mitgliedschaft: Förderer*innen,
-- Referent*innen, Einzelpersonen bei Partnerorganisationen (Spec
-- 2026-09-16-nutzertypen-fundament-ii-design.md §3). `affiliate` bleibt, was es
-- ist: eine Partnerorganisation als Organisation (BDAJ).
--
-- Der Stadt-Constraint aus 0007 trägt den neuen Wert unverändert mit: nur eine
-- Hochschulgruppe ist verortet.

ALTER TABLE groups DROP CONSTRAINT groups_kind_check;

ALTER TABLE groups
  ADD CONSTRAINT groups_kind_check
  CHECK (kind IN ('hochschulgruppe', 'affiliate', 'netzwerk'));
```

- [ ] **Step 4: Tests laufen lassen, Grün bestätigen**

```bash
pnpm exec vitest run modules/groups/src/index.test.ts
```

Erwartet: PASS, kein `skipped`. Der bestehende `0007`-Block bleibt unberührt grün.

- [ ] **Step 5: Commit**

```bash
git add modules/groups/migrations/0008_group_kind_netzwerk.sql modules/groups/src/index.test.ts
git commit -m "$(cat <<'EOF'
feat(groups): netzwerk als dritte Gruppenart

Zuhause für Accounts ohne Anspruch auf Mitgliedschaft. Der Stadt-Constraint
aus 0007 gilt unverändert: nur eine Hochschulgruppe ist verortet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `GroupKind` erweitern, Upsert mit Art, `listGroupIdsByKind`

**Files:**

- Modify: `modules/groups/src/types.ts` (`GroupKind`)
- Modify: `modules/groups/src/services/upsert.ts` (`UpsertGroupInput`, `toGroup`, Insert/Update)
- Modify: `modules/groups/src/services/list.ts` (`ListOpts`, Filter, neuer Leser)
- Modify: `modules/groups/src/index.ts` (Export `listGroupIdsByKind`)
- Test: `modules/groups/src/index.test.ts`

**Interfaces:**

- Consumes: die Migration aus Task 1.
- Produces:
  - `type GroupKind = "hochschulgruppe" | "affiliate" | "netzwerk"`
  - `UpsertGroupInput` mit `kind?: GroupKind` (Vorgabe `hochschulgruppe`) und `city` abhängig von der Art
  - `listGroups(db, { status?, kind? })`
  - `listGroupIdsByKind(db: Db, kind: GroupKind): Promise<string[]>`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Im bestehenden `describeIfDb("groups integration")`-Block `"0008_group_kind_netzwerk.sql"` an die Migrationsliste anhängen und ergänzen:

```typescript
it("legt über den Upsert eine netzwerk-Gruppe ohne Stadt an (Spec §5.1)", async () => {
  const res = await upsertGroupBySlug(t.db, {
    slug: "netzwerk",
    name: "BDAS Netzwerk",
    kind: "netzwerk",
  });
  expect(res.created).toBe(true);
  expect(res.group.kind).toBe("netzwerk");
  expect(res.group.city).toBeNull();

  const list = await listGroups(t.db, { kind: "netzwerk" });
  expect(list.map((g) => g.slug)).toEqual(["netzwerk"]);
  expect(await listGroupIdsByKind(t.db, "netzwerk")).toEqual([res.group.id]);
});

it("verlangt für eine Hochschulgruppe eine Stadt und verbietet sie sonst", async () => {
  await expect(upsertGroupBySlug(t.db, { slug: "ohne", name: "Ohne Stadt" })).rejects.toMatchObject(
    { code: "VALIDATION" },
  );
  await expect(
    upsertGroupBySlug(t.db, { slug: "nw2", name: "Netzwerk Zwei", kind: "netzwerk", city: "Köln" }),
  ).rejects.toMatchObject({ code: "VALIDATION" });
});
```

`listGroupIdsByKind` in den Importkopf der Testdatei aufnehmen.

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/groups/src/index.test.ts -t "netzwerk-Gruppe ohne Stadt"
```

Erwartet: FAIL beim Import — `listGroupIdsByKind` existiert nicht.

- [ ] **Step 3: Typ erweitern**

`modules/groups/src/types.ts`:

```typescript
export type GroupKind = "hochschulgruppe" | "affiliate" | "netzwerk";
```

Der Kommentarblock darüber bekommt einen Satz: `netzwerk` ist das Zuhause für Accounts ohne Anspruch auf Mitgliedschaft; `affiliate` bleibt die Partnerorganisation.

- [ ] **Step 4: Upsert auf die Art umstellen**

`modules/groups/src/services/upsert.ts` — das Eingabeschema bekommt `kind`, `city` wird bedingt:

```typescript
export const UpsertGroupInput = z
  .object({
    slug: z
      .string()
      .min(2)
      .max(64)
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Slug must be lowercase kebab-case"),
    name: z.string().min(2).max(120),
    kind: z.enum(["hochschulgruppe", "affiliate", "netzwerk"]).default("hochschulgruppe"),
    city: z.string().min(2).max(120).optional().nullable(),
    contactEmail: z.string().email().max(254).optional().nullable(),
    instagramUrl: HttpUrlInput.optional().nullable(),
    websiteUrl: HttpUrlInput.optional().nullable(),
    status: z.enum(["active", "dormant", "new", "archived"]).default("active"),
    location: GroupLocationInput.optional().nullable(),
    imageKey: z.string().max(500).optional().nullable(),
  })
  // Dieselbe Regel wie groups_kind_city_check, nur früher und mit einer
  // Meldung, die im Seed-Lauf lesbar ist.
  .superRefine((v, ctx) => {
    if (v.kind === "hochschulgruppe" && !v.city) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["city"],
        message: "Eine Hochschulgruppe braucht eine Stadt",
      });
    }
    if (v.kind !== "hochschulgruppe" && v.city) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["city"],
        message: "Nur eine Hochschulgruppe hat eine Stadt",
      });
    }
  });
```

Im Update-Zweig und im Insert `city: v.city ?? null` schreiben und `kind: v.kind` ergänzen. In `toGroup` (Dateiende) den festen Wert durch `kind: v.kind` und `city: v.city ?? null` ersetzen.

- [ ] **Step 5: Filter und schmaler Leser**

`modules/groups/src/services/list.ts` — `and` aus `drizzle-orm` importieren:

```typescript
export type ListOpts = {
  /** Restrict by status. Omit to include every status (admin views). */
  readonly status?: GroupStatus | undefined;
  /** Restrict by kind — öffentliche Flächen zeigen nur `hochschulgruppe`. */
  readonly kind?: GroupKind | undefined;
};
```

und im Query:

```typescript
const conds: SQL[] = [];
if (opts.status) conds.push(eq(groups.status, opts.status));
if (opts.kind) conds.push(eq(groups.kind, opts.kind));
// … .where(conds.length ? and(...conds) : undefined)
```

Ans Dateiende:

```typescript
/**
 * Nur die IDs einer Gruppenart. Für `@bdas/members`, das für die Statistik
 * wissen muss, welche Gruppen Hochschulgruppen sind, die Tabelle aber nicht
 * selbst abfragen darf (CLAUDE.md §1 Regel 1).
 */
export async function listGroupIdsByKind(db: Db, kind: GroupKind): Promise<string[]> {
  const rows = await db.select({ id: groups.id }).from(groups).where(eq(groups.kind, kind));
  return rows.map((r) => r.id);
}
```

- [ ] **Step 6: Öffentliche Schnittstelle**

`modules/groups/src/index.ts`:

```typescript
export { listGroups, listGroupIdsByKind, type ListOpts } from "./services/list";
```

- [ ] **Step 7: Tests und Typecheck**

```bash
pnpm exec vitest run modules/groups/src/index.test.ts
pnpm --filter @bdas/groups typecheck
```

Erwartet: PASS, sauberer Modul-Typecheck.

- [ ] **Step 8: Commit**

```bash
git add modules/groups/src
git commit -m "$(cat <<'EOF'
feat(groups): Upsert kennt die Art, listGroupIdsByKind für andere Module

Über den Seed entsteht ab jetzt auch eine netzwerk- oder affiliate-Zeile;
die Stadt hängt an der Art, wie im DB-Constraint. Das Vorstandsformular
(CreateGroupInput/UpdateGroupInput) bleibt unverändert bei Hochschulgruppen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Die Netzwerk-Zeile säen und öffentliche Flächen filtern

**Files:**

- Modify: `infra/seeds/groups.json`
- Modify: `apps/web/app/gruppen/page.tsx:17`
- Modify: `apps/web/app/gruppen/[slug]/page.tsx` (404 für Nicht-Hochschulgruppen)
- Test: `apps/web/app/_groups/pins.test.ts` (bestehend, nur Fixture-Ergänzung falls nötig)

**Interfaces:**

- Consumes: `listGroups({ kind })` aus Task 2.
- Produces: keine neue Schnittstelle. Nach `pnpm groups:seed` existiert genau eine `netzwerk`-Zeile.

- [ ] **Step 1: Seed-Eintrag ergänzen**

`infra/seeds/groups.json` — als zweiter Eintrag:

```json
{
  "slug": "netzwerk",
  "name": "BDAS Netzwerk",
  "kind": "netzwerk",
  "status": "active"
}
```

- [ ] **Step 2: Öffentliche Gruppenliste filtern**

`apps/web/app/gruppen/page.tsx:17`:

```typescript
// Öffentlich sind nur Hochschulgruppen. netzwerk und affiliate sind
// Zuhause für Accounts, keine Gruppen, die jemand besuchen könnte.
const groups = await listGroups(getDb(), { status: "active", kind: "hochschulgruppe" });
```

- [ ] **Step 3: Die öffentliche Gruppenseite für fremde Arten schließen**

In `apps/web/app/gruppen/[slug]/page.tsx`, unmittelbar hinter dem bestehenden Not-Found-Zweig für die fehlende Gruppe:

```typescript
// Eine netzwerk- oder affiliate-Zeile hat keine öffentliche Seite (Spec §4).
if (group.kind !== "hochschulgruppe") notFound();
```

- [ ] **Step 4: Weitere öffentliche Konsumenten prüfen**

```bash
git grep -n "listGroups(" -- apps/web | grep -v "(board)"
```

Jeder Treffer außerhalb von `apps/web/app/(board)/` ist eine öffentliche Fläche und bekommt denselben Filter `{ kind: "hochschulgruppe" }`. Erwartete Treffer: `app/gruppen/page.tsx` (Step 2) und `app/sitemap.ts`. Board-Flächen bleiben ungefiltert — der Bundesvorstand soll jede Gruppe sehen.

- [ ] **Step 5: Tests und Typecheck**

```bash
pnpm exec vitest run apps/web/app/_groups/pins.test.ts
pnpm --filter @bdas/web typecheck
pnpm lint
```

Erwartet: PASS. Die Karte braucht keine Änderung: sie verlangt seit PR B eine Stadt, und die hat nur eine Hochschulgruppe.

- [ ] **Step 6: Commit**

```bash
git add infra/seeds/groups.json apps/web/app/gruppen apps/web/app/sitemap.ts
git commit -m "$(cat <<'EOF'
feat(web): Netzwerk-Gruppe säen, öffentliche Flächen auf Hochschulgruppen filtern

Die netzwerk-Zeile ist das Zuhause der Förderer-Accounts und keine Gruppe,
die jemand besucht: nicht in der Liste, nicht auf der Karte, keine Seite.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# PR 2 — `members`: Mitgliedschaft (Branch `feat/members-mitgliedschaft`)

### Task 4: `isBdasMember` und der ehrliche `member`-Grant

**Files:**

- Modify: `modules/members/src/services/me.ts`
- Modify: `modules/members/src/roles.ts` (`effectiveGrants`)
- Modify: `modules/members/src/test-db.ts` (Migrationsliste)
- Test: `modules/members/src/index.test.ts`, `modules/members/src/roles.unit.test.ts`

**Interfaces:**

- Consumes: `getGroupKind` aus `@bdas/groups`.
- Produces:
  - `CurrentMember.primaryGroupKind: GroupKind | null` und `CurrentMember.isBdasMember: boolean`
  - `isBdasMemberFrom(member: Member | null, kind: GroupKind | null, grants: ReadonlyArray<Grant>): boolean`
  - `effectiveGrants(jwtRoles, member, dbGrants, isMember: boolean)` — vierter Parameter neu

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `modules/members/src/roles.unit.test.ts`:

```typescript
describe("isBdasMemberFrom (Spec §3.1)", () => {
  const active = { status: "active" } as Member;
  const pending = { status: "pending" } as Member;
  const alumnusGrant: Grant[] = [{ role: "alumnus", groupId: "grp_a" }];

  it("Hochschulgruppe genügt", () => {
    expect(isBdasMemberFrom(active, "hochschulgruppe", [])).toBe(true);
  });

  it("die Alumnus-Markierung genügt ohne Gruppe", () => {
    expect(isBdasMemberFrom(active, null, alumnusGrant)).toBe(true);
  });

  it("Förderer und Partnerorganisationen sind keine Mitglieder", () => {
    expect(isBdasMemberFrom(active, "netzwerk", [])).toBe(false);
    expect(isBdasMemberFrom(active, "affiliate", [])).toBe(false);
  });

  it("wer noch nicht aufgenommen ist, ist kein Mitglied", () => {
    expect(isBdasMemberFrom(pending, "hochschulgruppe", [])).toBe(false);
    expect(isBdasMemberFrom(null, null, [])).toBe(false);
  });
});

describe("effectiveGrants vergibt member nur an Mitglieder", () => {
  it("kein member-Grant für einen Nicht-Mitglieds-Account", () => {
    const grants = effectiveGrants([], { status: "active" } as Member, [], false);
    expect(grants.some((g) => g.role === "member")).toBe(false);
  });

  it("member-Grant für ein Mitglied", () => {
    const grants = effectiveGrants([], { status: "active" } as Member, [], true);
    expect(grants).toContainEqual({ role: "member", groupId: null });
  });
});
```

Importe in der Datei ergänzen: `isBdasMemberFrom` aus `./services/me`, `Grant`/`Member` aus `./types`.

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/members/src/roles.unit.test.ts
```

Erwartet: FAIL — `isBdasMemberFrom` existiert nicht, `effectiveGrants` nimmt drei Parameter.

- [ ] **Step 3: `me.ts` erweitern**

```typescript
import { getGroupKind, type GroupKind } from "@bdas/groups";

export type CurrentMember = {
  readonly user: CurrentUser;
  readonly member: Member | null;
  readonly grants: ReadonlyArray<Grant>;
  /** Art der primären Gruppe, null ohne Gruppe. Einmal gelesen, Grundlage
   *  beider Flags darunter. */
  readonly primaryGroupKind: GroupKind | null;
  /** Sitzt der Account in einer Hochschulgruppe? (PR B, Spec 2026-09-12 §3.2) */
  readonly hasGroupScope: boolean;
  /**
   * Ist dieser Account BDAS-Mitglied? Aufgenommen UND (Hochschulgruppe ODER
   * Alumnus-Markierung) — Spec 2026-09-16 §3.1. Die EINZIGE Stelle, an der die
   * Frage beantwortet wird. Förderer und Partnerorganisationen sind es nicht.
   */
  readonly isBdasMember: boolean;
};

/** Reine Ableitung, damit sie ohne Sitzung testbar ist. */
export function isBdasMemberFrom(
  member: Member | null,
  kind: GroupKind | null,
  grants: ReadonlyArray<Grant>,
): boolean {
  if (member?.status !== "active") return false;
  if (kind === "hochschulgruppe") return true;
  return grants.some((g) => g.role === "alumnus");
}

export async function getCurrentMember(
  db: Db,
  cookieValue: string | undefined,
): Promise<CurrentMember | null> {
  const user = await getCurrentUser(db, cookieValue);
  if (!user) return null;

  const member = await getMemberByUserId(db, user.id);
  const [dbGrants, primaryGroupKind] = await Promise.all([
    member ? getGrants(db, member.id) : [],
    member?.primaryGroupId ? getGroupKind(db, member.primaryGroupId) : null,
  ]);
  const isBdasMember = isBdasMemberFrom(member, primaryGroupKind, dbGrants);
  return {
    user,
    member,
    grants: effectiveGrants(user.roles, member, dbGrants, isBdasMember),
    primaryGroupKind,
    hasGroupScope: primaryGroupKind === "hochschulgruppe",
    isBdasMember,
  };
}
```

`resolveHasGroupScope` bleibt exportiert (PR B testet sie); ihr Kommentar bekommt den Hinweis, dass `getCurrentMember` die Art inzwischen selbst hält.

- [ ] **Step 4: `effectiveGrants` umstellen**

`modules/members/src/roles.ts`:

```typescript
export function effectiveGrants(
  jwtRoles: ReadonlyArray<Role>,
  member: Member | null,
  dbGrants: ReadonlyArray<Grant>,
  /** Ergebnis von `isBdasMemberFrom`. Der ungescopte `member`-Grant folgt ab
   *  ADR 0045 der Mitgliedschaft, nicht dem Kontostatus: ein Förderer-Account
   *  ist aufgenommen, aber kein Mitglied. */
  isMember: boolean,
): ReadonlyArray<Grant> {
  // … unverändert bis zur letzten Zeile:
  if (isMember) add("member", null);
  return out;
}
```

Alle Aufrufer nachziehen:

```bash
git grep -n "effectiveGrants(" -- modules apps | grep -v "roles.ts"
```

- [ ] **Step 5: Die Netzwerk-Migration in die Testdatenbank aufnehmen**

`modules/members/src/test-db.ts`, hinter der Zeile für `groups/0007_group_kind.sql`:

```typescript
  ["..", "..", "groups", "migrations", "0008_group_kind_netzwerk.sql"],
```

- [ ] **Step 6: Den Integrationstest schreiben**

In `modules/members/src/index.test.ts`:

```typescript
it("ein Förderer-Account ist aufgenommen, aber kein Mitglied (Spec §3.1)", async () => {
  await t.client`
    INSERT INTO groups (id, slug, name, city, kind, status)
    VALUES ('grp_nw', 'netzwerk', 'BDAS Netzwerk', NULL, 'netzwerk', 'active')
  `;
  await createUser("usr_foerderer", "foerderer@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_foerderer",
    firstName: "Fee",
    lastName: "Förderin",
    primaryGroupId: "grp_nw",
  });
  await approveMember(t.db, m.id, BOARD);

  const grants = await getGrants(t.db, m.id);
  expect(isBdasMemberFrom({ ...m, status: "active" }, "netzwerk", grants)).toBe(false);
  expect(effectiveGrants([], { ...m, status: "active" }, grants, false)).not.toContainEqual({
    role: "member",
    groupId: null,
  });
});
```

- [ ] **Step 7: Tests, Typecheck, Lint**

```bash
pnpm exec vitest run modules/members/src/roles.unit.test.ts modules/members/src/index.test.ts
pnpm -r --no-bail typecheck
```

Erwartet: PASS. Der Typecheck meldet jede Test-Fixture, die `CurrentMember` als Objektliteral baut — erwartete Kandidaten: `apps/web/app/_blog/access.test.ts`, `modules/files/src/permissions.test.ts`, `modules/files/src/index.test.ts`, `modules/files/src/folder-writes.test.ts`. Dort `primaryGroupKind: "hochschulgruppe"` und `isBdasMember: true` ergänzen (in diesen Tests geht es um Mitglieder einer Hochschulgruppe); wo `member: null` steht, `primaryGroupKind: null` und `isBdasMember: false`.

- [ ] **Step 8: Commit**

```bash
git add modules/members/src apps/web modules/files
git commit -m "$(cat <<'EOF'
feat(members)!: isBdasMember, und der member-Grant folgt der Mitgliedschaft

Aufgenommen UND (Hochschulgruppe ODER Alumnus-Markierung). Förderer und
Partnerorganisationen sind aufgenommene Accounts ohne Mitgliedschaft und
bekommen den ungescopten member-Grant ab jetzt nicht mehr (ADR 0045).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `acceptAsAlumnus` und die Markierung nur für Aufgenommene

**Files:**

- Modify: `modules/members/src/services/roles.ts` (`grantRole`)
- Modify: `modules/members/src/services/status.ts` (neuer Service am Dateiende)
- Modify: `modules/members/src/index.ts` (Export)
- Test: `modules/members/src/index.test.ts`

**Interfaces:**

- Consumes: `transitionStatus`, `grantRole`, `getMember`.
- Produces: `acceptAsAlumnus(db: Db, memberId: string, actor: Actor): Promise<Member>`; `grantRole` wirft für `alumnus` auf einem `pending`-Mitglied.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```typescript
it("nimmt eine Person ohne Gruppe als Alumnus auf (Spec §5.2)", async () => {
  await createUser("usr_ehem", "ehemalig@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_ehem",
    firstName: "Eva",
    lastName: "Ehemalig",
  });

  await expect(acceptAsAlumnus(t.db, m.id, PEASANT)).rejects.toMatchObject({ code: "FORBIDDEN" });

  const accepted = await acceptAsAlumnus(t.db, m.id, BOARD);
  expect(accepted.status).toBe("active");
  const grants = await getGrants(t.db, m.id);
  expect(grants).toContainEqual(expect.objectContaining({ role: "alumnus", groupId: null }));

  // Wiederholbar: beide Schritte sind idempotent.
  await acceptAsAlumnus(t.db, m.id, BOARD);
  expect((await getGrants(t.db, m.id)).filter((g) => g.role === "alumnus")).toHaveLength(1);
});

it("verweigert die Aufnahme, wenn die Person einer Gruppe angehört", async () => {
  await createGroup("grp_a", "aachen");
  await createUser("usr_bew", "bewerber@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_bew",
    firstName: "Ben",
    lastName: "Bewerber",
    primaryGroupId: "grp_a",
  });
  await expect(acceptAsAlumnus(t.db, m.id, BOARD)).rejects.toMatchObject({ code: "VALIDATION" });
});

it("markiert niemanden als Alumnus, der nicht aufgenommen ist (Spec §5.2)", async () => {
  await createGroup("grp_b", "bonn");
  await createUser("usr_pend", "pending@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_pend",
    firstName: "Pia",
    lastName: "Pending",
    primaryGroupId: "grp_b",
  });
  await expect(grantRole(t.db, m.id, "alumnus", BOARD, "grp_b")).rejects.toMatchObject({
    code: "VALIDATION",
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/members/src/index.test.ts -t "Alumnus auf"
```

Erwartet: FAIL — `acceptAsAlumnus` existiert nicht.

- [ ] **Step 3: Die Markierung an den Status binden**

In `modules/members/src/services/roles.ts`, in `grantRole` innerhalb der Transaktion, direkt vor der bestehenden Lead-Prüfung:

```typescript
// Wer nie aufgenommen wurde, ist kein Alumnus (ADR 0043: „wer abgelehnt
// wurde, war nie dabei"). Ohne diese Prüfung verschwände eine markierte
// Bewerbung aus „Ohne Gruppe", ohne je Zugang bekommen zu haben.
if (role === "alumnus" && member.status !== "active") {
  throw new ValidationError("Nur aufgenommene Mitglieder können als Alumnus markiert werden.");
}
```

- [ ] **Step 4: Den Aufnahme-Service schreiben**

Ans Ende von `modules/members/src/services/status.ts`:

```typescript
/**
 * Aufnahme einer Person ohne Gruppe — der Weg für Ehemalige, die sich direkt
 * auf der Plattform melden (Spec 2026-09-16 §5.2). Nur der Bundesvorstand:
 * ohne Gruppe gibt es keinen lokalen Vorstand, der entscheiden könnte
 * (ADR 0021).
 *
 * Zwei Schritte, bewusst ohne gemeinsame Transaktion — beide Services öffnen
 * ihre eigene und sind idempotent. Bricht es dazwischen ab, ist die Person
 * aufgenommen, aber nicht markiert; ein zweiter Aufruf vervollständigt das.
 * Reihenfolge ist Pflicht: `grantRole` verlangt seit Task 5 einen aktiven
 * Status.
 */
export async function acceptAsAlumnus(db: Db, memberId: string, actor: Actor): Promise<Member> {
  if (!isFederalBoard(actor.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand nimmt Personen ohne Gruppe auf.");
  }
  const existing = await getMember(db, memberId);
  if (existing.primaryGroupId !== null) {
    throw new ValidationError(
      "Diese Person gehört einer Gruppe an — über die Aufnahme entscheidet deren Vorstand.",
    );
  }

  const member = await transitionStatus(db, memberId, "active", actor);
  await grantRole(db, memberId, "alumnus", actor, null);
  return member;
}
```

Importe in `status.ts` ergänzen: `ValidationError` aus `@bdas/errors`, `isFederalBoard` aus `../roles`, `getMember` aus `./get`, `grantRole` aus `./roles`. Zyklusprüfung: `roles.ts` importiert aus `status.ts` nur den Typ `Actor` — ein Typ-Import erzeugt keinen Laufzeitzyklus. Meldet ESLint dennoch `import/no-cycle`, wandert `Actor` nach `../types` und beide Dateien importieren ihn von dort.

- [ ] **Step 5: Export**

`modules/members/src/index.ts` — `acceptAsAlumnus` neben `approveMember` exportieren.

- [ ] **Step 6: Tests, Typecheck, Lint**

```bash
pnpm exec vitest run modules/members/src/index.test.ts
pnpm exec vitest run modules/members/src/local-role-redesign.integration.test.ts modules/members/src/group-change.test.ts modules/members/src/pool.test.ts
pnpm -r --no-bail typecheck
pnpm lint
```

Erwartet: alles PASS. Die drei zusätzlich genannten Dateien vergeben `alumnus` in Fixtures; schlägt dort etwas fehl, markieren sie ein `pending`-Mitglied und der Fixture muss erst `approveMember` aufrufen.

- [ ] **Step 7: Commit**

```bash
git add modules/members/src
git commit -m "$(cat <<'EOF'
feat(members): Aufnahme ohne Gruppe als Alumnus, Markierung nur für Aufgenommene

acceptAsAlumnus verdrahtet, was die Services längst konnten: Status auf
active, dann der ungescopte alumnus-Grant — nur Bundesvorstand, nur ohne
Gruppe. grantRole verweigert die Markierung für pending-Personen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Selbstbedienter Beitritt zur Netzwerk-Gruppe

**Files:**

- Modify: `modules/members/src/services/group-change.ts` (`changePrimaryGroup`)
- Test: `modules/members/src/group-change.test.ts`

**Interfaces:**

- Consumes: `getGroupKind` aus `@bdas/groups`.
- Produces: `changePrimaryGroup` wendet einen Wechsel in eine `netzwerk`-Gruppe sofort an und setzt `status = 'active'`; das Ergebnis ist `{ kind: "applied", member }`.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `modules/members/src/group-change.test.ts`:

```typescript
it("der Beitritt zur netzwerk-Gruppe braucht keine Entscheidung (Spec §5.2)", async () => {
  await t.client`
    INSERT INTO groups (id, slug, name, city, kind, status)
    VALUES ('grp_nw', 'netzwerk', 'BDAS Netzwerk', NULL, 'netzwerk', 'active')
  `;
  await createUser("usr_self", "self@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_self",
    firstName: "Sam",
    lastName: "Selbst",
  });

  const res = await changePrimaryGroup(t.db, m.id, "grp_nw", {
    userId: "usr_self",
    grants: [],
  });

  expect(res.kind).toBe("applied");
  const [row] = await t.client<{ status: string; primary_group_id: string }[]>`
    SELECT status, primary_group_id FROM members WHERE id = ${m.id}`;
  expect(row?.status).toBe("active");
  expect(row?.primary_group_id).toBe("grp_nw");
});
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/members/src/group-change.test.ts -t "netzwerk-Gruppe braucht keine Entscheidung"
```

Erwartet: FAIL — es entsteht ein Antrag (`kind: "requested"`), der Status bleibt `pending`.

- [ ] **Step 3: Den Zweig einbauen**

In `changePrimaryGroup`, direkt vor dem Kommentar „Joining another group: the destination board decides":

```typescript
// Eine netzwerk-Gruppe ist das Zuhause für Förderer-Accounts und hat
// niemanden, der entscheiden könnte: nach ADR 0021 fiele das an den
// Bundesvorstand, und genau diese Entscheidung ist hier nicht gewollt
// (Spec 2026-09-16 §5.2). Der Beitritt gilt sofort.
if ((await getGroupKind(db, toGroupId)) === "netzwerk") {
  await withdrawOpen(tx, memberId, actor.userId);
  const [updated] = await tx
    .update(members)
    .set({ primaryGroupId: toGroupId, status: "active", updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning();
  if (!updated) throw new Error("changePrimaryGroup: update returned no row");
  if (from !== null) await revokeGroupScopedGrants(tx, memberId, from, actor.userId);
  return { kind: "applied", member: row2member(updated) };
}
```

`getGroupKind` aus `@bdas/groups` importieren. Die Lesung läuft auf `db`, nicht auf `tx`: die Art einer Gruppe ist unveränderlich, und `getGroupKind` nimmt eine `Db`.

- [ ] **Step 4: Tests und Typecheck**

```bash
pnpm exec vitest run modules/members/src/group-change.test.ts modules/members/src/index.test.ts
pnpm -r --no-bail typecheck
```

Erwartet: PASS. Kein bestehender Test betrifft `netzwerk`, die übrigen Zweige bleiben unberührt.

- [ ] **Step 5: Commit**

```bash
git add modules/members/src/services/group-change.ts modules/members/src/group-change.test.ts
git commit -m "$(cat <<'EOF'
feat(members): Beitritt zur netzwerk-Gruppe ist selbstbedient

Erste Ausnahme von „über einen Beitritt entscheidet ein Vorstand": über
einen Förderer-Account entscheidet niemand (ADR 0045). Der Wechsel gilt
sofort und setzt den Account auf active — Mitglied wird er dadurch nicht.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Die Statistik zählt nur Mitglieder

**Files:**

- Modify: `modules/members/src/services/stats.ts` (`countMembersByStatus`)
- Test: `modules/members/src/approval-counts.test.ts`

**Interfaces:**

- Consumes: `listGroupIdsByKind` aus `@bdas/groups` (Task 2).
- Produces: `countMembersByStatus` unverändert in der Form, verändert in der Menge — Förderer und Partnerorganisationen zählen nicht mit.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `modules/members/src/approval-counts.test.ts`:

```typescript
it("zählt Förderer-Accounts nicht als Mitglieder (Spec §4)", async () => {
  await t.client`
    INSERT INTO groups (id, slug, name, city, kind, status)
    VALUES ('grp_nw', 'netzwerk', 'BDAS Netzwerk', NULL, 'netzwerk', 'active')
  `;
  await createUser("usr_f", "f@example.de");
  const f = await createProfile(t.db, {
    userId: "usr_f",
    firstName: "Fee",
    lastName: "Förderin",
    primaryGroupId: "grp_nw",
  });
  await approveMember(t.db, f.id, BOARD);

  const before = await countMembersByStatus(t.db);
  expect(before.active).toBe(0);
});
```

Die Fixtures dieser Datei bauen nur Hochschulgruppen; der erwartete Wert `0` gilt für einen Test, der sonst nichts anlegt. Legt der bestehende `beforeEach` bereits Mitglieder an, den Erwartungswert entsprechend als „unverändert gegenüber vorher" formulieren.

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/members/src/approval-counts.test.ts -t "Förderer-Accounts nicht"
```

Erwartet: FAIL — `active` ist 1.

- [ ] **Step 3: Die Zählung umstellen**

In `modules/members/src/services/stats.ts`, in `countMembersByStatus`:

```typescript
// Mitglied ist, wer in einer Hochschulgruppe sitzt oder die Alumnus-
// Markierung trägt (Spec §3.1). Die Gruppen-IDs kommen über die öffentliche
// Schnittstelle — members liest die groups-Tabelle nicht (CLAUDE.md §1).
const hochschulIds = await listGroupIdsByKind(db, "hochschulgruppe");
const alumnusIds = await listAlumnusIds(db, q.groupId ? { groupId: q.groupId } : {});
const memberScope: SQL | undefined =
  hochschulIds.length > 0
    ? (or(
        inArray(members.primaryGroupId, hochschulIds),
        alumnusIds.length > 0 ? inArray(members.id, alumnusIds) : sql`false`,
      ) as SQL)
    : alumnusIds.length > 0
      ? (inArray(members.id, alumnusIds) as SQL)
      : (sql`false` as SQL);
```

und `memberScope` zusammen mit dem bestehenden `scope` in die `where`-Bedingung der `statusRows`-Abfrage aufnehmen. `or`, `inArray` aus `drizzle-orm` und `listGroupIdsByKind` aus `@bdas/groups` importieren; `listAlumnusIds` kommt aus `./list-members`.

- [ ] **Step 4: Tests und Typecheck**

```bash
pnpm exec vitest run modules/members/src/approval-counts.test.ts modules/members/src/index.test.ts
pnpm -r --no-bail typecheck
pnpm lint
```

Erwartet: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/members/src/services/stats.ts modules/members/src/approval-counts.test.ts
git commit -m "$(cat <<'EOF'
feat(members): die Mitgliederstatistik zählt nur Mitglieder

Förderer- und Partner-Accounts sind aufgenommen, aber keine Mitglieder und
gehören nicht in die Zahlen des Bundesvorstands (Spec §4).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# PR 3 — Die Rechte-Schicht (Branch `feat/rechte-schicht`)

### Task 8: Dateien und Ordner-Bereitstellung

**Files:**

- Modify: `modules/files/src/permissions.ts` (`canRead`, Fall `members_all`)
- Modify: `modules/files/src/services/folders.ts` (`ensureFolders`, `provisionGroupFolders`)
- Modify: `modules/files/src/subscribers.ts`
- Test: `modules/files/src/permissions.test.ts`, `modules/files/src/index.test.ts`

**Interfaces:**

- Consumes: `CurrentMember.isBdasMember` (Task 4), `GroupKind` aus `@bdas/groups`.
- Produces: `provisionGroupFolders(db, groupId, groupName, kind: GroupKind)` — vierter Parameter neu.

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

In `modules/files/src/permissions.test.ts`:

```typescript
it("der föderationsweite Mitgliederordner ist Mitgliedern vorbehalten (Spec §4)", () => {
  const folder = makeFolder({ scope: "members_all", groupId: null });
  const foerderer = { ...me([]), isBdasMember: false, primaryGroupKind: "netzwerk" as const };
  expect(canRead(folder, foerderer)).toBe(false);
  expect(canRead(folder, me([]))).toBe(true);
});
```

`me(...)` ist der bestehende Helfer der Datei; er liefert seit Task 4 `isBdasMember: true`. `makeFolder` entsprechend dem in der Datei vorhandenen Fixture-Helfer verwenden.

In `modules/files/src/index.test.ts`:

```typescript
it("legt für eine netzwerk-Gruppe keine Ordner an (Spec §5.3)", async () => {
  await t.client`
    INSERT INTO groups (id, slug, name, city, kind, status)
    VALUES ('grp_nw', 'netzwerk', 'BDAS Netzwerk', NULL, 'netzwerk', 'active')
  `;
  await provisionGroupFolders(t.db, "grp_nw", "BDAS Netzwerk", "netzwerk");
  const rows = await t.client`SELECT id FROM folders WHERE group_id = 'grp_nw'`;
  expect(rows).toHaveLength(0);
});
```

Die Migrationsliste dieser Datei um `["..", "..", "groups", "migrations", "0008_group_kind_netzwerk.sql"]` ergänzen.

- [ ] **Step 2: Tests laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/files/src/permissions.test.ts modules/files/src/index.test.ts
```

Erwartet: FAIL — der Förderer darf lesen, und `provisionGroupFolders` nimmt drei Parameter.

- [ ] **Step 3: Die Leseregel umstellen**

`modules/files/src/permissions.ts`:

```typescript
    case "members_all":
      // Mitglieder, nicht „aufgenommene Accounts": Förderer und
      // Partnerorganisationen haben hier nichts zu suchen (Spec §4).
      return me.isBdasMember;
```

- [ ] **Step 4: Die Bereitstellung an die Art binden**

`modules/files/src/services/folders.ts`:

```typescript
/** Create the two per-group folders for one group. Idempotent.
 *  Nur für Hochschulgruppen: eine andere Art hat keinen Vorstand, der den
 *  Vorstandsordner füllen könnte, und keine Mitglieder für den Mitglieder-
 *  ordner (Spec §5.3). */
export async function provisionGroupFolders(
  db: Db,
  groupId: string,
  groupName: string,
  kind: GroupKind,
): Promise<void> {
  if (kind !== "hochschulgruppe") return;
  // … unverändert
}
```

In `ensureFolders` die Schleife auf Hochschulgruppen einschränken und die Art durchreichen:

```typescript
for (const g of groups) {
  await provisionGroupFolders(db, g.id, g.name, g.kind);
}
```

`GroupKind` aus `@bdas/groups` importieren.

`modules/files/src/subscribers.ts`:

```typescript
const group = await getGroup(db, e.groupId);
const name = group?.name ?? e.slug;
// Ohne Gruppenzeile ist die Art unbekannt — dann nichts anlegen, statt
// Hochschulgruppe zu raten.
if (!group) return;
await provisionGroupFolders(db, e.groupId, name, group.kind);
```

- [ ] **Step 5: Tests, Typecheck**

```bash
pnpm exec vitest run modules/files/src/permissions.test.ts modules/files/src/index.test.ts modules/files/src/folder-writes.test.ts modules/files/src/folder-nesting-schema.test.ts
pnpm -r --no-bail typecheck
```

Erwartet: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/files/src
git commit -m "$(cat <<'EOF'
feat(files): Mitgliederordner nur für Mitglieder, keine Ordner für fremde Gruppenarten

members_all prüft isBdasMember statt „Konto aufgenommen". Eine netzwerk-
oder affiliate-Gruppe bekommt keine Ordner: kein Vorstand, keine Mitglieder.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Blog-Kommentare nur für Mitglieder

**Files:**

- Modify: `apps/web/app/_blog/access.ts:54` (`canComment`)
- Test: `apps/web/app/_blog/access.test.ts`

**Interfaces:**

- Consumes: `CurrentMember.isBdasMember`.
- Produces: keine neue Schnittstelle.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```typescript
it("ein Förderer-Account darf nicht kommentieren (Spec §4)", () => {
  const foerderer: CurrentMember = {
    ...memberWithStatus("active"),
    primaryGroupKind: "netzwerk",
    isBdasMember: false,
  };
  expect(canComment(foerderer)).toBe(false);
});
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run apps/web/app/_blog/access.test.ts -t "Förderer-Account darf nicht kommentieren"
```

Erwartet: FAIL — `canComment` prüft nur den Status.

- [ ] **Step 3: Die Prüfung umstellen**

```typescript
/**
 * Eligible to COMMENT (read or write): a BDAS member. Seit ADR 0045 ist das
 * `isBdasMember`, nicht mehr `status === "active"` — ein Förderer- oder
 * Partner-Account ist aufgenommen, aber kein Mitglied. Alumni bleiben ohne
 * Sonderfall eingeschlossen (ADR 0043).
 */
export function canComment(me: CurrentMember | null): boolean {
  return me !== null && me.isBdasMember;
}
```

- [ ] **Step 4: Tests laufen lassen**

```bash
pnpm exec vitest run apps/web/app/_blog/access.test.ts
```

Erwartet: PASS, inklusive des bestehenden Alumnus-Tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_blog
git commit -m "$(cat <<'EOF'
feat(web): Blog-Kommentare nur für Mitglieder

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Die Event-Anmeldung prüft die Sichtbarkeit (Sicherheitsfix)

**Files:**

- Modify: `apps/web/app/events/[id]/actions.ts:32-46` (`registerAction`)
- Test: `apps/web/app/events/[id]/actions.test.ts`

**Interfaces:**

- Consumes: `getEvent(db, id, viewer)` — liefert `null`, wenn `canView` falsch ist; `viewerFrom` aus `apps/web/lib/event-viewer.ts`.
- Produces: keine neue Schnittstelle.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `apps/web/app/events/[id]/actions.test.ts`, im Stil der dort vorhandenen Mocks:

```typescript
it("weist eine Anmeldung ab, die der Anmeldende gar nicht sehen darf (Spec §5.4)", async () => {
  // members_only, Account ist pending → getEvent liefert für diesen Viewer null
  const form = new FormData();
  form.set("eventId", "evt_members_only");

  const res = await registerAction({}, form);

  expect(res).toEqual({ error: "Veranstaltung nicht gefunden." });
  expect(registerMemberMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run "apps/web/app/events/[id]/actions.test.ts"
```

Erwartet: FAIL — die Aktion meldet an, ohne zu prüfen.

- [ ] **Step 3: Die Prüfung einbauen**

```typescript
export async function registerAction(_prev: RegState, formData: FormData): Promise<RegState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = String(formData.get("eventId") ?? "");
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) return { error: "Anmeldung erforderlich." };
  if (!me.member) return { error: "Bitte lege zuerst dein Profil an." };
  // Bis zur Aufnahme meldet sich niemand an — auch nicht zu einer öffentlichen
  // Veranstaltung: dafür gibt es die Gastanmeldung.
  if (me.member.status !== "active") {
    return { error: "Das geht erst, wenn dein Konto freigegeben ist." };
  }
  // Sichtbarkeit ist Autorisierung: der Service ist auth-agnostisch, die
  // Aktion ist die Durchsetzungsstelle. Ohne diese Zeile meldet sich jede*r
  // mit der Event-ID zu members_only- und fremden group_only-Terminen an.
  const event = await getEvent(getDb(), eventId, viewerFrom(me));
  if (!event) return { error: "Veranstaltung nicht gefunden." };

  try {
    await registerMember(getDb(), eventId, me.member.id);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  revalidate(eventId);
  return { ok: true };
}
```

`getEvent` aus `@bdas/events-module` und `viewerFrom` aus `../../../lib/event-viewer` importieren (den in der Datei bereits verwendeten Importpfad für `lib/` übernehmen).

- [ ] **Step 4: Tests, Typecheck, Lint**

```bash
pnpm exec vitest run "apps/web/app/events/[id]/actions.test.ts" apps/web/lib/event-viewer.test.ts
pnpm -r --no-bail typecheck
pnpm lint
```

Erwartet: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/events/[id]"
git commit -m "$(cat <<'EOF'
fix(web): die Event-Anmeldung prüft die Sichtbarkeit

Bisher genügte die Event-ID plus ein Profil: eine pending-Bewerbung konnte
sich zu members_only- und fremden group_only-Terminen anmelden. Die Aktion
prüft jetzt Aufnahme und canView, der Service bleibt auth-agnostisch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# PR 4 — Ordnerfreigabe pro Person (Branch `feat/ordnerfreigabe`)

### Task 11: Tabelle, Services und die Prüfung

**Files:**

- Create: `modules/files/migrations/0005_folder_member_grants.sql`
- Create: `modules/files/src/services/folder-access.ts`
- Modify: `modules/files/src/schema.ts` (Drizzle-Tabelle)
- Modify: `modules/files/src/permissions.ts` (`canRead`, `canWrite`)
- Modify: `modules/files/src/services/files.ts`, `modules/files/src/services/folders.ts` (Freigaben laden und durchreichen)
- Modify: `modules/files/src/index.ts` (Exporte)
- Test: `modules/files/src/folder-access.test.ts` (neu), `modules/files/src/permissions.test.ts`

**Interfaces:**

- Consumes: `CurrentMember`, `folders`-Tabelle.
- Produces:
  - `grantFolderAccess(db, folderId, memberId, opts: { canWrite?: boolean }, actor: Actor): Promise<void>`
  - `revokeFolderAccess(db, folderId, memberId, actor: Actor): Promise<void>`
  - `listFolderAccess(db, folderId): Promise<Array<{ memberId: string; canWrite: boolean }>>`
  - `loadFolderAccess(db, memberId: string | null): Promise<ReadonlyMap<string, boolean>>`
  - `canRead(folder, me, access?)` / `canWrite(folder, me, access?)` — dritter Parameter neu, Vorgabe leer

- [ ] **Step 1: Das Schema der Migration schreiben**

Zuerst `modules/files/migrations/0002_rls_lockdown.sql` lesen und dessen Reihenrichtlinien-Muster (Row-Level Security) übernehmen — die neue Tabelle wird genauso abgeriegelt wie die bestehenden.

`modules/files/migrations/0005_folder_member_grants.sql`:

```sql
-- Files module — Ordnerfreigabe pro Person.
--
-- Die fünf Scopes beantworten „welche Gruppe, welches Gremium". Sie
-- beantworten nicht „diese eine Person darf in diesen einen Ordner" — das
-- braucht die genehmigte BDAJ-Spec für Funktionär*innen, die mit einzelnen
-- Hochschulgruppen zusammenarbeiten (Spec 2026-09-16 §5.3).
--
-- Vergeben darf nur der Bundesvorstand. Eine Freigabe ergänzt die Scope-Regel,
-- sie ersetzt sie nie: wer über den Scope lesen darf, verliert das hier nicht.

CREATE TABLE folder_member_grants (
  id          text PRIMARY KEY,
  folder_id   text NOT NULL REFERENCES folders (id) ON DELETE CASCADE,
  member_id   text NOT NULL,
  can_write   boolean NOT NULL DEFAULT false,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  text NOT NULL,
  revoked_at  timestamptz,
  revoked_by  text
);

-- Eine offene Freigabe je (Ordner, Person); widerrufene Zeilen bleiben als
-- Protokoll liegen.
CREATE UNIQUE INDEX folder_member_grants_open_idx
  ON folder_member_grants (folder_id, member_id)
  WHERE revoked_at IS NULL;

CREATE INDEX folder_member_grants_member_idx
  ON folder_member_grants (member_id)
  WHERE revoked_at IS NULL;
```

Darunter die `ENABLE ROW LEVEL SECURITY`-Zeilen nach dem Muster aus `0002_rls_lockdown.sql` ergänzen.

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

`modules/files/src/folder-access.test.ts` (Aufbau und Migrationsliste aus `modules/files/src/index.test.ts` übernehmen, plus die neue `0005`-Zeile):

```typescript
it("öffnet genau einen Ordner für genau eine Person", async () => {
  const { folderId, memberId } = await seedGroupFolderAndOutsider(t);
  const outsider = await currentMemberFor(t, memberId); // isBdasMember: false

  expect(canRead(folderFrom(t, folderId), outsider, await loadFolderAccess(t.db, memberId))).toBe(
    false,
  );

  await grantFolderAccess(t.db, folderId, memberId, { canWrite: false }, BOARD);
  const access = await loadFolderAccess(t.db, memberId);
  expect(canRead(folderFrom(t, folderId), outsider, access)).toBe(true);
  expect(canWrite(folderFrom(t, folderId), outsider, access)).toBe(false);

  await revokeFolderAccess(t.db, folderId, memberId, BOARD);
  expect(canRead(folderFrom(t, folderId), outsider, await loadFolderAccess(t.db, memberId))).toBe(
    false,
  );
});

it("nur der Bundesvorstand vergibt Freigaben", async () => {
  const { folderId, memberId } = await seedGroupFolderAndOutsider(t);
  await expect(
    grantFolderAccess(t.db, folderId, memberId, {}, LEAD_OF_OTHER_GROUP),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
```

Die Helfer `seedGroupFolderAndOutsider`, `currentMemberFor` und `folderFrom` in der Testdatei definieren; `BOARD` und `LEAD_OF_OTHER_GROUP` nach dem Muster aus `modules/files/src/folder-writes.test.ts`.

- [ ] **Step 3: Tests laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/files/src/folder-access.test.ts
```

Erwartet: FAIL — die Services existieren nicht.

- [ ] **Step 4: Drizzle-Tabelle ergänzen**

`modules/files/src/schema.ts`:

```typescript
export const folderMemberGrants = pgTable("folder_member_grants", {
  id: text("id").primaryKey(),
  folderId: text("folder_id").notNull(),
  memberId: text("member_id").notNull(),
  canWrite: boolean("can_write").notNull().default(false),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  grantedBy: text("granted_by").notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by"),
});
```

- [ ] **Step 5: Die Services schreiben**

`modules/files/src/services/folder-access.ts`:

```typescript
/**
 * Ordnerfreigabe pro Person (Spec 2026-09-16 §5.3). Ergänzt die Scope-Regeln
 * um „diese Person darf in diesen Ordner" — der Weg, auf dem BDAJ-
 * Funktionär*innen an einzelnen Ordnern mitarbeiten, ohne Mitglied zu sein.
 * Vergeben und widerrufen darf nur der Bundesvorstand.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ForbiddenError, NotFoundError } from "@bdas/errors";
import { createId } from "@bdas/id";
import { isFederalBoard, type Grant } from "@bdas/members";

import { folderMemberGrants, folders } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;
export type Actor = { readonly userId: string; readonly grants: ReadonlyArray<Grant> };

const EMPTY: ReadonlyMap<string, boolean> = new Map();

function requireFederal(actor: Actor): void {
  if (!isFederalBoard(actor.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand gibt Ordner für einzelne Personen frei.");
  }
}

export async function grantFolderAccess(
  db: Db,
  folderId: string,
  memberId: string,
  opts: { canWrite?: boolean },
  actor: Actor,
): Promise<void> {
  requireFederal(actor);
  const folder = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
  if (!folder[0]) throw new NotFoundError("Ordner nicht gefunden.");

  const open = await db
    .select({ id: folderMemberGrants.id })
    .from(folderMemberGrants)
    .where(
      and(
        eq(folderMemberGrants.folderId, folderId),
        eq(folderMemberGrants.memberId, memberId),
        isNull(folderMemberGrants.revokedAt),
      ),
    )
    .limit(1);
  if (open[0]) {
    await db
      .update(folderMemberGrants)
      .set({ canWrite: opts.canWrite ?? false })
      .where(eq(folderMemberGrants.id, open[0].id));
    return;
  }

  await db.insert(folderMemberGrants).values({
    id: createId("fmg"),
    folderId,
    memberId,
    canWrite: opts.canWrite ?? false,
    grantedBy: actor.userId,
  });
}

export async function revokeFolderAccess(
  db: Db,
  folderId: string,
  memberId: string,
  actor: Actor,
): Promise<void> {
  requireFederal(actor);
  await db
    .update(folderMemberGrants)
    .set({ revokedAt: sql`now()`, revokedBy: actor.userId })
    .where(
      and(
        eq(folderMemberGrants.folderId, folderId),
        eq(folderMemberGrants.memberId, memberId),
        isNull(folderMemberGrants.revokedAt),
      ),
    );
}

export async function listFolderAccess(
  db: Db,
  folderId: string,
): Promise<Array<{ memberId: string; canWrite: boolean }>> {
  const rows = await db
    .select({ memberId: folderMemberGrants.memberId, canWrite: folderMemberGrants.canWrite })
    .from(folderMemberGrants)
    .where(and(eq(folderMemberGrants.folderId, folderId), isNull(folderMemberGrants.revokedAt)));
  return rows.map((r) => ({ memberId: r.memberId, canWrite: r.canWrite }));
}

/** Alle offenen Freigaben einer Person als Ordner-ID → darf schreiben. */
export async function loadFolderAccess(
  db: Db,
  memberId: string | null,
): Promise<ReadonlyMap<string, boolean>> {
  if (!memberId) return EMPTY;
  const rows = await db
    .select({ folderId: folderMemberGrants.folderId, canWrite: folderMemberGrants.canWrite })
    .from(folderMemberGrants)
    .where(and(eq(folderMemberGrants.memberId, memberId), isNull(folderMemberGrants.revokedAt)));
  return new Map(rows.map((r) => [r.folderId, r.canWrite]));
}
```

- [ ] **Step 6: Die Prüfung erweitern**

`modules/files/src/permissions.ts` — beide Funktionen bekommen den optionalen dritten Parameter:

```typescript
const NO_ACCESS: ReadonlyMap<string, boolean> = new Map();

export function canRead(
  folder: Folder,
  me: CurrentMember,
  access: ReadonlyMap<string, boolean> = NO_ACCESS,
): boolean {
  // Eine persönliche Freigabe ergänzt die Scope-Regel (Spec §5.3).
  if (access.has(folder.id)) return true;
  // … unverändert
}

export function canWrite(
  folder: Folder,
  me: CurrentMember,
  access: ReadonlyMap<string, boolean> = NO_ACCESS,
): boolean {
  if (access.get(folder.id) === true) return true;
  // … unverändert
}
```

- [ ] **Step 7: Die Dateidienste reichen die Freigaben durch**

In `modules/files/src/services/folders.ts` (`listFolders`) und `modules/files/src/services/files.ts` (`requestUpload`, `confirmUpload`, `listFiles`, `folderFileCounts`, `getDownloadUrl`, `deleteFile`) jeweils vor der Prüfung:

```typescript
const access = await loadFolderAccess(db, forMember.member?.id ?? null);
```

und den Aufruf auf `canRead(folder, forMember, access)` bzw. `canWrite(folder, byMember, access)` erweitern. Die Signaturen der Dienste bleiben unverändert — die acht Aufrufstellen in `apps/web` werden nicht angefasst.

- [ ] **Step 8: Exporte**

`modules/files/src/index.ts`: `grantFolderAccess`, `revokeFolderAccess`, `listFolderAccess` exportieren. `loadFolderAccess` bleibt privat (nur die Dienste brauchen es).

- [ ] **Step 9: Tests, Typecheck, Lint**

```bash
pnpm exec vitest run modules/files/src/folder-access.test.ts modules/files/src/permissions.test.ts modules/files/src/index.test.ts modules/files/src/folder-writes.test.ts
pnpm -r --no-bail typecheck
pnpm lint
```

Erwartet: PASS, kein `skipped`.

- [ ] **Step 10: Commit**

```bash
git add modules/files
git commit -m "$(cat <<'EOF'
feat(files): Ordnerfreigabe pro Person

Ergänzt die fünf Scopes um „diese Person darf in diesen Ordner" — der Weg,
auf dem BDAJ-Funktionär*innen an einzelnen Ordnern mitarbeiten, ohne
Mitglied zu sein. Nur der Bundesvorstand vergibt, keine Oberfläche bisher.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

# PR 5 — Der Bundesvorstand nimmt auf (Branch `feat/board-aufnahme`)

### Task 12: „Als Alumnus aufnehmen" in „Ohne Gruppe"

**Files:**

- Modify: `apps/web/app/(board)/federal/pool/actions.ts`
- Modify: `apps/web/app/(board)/federal/pool/PoolTable.tsx`
- Modify: `apps/web/app/(board)/federal/pool/page.tsx`
- Test: `apps/web/app/(board)/federal/pool/PoolTable.test.tsx`

**Interfaces:**

- Consumes: `acceptAsAlumnus` aus `@bdas/members` (Task 5).
- Produces: `acceptAsAlumnusAction(userId: string): Promise<AcceptResult>` mit `AcceptResult = { ok: true } | { ok: false; error: string }`; `PoolRow` bekommt `acceptable: boolean`.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `apps/web/app/(board)/federal/pool/PoolTable.test.tsx`:

```typescript
it("bietet die Aufnahme nur für Bewerber:innen an und meldet den Fehler des Servers", async () => {
  const rows: PoolRow[] = [
    {
      memberId: "mem_1",
      userId: "usr_1",
      name: "E. Ehemalig",
      uni: "RWTH",
      days: 3,
      kind: "Bewerber:in",
      hasProfile: true,
      deletable: false,
      acceptable: true,
    },
  ];
  const onAccept = vi.fn().mockResolvedValue({ ok: false, error: "Keine Berechtigung." });

  render(<PoolTable rows={rows} onDelete={vi.fn()} onAcceptAlumnus={onAccept} />);
  await userEvent.click(screen.getByRole("button", { name: /Als Alumnus aufnehmen/i }));

  expect(onAccept).toHaveBeenCalledWith("usr_1");
  expect(await screen.findByText("Keine Berechtigung.")).toBeVisible();
});
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run "apps/web/app/(board)/federal/pool/PoolTable.test.tsx"
```

Erwartet: FAIL — die Eigenschaft `onAcceptAlumnus` und der Knopf existieren nicht.

- [ ] **Step 3: Die Server-Aktion schreiben**

In `apps/web/app/(board)/federal/pool/actions.ts`:

```typescript
export type AcceptResult = { ok: true } | { ok: false; error: string };

/**
 * Nimmt eine Person ohne Gruppe als Alumnus auf (Spec 2026-09-16 §5.6). Jede
 * Regel wird im Service noch einmal geprüft; der Knopf ist eine Bequemlichkeit,
 * nicht das Tor.
 */
export async function acceptAsAlumnusAction(userId: string): Promise<AcceptResult> {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me || !canSeeFederalScope(me.grants)) return { ok: false, error: "Keine Berechtigung." };

  const member = await getMemberByUserId(db, userId);
  if (!member) return { ok: false, error: "Person nicht gefunden." };

  try {
    await acceptAsAlumnus(db, member.id, { userId: me.user.id, grants: me.grants });
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/federal/pool");
  return { ok: true };
}
```

`acceptAsAlumnus` und `isAppError` importieren.

- [ ] **Step 4: Tabelle und Seite**

`PoolTable.tsx`: `PoolRow` um `readonly acceptable: boolean` ergänzen, die Eigenschaft `onAcceptAlumnus: (userId: string) => Promise<AcceptResult>` aufnehmen und in der Zeile — neben dem Löschknopf — einen Knopf „Als Alumnus aufnehmen" rendern, wenn `row.acceptable`. Ergebnis wie beim Löschen über `setNotice` anzeigen; keine `window.confirm`-Abfrage, die Aktion ist umkehrbar (die Markierung lässt sich entziehen).

`page.tsx`: `acceptable: member.status === "pending"` in die Zeile aufnehmen und `onAcceptAlumnus={acceptAsAlumnusAction}` an die Tabelle geben.

- [ ] **Step 5: Tests, Typecheck, Lint**

```bash
pnpm exec vitest run "apps/web/app/(board)/federal/pool/PoolTable.test.tsx"
pnpm -r --no-bail typecheck
pnpm lint
```

Erwartet: PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(board)/federal/pool"
git commit -m "$(cat <<'EOF'
feat(web): der Bundesvorstand nimmt Ehemalige ohne Gruppe auf

Schließt die Lücke, an der Alumni bisher hängen blieben: der Service konnte
es längst, es fehlte der Knopf.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: `/account` für einen Account ohne Mitgliedschaft

**Files:**

- Modify: `apps/web/app/account/view-model.ts`
- Modify: `apps/web/app/account/page.tsx`
- Test: `apps/web/app/account/view-model.test.ts`

**Interfaces:**

- Consumes: `CurrentMember.primaryGroupKind`, `CurrentMember.isBdasMember`.
- Produces: `statusText(status, kind)` — die Statuszeile der Identitätskarte.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```typescript
describe("statusText", () => {
  it("nennt einen Förderer-Account beim Namen", () => {
    expect(statusText("active", "netzwerk")).toBe("Förderer:in");
  });

  it("lässt Mitglieder unverändert", () => {
    expect(statusText("active", "hochschulgruppe")).toBe("Aktives Mitglied");
    expect(statusText("pending", null)).toBe("Bewerbung eingereicht");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run apps/web/app/account/view-model.test.ts -t "statusText"
```

Erwartet: FAIL — `statusText` existiert nicht.

- [ ] **Step 3: Die Statuszeile schreiben**

In `apps/web/app/account/view-model.ts`:

```typescript
/**
 * Die Statuszeile der Identitätskarte. Ein Förderer-Account ist aufgenommen,
 * aber kein Mitglied (Spec §3.1) — „Aktives Mitglied" wäre dort schlicht
 * falsch.
 */
export function statusText(status: MemberStatus | null, kind: GroupKind | null): string | null {
  if (status === null) return null;
  if (status === "active" && kind === "netzwerk") return "Förderer:in";
  return STATUS_TEXT[status];
}
```

`buildIdentityRows` nimmt `kind: GroupKind | null` in seinen `IdentityInput` auf, benutzt `statusText` für die Statuszeile und lässt die Gruppenzeile für `kind === "netzwerk"` weg — eine Gruppe, die man nicht besuchen kann, gehört nicht in die Karte.

`apps/web/app/account/page.tsx` reicht `kind: me.primaryGroupKind` an `buildIdentityRows` durch.

- [ ] **Step 4: Tests, Typecheck, Lint**

```bash
pnpm exec vitest run apps/web/app/account/view-model.test.ts
pnpm -r --no-bail typecheck
pnpm lint
```

Erwartet: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/account
git commit -m "$(cat <<'EOF'
feat(web): /account nennt einen Förderer-Account beim Namen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: ADR 0045

**Files:**

- Create: `docs/decisions/0045-mitgliedschaft-statt-kontostatus.md`
- Modify: `modules/members/README.md`, `modules/groups/README.md`, `modules/files/README.md`

**Interfaces:**

- Consumes: nichts. Produces: nichts.

- [ ] **Step 1: Den ADR schreiben**

`docs/decisions/0045-mitgliedschaft-statt-kontostatus.md` mit: Kontext (die acht Lücken, verkürzt), Entscheidung in zwei Sätzen — (1) der ungescopte `member`-Grant folgt der Mitgliedschaft nach Spec §3.1, nicht dem Kontostatus; (2) der Beitritt zu einer `netzwerk`-Gruppe ist selbstbedient und damit die erste Ausnahme von ADR 0021/0031 —, sowie Konsequenzen: Alumni bleiben über die Markierung Mitglieder, Förderer behalten `members_only`-Veranstaltungen, die Statistik zählt sie nicht, und jede künftige interne Funktion sperrt Nicht-Mitglieder aus, sobald sie den `member`-Grant prüft.

- [ ] **Step 2: READMEs nachziehen**

- `modules/members/README.md`: Abschnitt zu `CurrentMember` um `isBdasMember` und `primaryGroupKind` ergänzen; `acceptAsAlumnus` in die öffentliche Schnittstelle; Hinweis, dass `grantRole` die Markierung nur für aufgenommene Personen vergibt.
- `modules/groups/README.md`: `netzwerk` in die Wertetabelle, `listGroupIdsByKind` in die öffentliche Schnittstelle, Satz zu den öffentlichen Flächen (nur Hochschulgruppen).
- `modules/files/README.md`: Abschnitt „Freigabe pro Person" mit der Tabelle, „nur Bundesvorstand", und dem Hinweis, dass eine Freigabe die Scope-Regeln ergänzt statt sie zu ersetzen.

- [ ] **Step 3: Formatierung prüfen**

```bash
pnpm exec prettier --check docs/decisions/0045-mitgliedschaft-statt-kontostatus.md modules/members/README.md modules/groups/README.md modules/files/README.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/decisions modules/members/README.md modules/groups/README.md modules/files/README.md
git commit -m "$(cat <<'EOF'
docs: ADR 0045 — Mitgliedschaft statt Kontostatus

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Abschluss

- [ ] **`/review` auf jedem PR.**
- [ ] **`/security-review` auf PR 2, 3 und 4** — Autorisierungsänderungen (CLAUDE.md §4).
- [ ] **Migrationen gegen eine frische Datenbank prüfen:** `pnpm db:down && pnpm db:up && pnpm db:migrate`. `infra/migrations/src/manifest.ts` listet Module; innerhalb eines Moduls laufen die Dateien lexikalisch — weder `groups/0008` noch `files/0005` brauchen dort einen Eintrag.
- [ ] **Nach dem Merge:** `pnpm groups:seed` gegen Produktion laufen lassen, damit die `netzwerk`-Zeile existiert, und prüfen, dass `deploy-migrations` beide Migrationen angewendet hat.
- [ ] **Reihenfolge:** PR 3 enthält den Sicherheitsfix der Event-Anmeldung und sollte nicht hinter PR 4 warten.
- [ ] **Anschluss, nicht Teil dieses Plans:** der Triage-Wizard (Einstiegspunkt für Förderer und Alumni) und die BDAJ-Umsetzung (Seed-Zeile, Freigabe-Oberfläche, `blog_author`, „nur eigene Inhalte"). Beide setzen auf `isBdasMember`, `groups.kind` und die Ordnerfreigabe auf.
