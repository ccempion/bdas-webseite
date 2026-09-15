# Nutzertypen-Fundament PR B: `groups.kind` als Achse — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Gruppe bekommt eine Art (`groups.kind`: `hochschulgruppe` | `affiliate`). Daraus leitet sich genau ein Flag auf dem Sitzungsprinzipal ab — `hasGroupScope` —, und genau eine erzwungene Regel: auf einer Nicht-Hochschulgruppe kann kein lokaler Vorstand sitzen.

**Architecture:** Das Fundament, nicht das Feature. Die genehmigte BDAJ-Spec löst denselben Mechanismus als Einzelfall; hier wird er zur Achse verallgemeinert, **solange BDAJ noch nicht implementiert ist**. Kein Discriminator auf `members`: „welche Art Account ist das" wird immer aus `primary_group.kind` abgeleitet, eine Quelle der Wahrheit. Die Modulgrenze bleibt sauber — `groups` besitzt die Spalte und exportiert einen schmalen Leser (`getGroupKind`); `members` konsumiert ihn über die öffentliche Schnittstelle und hängt ohnehin schon von `@bdas/groups` ab (keine Zirkularität: `groups` kennt `members` nicht).

**Tech Stack:** TypeScript, PostgreSQL (rohes SQL), Drizzle ORM, Next.js 14 App Router, Vitest (Unit + Integration gegen Docker-Postgres).

**Spec:** [`docs/superpowers/specs/2026-09-12-nutzertypen-fundament-design.md`](../specs/2026-09-12-nutzertypen-fundament-design.md) — Abschnitt 3 („PR B"). Vorgelagert und weiterhin gültig: `docs/superpowers/specs/2026-09-07-bdaj-funktionaere-design.md` (genehmigt, ohne Code).

---

## Global Constraints

- **Nur betroffene Tests ausführen.** Ausdrückliche Anweisung des Nutzers: niemals `pnpm test` über die ganze Suite. Immer nur die in der jeweiligen Task genannten Dateien.
- **Vitest erfasst zusätzlich Kopien unter `.claude/worktrees/`.** Ein Lauf über einen Pfad meldet deshalb u. U. zwei Testdateien. Nur die Datei ohne `worktrees/` im Pfad zählt.
- **Integrationstests brauchen Postgres:** `pnpm db:up` muss laufen, sonst überspringen sich die `describeIfDb`-Blöcke stillschweigend und melden fälschlich Grün. Vor jedem „Erwartet: PASS" prüfen, dass die Tests tatsächlich liefen und nicht `skipped` sind.
- **PR B legt keine Gruppenzeile an und schaltet keine Oberfläche frei.** Es gibt nach diesem PR keine `affiliate`-Zeile in der Datenbank, kein Feld im Gruppen-Formular und kein Label in der Oberfläche. Wer eine solche Gruppe anlegen will, braucht dafür eine eigene Spec (BDAJ, Partnerorganisationen). Alles, was diesem PR über Achse, Flag und Vorstandssperre hinaus zuwächst, ist Scope Creep.
- **Kein `netzwerk` im CHECK.** Spec §1 „Verworfene Alternativen": ein Enum-Wert ohne Zeilen und ohne Code verstößt gegen CLAUDE.md §6. Er kostet eine Migrationszeile, wenn seine Spec kommt.
- **Es gibt keine Hochschulgruppe ohne Stadt** (Festlegung der Föderation, 2026-09-12). Die Spec schreibt in §3.1 `CHECK (kind = 'hochschulgruppe' OR city IS NULL)` — diese Bedingung ließe eine leere Hochschulgruppe zu und widerspricht damit dem eigenen Testfall aus §3.5. Der Plan setzt deshalb die beidseitige Fassung: Hochschulgruppe **braucht** eine Stadt, jede andere Art darf **keine** haben. Diese Fassung ist entschieden und nicht mehr zur Disposition — sie nicht abschwächen.
- **Der Registrierungsprozess wird gerade neu konzipiert und ist NICHT Teil dieses PRs.** Die Richtung steht fest: man wählt zuerst, was man ist, und bekommt dann die dazu passenden Felder. `groups.kind` ist die Achse, auf der das später aufsetzt — mehr liefert PR B nicht. Insbesondere entsteht hier **kein** Auswahlfeld, **keine** Verzweigung im Registrierungsformular und **keine** Möglichkeit, bei der Anmeldung eine Art zu wählen. Wer beim Umsetzen den Drang verspürt, „dann kann man ja gleich …", hat die Grenze dieses PRs überschritten.
- **CLAUDE.md §1 Regel 1 und 8:** die Spalte gehört `modules/groups`. `modules/members` liest sie ausschließlich über `getGroupKind` aus `@bdas/groups`. Kein Deep Import, keine eigene Query auf `groups` aus `members` heraus.
- **CLAUDE.md §1 Regel 7:** die Migration liegt in `modules/groups/migrations/`, nächste freie Nummer ist `0007`.
- **CLAUDE.md §4:** Tests im selben PR. Dieser PR ändert Autorisierung (`grantRole` verweigert neuerdings etwas) → vor dem Merge `/security-review`.
- **ADR:** PR B braucht keinen eigenen ADR — die Achse ist von der genehmigten BDAJ-Spec und ADR 0021 gedeckt. Die Umbenennung `isAffiliate` → `hasGroupScope` wird in der BDAJ-Spec **nicht jetzt** nachgezogen; das passiert, wenn diese Spec implementiert wird (Spec §3.2). Ein Hinweissatz in `modules/groups/README.md` (Task 6) genügt.
- **Unabhängig von PR A.** Die beiden PRs teilen keine Datei außer `modules/members/src/index.ts` und `modules/members/src/services/roles.ts`. Werden sie parallel gebaut, ist dort mit einem Merge-Konflikt zu rechnen — er ist klein und rein additiv.
- **Branch:** `feat/groups-kind`. Bevorzugt abgezweigt von `origin/main`, **nachdem PR A gemergt ist** — dann liegen Spec und Plan dort bereits und dieser PR enthält nur Code. Soll PR B vorher starten, von `docs/alumnus-rolle-und-gruppen-kind` abzweigen und die Dokumentationsdateien beim Erstellen des PRs aus dem Diff halten, damit sie nicht zweimal zum Merge stehen.
- **Commit-Fußzeile:** jeder Commit endet mit `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Migration `0007_group_kind.sql`

**Files:**

- Create: `modules/groups/migrations/0007_group_kind.sql`
- Test: `modules/groups/src/index.test.ts` (neuer `describeIfDb`-Block am Dateiende)
- Modify: `modules/groups/src/index.test.ts:47-55` (Migrationsliste im `beforeEach`)

**Interfaces:**

- Consumes: die `groups`-Tabelle aus `modules/groups/migrations/0001_init.sql`.
- Produces:
  - Spalte `groups.kind text NOT NULL DEFAULT 'hochschulgruppe'`
  - Constraint `groups_kind_check CHECK (kind IN ('hochschulgruppe', 'affiliate'))`
  - `groups.city` ist nicht länger `NOT NULL`
  - Constraint `groups_kind_city_check` — Hochschulgruppe mit Stadt, jede andere Art ohne

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Ans Ende von `modules/groups/src/index.test.ts`, als eigener Block (er braucht rohes SQL, weil PR B keine Schnittstelle zum Anlegen einer `affiliate`-Zeile baut):

```typescript
describeIfDb("0007 group kind", () => {
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
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("setzt bestehende Zeilen auf hochschulgruppe", async () => {
    await t.client`
      INSERT INTO groups (id, slug, name, city) VALUES ('grp_h', 'aachen', 'BDAS Aachen', 'Aachen')
    `;
    const [row] = await t.client`SELECT kind FROM groups WHERE id = 'grp_h'`;
    expect(row!["kind"]).toBe("hochschulgruppe");
  });

  it("lässt eine affiliate-Zeile ohne Stadt zu", async () => {
    await t.client`
      INSERT INTO groups (id, slug, name, city, kind)
      VALUES ('grp_a', 'bdaj', 'BDAJ', NULL, 'affiliate')
    `;
    const [row] = await t.client`SELECT city, kind FROM groups WHERE id = 'grp_a'`;
    expect(row!["city"]).toBeNull();
    expect(row!["kind"]).toBe("affiliate");
  });

  it("verlangt bei einer Hochschulgruppe weiterhin eine Stadt", async () => {
    await expect(
      t.client`
        INSERT INTO groups (id, slug, name, city) VALUES ('grp_x', 'ohne', 'Ohne Stadt', NULL)
      `,
    ).rejects.toThrow(/groups_kind_city_check/);
  });

  it("verbietet einer affiliate-Zeile eine Stadt", async () => {
    await expect(
      t.client`
        INSERT INTO groups (id, slug, name, city, kind)
        VALUES ('grp_y', 'mitstadt', 'Mit Stadt', 'Köln', 'affiliate')
      `,
    ).rejects.toThrow(/groups_kind_city_check/);
  });

  it("weist eine unbekannte Art ab", async () => {
    await expect(
      t.client`
        INSERT INTO groups (id, slug, name, city, kind)
        VALUES ('grp_z', 'netzwerk', 'Netzwerk', NULL, 'netzwerk')
      `,
    ).rejects.toThrow(/groups_kind_check/);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm db:up
pnpm exec vitest run modules/groups/src/index.test.ts -t "0007 group kind"
```

Erwartet: FAIL bereits im `beforeEach` mit `ENOENT: no such file or directory ... 0007_group_kind.sql`.

- [ ] **Step 3: Die Migration schreiben**

`modules/groups/migrations/0007_group_kind.sql`:

```sql
-- Groups module — die Art einer Gruppe als Achse.
--
-- Bis hierher war jede Gruppe eine Hochschulgruppe. Mit `kind` bekommt die
-- Plattform eine Achse für Accounts, deren Zuhause keine Hochschulgruppe ist:
-- BDAJ-Funktionär*innen und weitere Partnerorganisationen (Spec
-- 2026-09-12-nutzertypen-fundament-design.md §3, auf Grundlage der
-- genehmigten BDAJ-Spec vom 2026-09-07).
--
-- `netzwerk` (Interessierte ohne Hochschulgruppe) fehlt hier bewusst: ein
-- Enum-Wert ohne Zeilen und ohne Code wäre eine spekulative Abstraktion
-- (CLAUDE.md §6). Er kostet eine Migrationszeile, wenn seine Spec kommt.

ALTER TABLE groups
  ADD COLUMN kind text NOT NULL DEFAULT 'hochschulgruppe';

-- Wie groups_status_check: ein CHECK statt eines Postgres-Enums hält die
-- Wertemenge gegen Seed-Skripte und Handarbeit ehrlich und bleibt ein
-- einzeiliges drop+recreate, wenn eine Art dazukommt.
ALTER TABLE groups
  ADD CONSTRAINT groups_kind_check
  CHECK (kind IN ('hochschulgruppe', 'affiliate'));

-- Eine Partnerorganisation hat keine Stadt — sie ist nicht verortet. Eine
-- Hochschulgruppe hat immer eine; das war bis hierher durch NOT NULL
-- abgesichert und bleibt es, nur jetzt abhängig von der Art.
ALTER TABLE groups ALTER COLUMN city DROP NOT NULL;

ALTER TABLE groups
  ADD CONSTRAINT groups_kind_city_check
  CHECK (
    (kind = 'hochschulgruppe' AND city IS NOT NULL)
    OR (kind <> 'hochschulgruppe' AND city IS NULL)
  );
```

- [ ] **Step 4: Test laufen lassen, Grün bestätigen**

```bash
pnpm exec vitest run modules/groups/src/index.test.ts -t "0007 group kind"
```

Erwartet: PASS, fünf Tests, keiner `skipped`.

- [ ] **Step 5: Prüfen, dass der bestehende Gruppen-Testblock unberührt grün bleibt**

```bash
pnpm exec vitest run modules/groups/src/index.test.ts
```

Erwartet: PASS. Der ältere `beforeEach` listet `0007` **nicht** — das ist beabsichtigt: er beschreibt weiter das Schema, gegen das die vorhandenen Services geschrieben wurden. Task 2 zieht ihn nach.

- [ ] **Step 6: Commit**

```bash
git add modules/groups/migrations/0007_group_kind.sql modules/groups/src/index.test.ts
git commit -m "$(cat <<'EOF'
feat(groups): die Art einer Gruppe als Spalte (groups.kind)

Achse für Accounts, deren Zuhause keine Hochschulgruppe ist. Bestehende
Zeilen werden per DEFAULT zu hochschulgruppe. `city` hängt ab jetzt an
der Art: Hochschulgruppe mit, jede andere Art ohne.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `GroupKind` im Domänentyp, nullbare `city`, `getGroupKind`

**Files:**

- Modify: `modules/groups/src/schema.ts:9,15`
- Modify: `modules/groups/src/types.ts:6,19,26`
- Modify: `modules/groups/src/services/get.ts:11-22` (Mapper + neuer Service)
- Modify: `modules/groups/src/services/list.ts:22,36-38`
- Modify: `modules/groups/src/services/manage.ts:88,113`
- Modify: `modules/groups/src/index.ts:11,18`
- Modify: `modules/groups/src/index.test.ts:47-55` (Migrationsliste des bestehenden Blocks)
- Test: `modules/groups/src/index.test.ts`

**Interfaces:**

- Consumes: die Spalte aus Task 1.
- Produces:
  - `type GroupKind = "hochschulgruppe" | "affiliate"`
  - `Group.kind: GroupKind`, `Group.city: string | null`, `GroupSummary` erbt beides über `Pick`
  - `getGroupKind(db: Db, id: string): Promise<GroupKind | null>` — liest **nur** die Spalte `kind`. Bewusst schmal: `modules/members` bekommt damit Zugriff auf die Achse, ohne dass dessen Test-Datenbank die vollständige `groups`-Tabelle (Location, Banner, Link-Guard) nachbauen müsste.

`CreateGroupInput`/`UpdateGroupInput` bleiben **unverändert** — `city` bleibt dort Pflicht und `kind` fehlt. Das ist die Umsetzung von „PR B legt keine Gruppenzeile an": über die Oberfläche entsteht weiterhin ausschließlich eine Hochschulgruppe, und die trägt per DEFAULT die richtige Art.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `modules/groups/src/index.test.ts`, im **bestehenden** `describeIfDb("groups integration")`-Block, `"0007_group_kind.sql"` an die Migrationsliste anhängen und diesen Test ergänzen:

```typescript
it("liefert die Art der Gruppe mit und liest sie einzeln (Spec §3.1/§3.2)", async () => {
  const created = await createGroup(t.db, {
    slug: "koeln",
    name: "BDAS Köln",
    city: "Köln",
  });
  expect(created.kind).toBe("hochschulgruppe");

  const fetched = await getGroupBySlug(t.db, "koeln");
  expect(fetched?.kind).toBe("hochschulgruppe");
  expect(await getGroupKind(t.db, created.id)).toBe("hochschulgruppe");

  await t.client`
      INSERT INTO groups (id, slug, name, city, kind)
      VALUES ('grp_bdaj', 'bdaj', 'BDAJ', NULL, 'affiliate')
    `;
  expect(await getGroupKind(t.db, "grp_bdaj")).toBe("affiliate");
  const affiliate = await getGroupBySlug(t.db, "bdaj");
  expect(affiliate?.kind).toBe("affiliate");
  expect(affiliate?.city).toBeNull();

  expect(await getGroupKind(t.db, "grp_gibt_es_nicht")).toBeNull();
});

it("führt eine Gruppe ohne Stadt in listGroups mit auf", async () => {
  await t.client`
      INSERT INTO groups (id, slug, name, city, kind, status)
      VALUES ('grp_bdaj2', 'bdaj2', 'BDAJ Zwei', NULL, 'affiliate', 'active')
    `;
  const list = await listGroups(t.db, { status: "active" });
  const entry = list.find((g) => g.slug === "bdaj2");
  expect(entry).toBeDefined();
  expect(entry?.city).toBeNull();
  expect(entry?.kind).toBe("affiliate");
});
```

`getGroupKind` mit in den Importkopf der Testdatei aufnehmen.

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/groups/src/index.test.ts -t "liefert die Art der Gruppe"
```

Erwartet: FAIL beim Import — `getGroupKind` existiert nicht.

- [ ] **Step 3: Schema und Typen**

`modules/groups/src/schema.ts`:

```typescript
    city: text("city"),
```

und in der Spaltenliste, direkt hinter `status`:

```typescript
    kind: text("kind").notNull().default("hochschulgruppe"),
```

`modules/groups/src/types.ts`:

```typescript
export type GroupStatus = "active" | "dormant" | "new" | "archived";

/**
 * Die Art einer Gruppe. `hochschulgruppe` ist die Regel und der Vorgabewert;
 * `affiliate` ist eine Partnerorganisation (BDAJ und weitere) — ein Zuhause
 * für Accounts ohne Hochschulgruppen-Scope. Die Art entscheidet zwei Dinge:
 * ob die Gruppe verortet ist (`city`), und ob auf ihr ein lokaler Vorstand
 * sitzen darf (siehe @bdas/members `grantRole`).
 */
export type GroupKind = "hochschulgruppe" | "affiliate";
```

sowie im `Group`-Typ:

```typescript
  /** null nur bei einer nicht verorteten Art (`affiliate`) — bei einer
   *  Hochschulgruppe garantiert der DB-Constraint einen Wert. */
  readonly city: string | null;
  readonly kind: GroupKind;
```

und die Zusammenfassung:

```typescript
export type GroupSummary = Pick<
  Group,
  "id" | "slug" | "name" | "city" | "status" | "location" | "kind"
>;
```

- [ ] **Step 4: Mapper und den neuen Leser**

`modules/groups/src/services/get.ts` — im `row2group` `kind: r.kind as GroupKind` ergänzen, den Typimport erweitern, und ans Dateiende:

```typescript
/**
 * Nur die Art einer Gruppe. Bewusst schmal statt `getGroup(...).kind`: das
 * ist der einzige Zugriff, den `@bdas/members` auf diese Tabelle braucht
 * (CLAUDE.md §1 Regel 2), und eine Ein-Spalten-Projektion hält dessen
 * Test-Datenbank frei davon, das vollständige Gruppen-Schema nachzubauen.
 */
export async function getGroupKind(db: Db, id: string): Promise<GroupKind | null> {
  const rows = await db
    .select({ kind: groups.kind })
    .from(groups)
    .where(eq(groups.id, id))
    .limit(1);
  return rows[0] ? (rows[0].kind as GroupKind) : null;
}
```

`modules/groups/src/services/list.ts` — `kind: groups.kind` in die Projektion und `kind: r.kind as GroupKind` in den Mapper.

`modules/groups/src/services/manage.ts` — in `rowToGroup` (Zeile 88) `kind: r.kind as GroupKind` ergänzen. `toGroup` (Zeile 104 ff.) baut das Ergebnis aus validiertem Eingabewert und kennt keine Art; es bekommt `kind: "hochschulgruppe"` fest, mit Begründung:

```typescript
    // Über diese Schnittstelle entsteht ausschließlich eine Hochschulgruppe:
    // CreateGroupInput kennt kein `kind`, die Spalte trägt denselben DEFAULT.
    // Eine `affiliate`-Zeile legt heute niemand an — das ist Sache der Spec,
    // die den jeweiligen Nutzertyp einführt.
    kind: "hochschulgruppe",
```

Dieselbe Ergänzung in `modules/groups/src/services/upsert.ts` (`toGroup`, Zeile 116 ff.).

- [ ] **Step 5: Öffentliche Schnittstelle**

`modules/groups/src/index.ts`:

```typescript
export { getGroup, getGroupBySlug, getGroupKind } from "./services/get";
```

```typescript
export type {
  Group,
  GroupSummary,
  GroupStatus,
  GroupKind,
  GroupLocation,
  JoinPolicy,
} from "./types";
```

- [ ] **Step 6: Tests laufen lassen, Grün bestätigen**

```bash
pnpm exec vitest run modules/groups/src/index.test.ts
pnpm --filter @bdas/groups typecheck
```

Erwartet: PASS und ein sauberer Modul-Typecheck. Der Typecheck der App bricht jetzt — das ist Task 3.

- [ ] **Step 7: Commit**

```bash
git add modules/groups/src
git commit -m "$(cat <<'EOF'
feat(groups): GroupKind im Domänentyp, city wird nullbar, getGroupKind

Die Art gehört ab jetzt zu Group und GroupSummary. getGroupKind ist der
schmale Leser, über den @bdas/members die Achse abfragt — eine Spalte,
damit dessen Test-Datenbank nicht das ganze Gruppen-Schema nachbaut.

CreateGroupInput/UpdateGroupInput bleiben unverändert: über die
Oberfläche entsteht weiterhin ausschließlich eine Hochschulgruppe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Die nullbare `city` durch die App ziehen

**Files:**

- Modify: `apps/web/app/_groups/pins.ts:6,18`
- Modify: `apps/web/app/(board)/gruppe/[slug]/profil/page.tsx:31`
- Modify: `apps/web/app/account/page.tsx:75`
- Modify: `apps/web/app/profil/page.tsx:37`
- Test: `apps/web/app/_groups/pins.test.ts`
- Test: `modules/dashboard-shell/src/scope.test.ts:7-31`

**Interfaces:**

- Consumes: `GroupSummary.city: string | null` und das neue Pflichtfeld `GroupSummary.kind` aus Task 2.
- Produces: keine neue Schnittstelle.

Diese Task ist compilergetrieben: `pnpm -r typecheck` zeigt die vollständige Liste. Die unten genannten Stellen sind die, die beim Planen gefunden wurden; meldet der Compiler weitere, werden sie nach demselben Muster behandelt. **Reine Anzeigestellen** (`{g.city}` in JSX) brauchen **keine** Änderung — React rendert `null` als nichts, und genau das ist richtig für eine Gruppe ohne Ort.

Zwei Sorten Bruch sind zu erwarten: die nullbare `city` (Übergaben an Pflichtfelder) und das neue Pflichtfeld `kind` in jedem `GroupSummary`-Literal. Letzteres betrifft ausschließlich Test-Fixtures — in `modules/dashboard-shell/src/scope.test.ts` bekommen alle drei Einträge `kind: "hochschulgruppe"`, in `apps/web/app/_groups/pins.test.ts` die beiden bestehenden ebenso.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `apps/web/app/_groups/pins.test.ts`, innerhalb des bestehenden `describe("toPins")`, ergänzen:

```typescript
it("lässt eine Gruppe ohne Stadt aus der Karte heraus", () => {
  const groups: GroupSummary[] = [
    {
      ...base,
      id: "grp_3",
      slug: "bdaj",
      name: "BDAJ",
      city: null,
      kind: "affiliate",
      location: { name: "Geschäftsstelle", address: "Irgendwo 1", lat: 52.52, lng: 13.405 },
    },
  ];
  expect(toPins(groups)).toEqual([]);
});
```

Der Fall ist bewusst mit gesetzter `location` konstruiert: sonst filterte ihn bereits die bestehende Bedingung heraus und der Test bewiese nichts. `base` in dieser Datei ist `{ id: "grp_1", status: "active" as const }` und braucht seit Task 2 zusätzlich ein `kind` — es wird hier pro Fixture gesetzt, die beiden bestehenden Fixtures bekommen `kind: "hochschulgruppe"`.

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run apps/web/app/_groups/pins.test.ts
```

Erwartet: FAIL (Typfehler oder ein Pin mit `city: null`) — je nachdem, ob `base` eine Location trägt.

- [ ] **Step 3: Die Kartenpins auf verortete Gruppen einschränken**

`apps/web/app/_groups/pins.ts` — der Pin-Typ behält `city: string`; gefiltert wird zusätzlich auf eine gesetzte Stadt:

```typescript
/**
 * Public projection for the map. Deliberately excludes the location's
 * name/address — they are editor-facing only (spec: address hidden publicly).
 * Eine Gruppe ohne Stadt steht nicht auf der Karte: `city` ist seit der
 * Achse `groups.kind` genau dann null, wenn die Gruppe nicht verortet ist.
 */
export function toPins(groups: readonly GroupSummary[]): GroupPin[] {
  return groups.flatMap((g) =>
    g.location && g.city !== null
      ? [{ slug: g.slug, name: g.name, city: g.city, lat: g.location.lat, lng: g.location.lng }]
      : [],
  );
}
```

- [ ] **Step 4: Die drei Formular-Übergaben absichern**

Alle drei reichen die Stadt an ein Feld weiter, das einen String erwartet:

`apps/web/app/(board)/gruppe/[slug]/profil/page.tsx:31` → `city: group.city ?? ""`
`apps/web/app/account/page.tsx:75` → `city: g.city ?? ""`
`apps/web/app/profil/page.tsx:37` → `city: g.city ?? ""`

Die Formulartypen (`GroupProfileForm`, `ProfileForm`, `Wizard`) behalten `city: string`. Sie bearbeiten ausschließlich Hochschulgruppen; `?? ""` ist dort die ehrliche Übersetzung von „kommt nicht vor".

- [ ] **Step 5: Typecheck und Tests laufen lassen**

```bash
pnpm -r typecheck
pnpm exec vitest run apps/web/app/_groups/pins.test.ts modules/dashboard-shell/src/scope.test.ts
```

Erwartet: beides sauber. Meldet der Typecheck weitere `city`-Stellen, dieselbe Unterscheidung anwenden: Anzeige bleibt, Übergabe an ein Pflichtfeld bekommt `?? ""`, ortsgebundene Logik filtert die Zeile heraus. Weitere `kind`-Meldungen sind Fixtures und bekommen `kind: "hochschulgruppe"`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_groups apps/web/app/account/page.tsx apps/web/app/profil/page.tsx "apps/web/app/(board)/gruppe/[slug]/profil/page.tsx" modules/dashboard-shell/src/scope.test.ts
git commit -m "$(cat <<'EOF'
refactor(web): Gruppen ohne Stadt in der Oberfläche vertragen

Anzeigestellen bleiben unverändert (React rendert null als nichts);
Formularfelder bekommen den leeren String; die Kartenpins verlangen
zusätzlich zur Location eine Stadt. Heute existiert keine solche
Gruppe — die Typen sagen ab jetzt trotzdem die Wahrheit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `hasGroupScope` auf `CurrentMember`

**Files:**

- Modify: `modules/members/src/services/me.ts:12-45`
- Modify: `modules/members/src/test-db.ts:16-30` (Migrationsliste)
- Modify: `modules/members/package.json` (nichts — `@bdas/groups` ist bereits Abhängigkeit; nur prüfen)
- Test: `modules/members/src/index.test.ts`

**Interfaces:**

- Consumes: `getGroupKind` aus `@bdas/groups` (Task 2).
- Produces: `CurrentMember` bekommt `readonly hasGroupScope: boolean` — wahr genau dann, wenn das Mitglied eine primäre Gruppe der Art `hochschulgruppe` hat.

Das ist die **einzige** Stelle, an der die Frage „hat dieser Account einen Hochschulgruppen-Scope" beantwortet wird. Events, Dateien, Blog und Verzeichnis fragen künftig nur dieses Flag ab — in PR B tut das noch keiner, und das ist richtig: das Fundament kommt zuerst.

Der Name weicht bewusst von `isAffiliate` in der BDAJ-Spec ab (Spec §3.2): unter der Achse ist das Flag nicht mehr BDAJ-spezifisch, und ein Name mit „affiliate" wird in dem Moment falsch, in dem die zweite Art existiert.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `modules/members/src/index.test.ts` ergänzen. Die Testdatenbank des Moduls kennt nur `groups/0001_init.sql` plus die in Schritt 4 ergänzte Kind-Migration, deshalb wird die `affiliate`-Zeile per rohem SQL gesetzt:

```typescript
it("hasGroupScope unterscheidet Hochschulgruppe, Partnerorganisation und keine Gruppe", async () => {
  await createGroup("grp_hs", "aachen");
  await t.client`
      INSERT INTO groups (id, slug, name, city, kind, status)
      VALUES ('grp_af', 'bdaj', 'BDAJ', NULL, 'affiliate', 'active')
    `;
  await createUser("usr_hs", "hs@example.de");
  await createUser("usr_af", "af@example.de");
  await createUser("usr_no", "no@example.de");

  await createProfile(t.db, {
    userId: "usr_hs",
    firstName: "H",
    lastName: "S",
    primaryGroupId: "grp_hs",
  });
  await createProfile(t.db, {
    userId: "usr_af",
    firstName: "A",
    lastName: "F",
    primaryGroupId: "grp_af",
  });
  await createProfile(t.db, { userId: "usr_no", firstName: "N", lastName: "O" });

  expect((await meFor("usr_hs"))?.hasGroupScope).toBe(true);
  expect((await meFor("usr_af"))?.hasGroupScope).toBe(false);
  expect((await meFor("usr_no"))?.hasGroupScope).toBe(false);
});
```

`meFor` ist eine Hilfsfunktion, die in dieser Datei noch fehlt. Sie umgeht `getCurrentUser` nicht — das würde eine Sitzung brauchen —, sondern prüft die abgeleitete Regel direkt. Wird das zu umständlich, ist der einfachere und gleichwertige Weg, die Ableitung in `me.ts` als exportierte reine Funktion zu isolieren und sie in `roles.unit.test.ts` zu testen:

```typescript
/** `hasGroupScope` aus der Art der primären Gruppe (Spec §3.2). Ein Mitglied
 *  ohne Gruppe hat keinen Scope — das ändert nichts am heutigen Verhalten,
 *  `canManageGroup` gibt für groupId null bereits nur dem Bundesvorstand recht. */
export function hasGroupScopeFor(kind: GroupKind | null): boolean {
  return kind === "hochschulgruppe";
}
```

Einer der beiden Wege genügt; der zweite ist der einfachere und wird empfohlen, wenn `meFor` mehr als zehn Zeilen braucht.

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/members/src/index.test.ts -t "hasGroupScope"
```

Erwartet: FAIL — `hasGroupScope` existiert auf `CurrentMember` nicht. Läuft der Test stattdessen schon im `beforeEach` auf `column "kind" of relation "groups" does not exist`, ist Schritt 4 vorzuziehen.

- [ ] **Step 3: `me.ts` erweitern**

```typescript
import { getCurrentUser, type CurrentUser } from "@bdas/auth";
import { ForbiddenError } from "@bdas/errors";
import { getGroupKind } from "@bdas/groups";

import { effectiveGrants, isFederalBoard } from "../roles";
import type { Grant, Member } from "../types";

import { getGrants, getMemberByUserId } from "./get";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type CurrentMember = {
  readonly user: CurrentUser;
  readonly member: Member | null;
  readonly grants: ReadonlyArray<Grant>;
  /**
   * Hat dieser Account einen Hochschulgruppen-Scope? Abgeleitet aus der Art
   * der primären Gruppe (Spec 2026-09-12 §3.2) — die EINZIGE Stelle, an der
   * die Frage beantwortet wird. Ohne Gruppe: false. Das ändert nichts am
   * heutigen Verhalten: `canManageGroup` lässt für groupId null ohnehin nur
   * den Bundesvorstand durch.
   */
  readonly hasGroupScope: boolean;
};

export async function getCurrentMember(
  db: Db,
  cookieValue: string | undefined,
): Promise<CurrentMember | null> {
  const user = await getCurrentUser(db, cookieValue);
  if (!user) return null;

  const member = await getMemberByUserId(db, user.id);
  const dbGrants = member ? await getGrants(db, member.id) : [];
  const kind = member?.primaryGroupId ? await getGroupKind(db, member.primaryGroupId) : null;
  return {
    user,
    member,
    grants: effectiveGrants(user.roles, member, dbGrants),
    hasGroupScope: kind === "hochschulgruppe",
  };
}
```

Die zusätzliche Abfrage läuft nur, wenn das Mitglied überhaupt eine Gruppe hat, und liest genau eine Spalte. Für eine anonyme Anfrage oder ein gruppenloses Mitglied entsteht keine zusätzliche Runde.

- [ ] **Step 4: Die Kind-Migration in die Testdatenbank des Moduls aufnehmen**

`modules/members/src/test-db.ts` — in `MEMBERS_TEST_MIGRATIONS`, direkt hinter der Zeile für `groups/0001_init.sql`:

```typescript
  ["..", "..", "groups", "migrations", "0007_group_kind.sql"],
```

Der Kommentar darüber wird ergänzt:

```typescript
/**
 * Private test harness für das members-Modul. Nicht aus index.ts exportiert.
 * Zieht die auth- und groups-Migrationen mit, weil die members-Tabellen auf
 * beide verweisen — von groups nur `0001_init` plus `0007_group_kind`: mehr
 * braucht `getGroupKind` nicht, und mehr nachzubauen wäre eine Kopplung an
 * ein fremdes Schema.
 */
```

Die Hilfsfunktion `createGroup` in derselben Datei bleibt unverändert; sie setzt eine Stadt und erzeugt damit eine gültige Hochschulgruppe.

- [ ] **Step 5: Aufrufer prüfen**

```bash
pnpm -r typecheck
```

`CurrentMember` wird an vielen Stellen konsumiert, aber nirgends per Objektliteral konstruiert — außer in Tests. Meldet der Typecheck ein fehlendes `hasGroupScope` in einem Test-Fixture (erwartete Kandidaten: `apps/web/app/_blog/access.test.ts`, `modules/files/src/permissions.test.ts`), dort `hasGroupScope: true` ergänzen; in diesen Tests geht es um Mitglieder einer Hochschulgruppe.

- [ ] **Step 6: Tests laufen lassen, Grün bestätigen**

```bash
pnpm exec vitest run modules/members/src/index.test.ts
pnpm exec vitest run apps/web/app/_blog/access.test.ts modules/files/src/permissions.test.ts
pnpm -r typecheck
```

Erwartet: alles PASS, kein `skipped` im Postgres-Block.

- [ ] **Step 7: Commit**

```bash
git add modules/members/src apps/web modules/files
git commit -m "$(cat <<'EOF'
feat(members): hasGroupScope auf CurrentMember

Abgeleitet aus der Art der primären Gruppe — die einzige Stelle, an der
die Frage „hat dieser Account einen Hochschulgruppen-Scope" beantwortet
wird. Noch fragt sie niemand ab; das Fundament kommt zuerst.

Der Name weicht bewusst von isAffiliate in der BDAJ-Spec ab: unter der
Achse ist das Flag nicht mehr BDAJ-spezifisch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Kein lokaler Vorstand auf einer Nicht-Hochschulgruppe

**Files:**

- Modify: `modules/members/src/services/roles.ts:80-95` (`grantRole`)
- Test: `modules/members/src/index.test.ts`

**Interfaces:**

- Consumes: `getGroupKind` aus `@bdas/groups`.
- Produces: `grantRole` wirft `ValidationError`, wenn `role === "local_board_lead"` und die Zielgruppe nicht `hochschulgruppe` ist.

Das ist die tragende Regel der Achse: eine Gruppe ohne lokalen Vorstand eskaliert ihre Beitrittsentscheidungen laut ADR 0021 automatisch an den Bundesvorstand (`canDecideJoinRequest` mit `groupHasLocalBoard === false`). Für Nicht-Hochschulgruppen wird dieser Zustand **erzwungen**, nicht gehofft — sonst unterliefe ein versehentlich vergebener Lead die Freigabe durch den Bundesvorstand.

`revokeRole` bleibt bewusst ohne diese Prüfung: einen Grant zu entziehen, den es nicht geben sollte, muss immer möglich sein.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `modules/members/src/index.test.ts`:

```typescript
it("verweigert local_board_lead auf einer Nicht-Hochschulgruppe (Spec §3.3)", async () => {
  await createGroup("grp_hs2", "bonn");
  await t.client`
      INSERT INTO groups (id, slug, name, city, kind, status)
      VALUES ('grp_af2', 'bdaj-zwei', 'BDAJ', NULL, 'affiliate', 'active')
    `;
  await createUser("usr_cand", "cand@example.de");
  const m = await createProfile(t.db, {
    userId: "usr_cand",
    firstName: "Kai",
    lastName: "Kandidat",
    primaryGroupId: "grp_hs2",
  });

  // Hochschulgruppe: unverändert erlaubt
  await grantRole(t.db, m.id, "local_board_lead", BOARD, "grp_hs2");

  // Partnerorganisation: verweigert, auch für den Bundesvorstand
  await expect(grantRole(t.db, m.id, "local_board_lead", BOARD, "grp_af2")).rejects.toMatchObject({
    code: "VALIDATION",
  });

  // die Delegiertenrollen bleiben von der Regel unberührt
  await grantRole(t.db, m.id, "file_manager", BOARD, "grp_af2");
});
```

Den Fehlercode aus `@bdas/errors` gegenprüfen: `ValidationError` trägt dort einen festen `code` — im Test den tatsächlichen Wert verwenden (`grep -n "code" core/errors/src/*.ts`).

- [ ] **Step 2: Test laufen lassen, Rotfärbung bestätigen**

```bash
pnpm exec vitest run modules/members/src/index.test.ts -t "Nicht-Hochschulgruppe"
```

Erwartet: FAIL — der zweite `grantRole` geht heute durch.

- [ ] **Step 3: Die Prüfung einbauen**

In `modules/members/src/services/roles.ts` den Import ergänzen:

```typescript
import { getGroupKind } from "@bdas/groups";
```

und in `grantRole`, **vor** dem `db.transaction`-Aufruf:

```typescript
export async function grantRole(
  db: Db,
  memberId: string,
  role: string,
  actor: Actor,
  groupId: string | null = null,
): Promise<Member> {
  requireValidRole(role);
  requireValidScope(role, groupId);
  requireCanGrant(actor, role, groupId);
  await requireBoardableGroup(role, groupId, db);

  return db.transaction(async (tx) => {
```

und die Prüfung selbst neben die anderen `require*`-Funktionen:

```typescript
/**
 * Ein lokaler Vorstand sitzt ausschließlich auf einer Hochschulgruppe
 * (Spec 2026-09-12 §3.3). Jede andere Art eskaliert ihre
 * Beitrittsentscheidungen laut ADR 0021 an den Bundesvorstand — das hängt
 * daran, dass `groupHasActiveLocalBoard` dort false liefert. Ein versehentlich
 * vergebener Lead würde diese Freigabe unterlaufen, deshalb wird der Zustand
 * erzwungen statt gehofft.
 *
 * Die Lesung läuft außerhalb der Transaktion: die Art einer Gruppe ist
 * faktisch unveränderlich, und `getGroupKind` nimmt eine Db, keine Tx.
 * `revokeRole` prüft bewusst NICHT — einen Grant, den es nicht geben sollte,
 * muss man immer entziehen können.
 */
async function requireBoardableGroup(role: Role, groupId: string | null, db: Db): Promise<void> {
  if (role !== "local_board_lead" || groupId === null) return;
  const kind = await getGroupKind(db, groupId);
  if (kind !== "hochschulgruppe") {
    throw new ValidationError("Nur eine Hochschulgruppe kann einen lokalen Vorstand haben.");
  }
}
```

`Role` und `ValidationError` sind in der Datei bereits importiert.

- [ ] **Step 4: Tests laufen lassen, Grün bestätigen**

```bash
pnpm exec vitest run modules/members/src/index.test.ts
pnpm exec vitest run modules/members/src/local-role-redesign.integration.test.ts modules/members/src/group-change.test.ts
pnpm -r typecheck
pnpm lint
```

Erwartet: alles PASS. Die beiden zusätzlich genannten Dateien vergeben `local_board_lead` in ihren Fixtures und sind die wahrscheinlichste Stelle, an der die neue Prüfung unbeabsichtigt zuschlägt — sie tun es gegen Gruppen aus `createGroup`, also gegen Hochschulgruppen, und bleiben grün. Tun sie es nicht, fehlt der Testdatenbank die Kind-Migration aus Task 4 Schritt 4.

- [ ] **Step 5: Commit**

```bash
git add modules/members/src/services/roles.ts modules/members/src/index.test.ts
git commit -m "$(cat <<'EOF'
feat(members): kein lokaler Vorstand auf einer Nicht-Hochschulgruppe

Die tragende Regel der Achse. Eine Gruppe ohne lokalen Vorstand
eskaliert ihre Beitrittsentscheidungen nach ADR 0021 an den
Bundesvorstand; ein versehentlich vergebener Lead würde das
unterlaufen. revokeRole prüft bewusst nicht.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: READMEs

**Files:**

- Modify: `modules/groups/README.md`
- Modify: `modules/members/README.md`

**Interfaces:**

- Consumes: nichts.
- Produces: nichts.

- [ ] **Step 1: `modules/groups/README.md` ergänzen**

Ein Abschnitt „Art einer Gruppe (`kind`)" mit:

- der Wertetabelle `hochschulgruppe` / `affiliate` und dem Hinweis, dass `netzwerk` bewusst fehlt, bis seine Spec kommt;
- der Kopplung an `city` (Hochschulgruppe mit, jede andere Art ohne — `groups_kind_city_check`);
- dem Satz, dass über `createGroup`/`upsertGroupBySlug` ausschließlich Hochschulgruppen entstehen und eine `affiliate`-Zeile Sache der Spec ist, die den jeweiligen Nutzertyp einführt;
- dem Verweis, dass `getGroupKind` der einzige für andere Module gedachte Zugang zur Spalte ist;
- einem Hinweis für die spätere BDAJ-Umsetzung: das dort als `isAffiliate` beschriebene Flag heißt hier `hasGroupScope` und lebt auf `CurrentMember` (`@bdas/members`), nicht in `groups`.

- [ ] **Step 2: `modules/members/README.md` ergänzen**

Zwei Sätze: `CurrentMember.hasGroupScope` ist die einzige Stelle, an der die Frage nach dem Hochschulgruppen-Scope beantwortet wird; und `grantRole` verweigert `local_board_lead` außerhalb einer Hochschulgruppe (mit Verweis auf ADR 0021).

- [ ] **Step 3: Formatierung prüfen**

```bash
pnpm exec prettier --check modules/groups/README.md modules/members/README.md
```

- [ ] **Step 4: Commit**

```bash
git add modules/groups/README.md modules/members/README.md
git commit -m "$(cat <<'EOF'
docs(groups,members): die Achse groups.kind in den READMEs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Abschluss

- [ ] **`/review` auf dem PR.**
- [ ] **`/security-review` auf dem PR** — `grantRole` verweigert neuerdings etwas, das ist eine Autorisierungsänderung (CLAUDE.md §4).
- [ ] **Migration prüfen:** `pnpm db:migrate:dry` und `pnpm db:migrate` gegen eine frische Datenbank (`pnpm db:down && pnpm db:up`). `infra/migrations/src/manifest.ts` listet Module, innerhalb eines Moduls laufen die Dateien lexikalisch — `0007_group_kind.sql` braucht dort **keinen** Eintrag.
- [ ] **Offen und bewusst nicht entschieden** (Spec §4, gehört in den PR-Text, nicht in den Code): zählt ein Account ohne Hochschulgruppe als „aktives Mitglied" in der föderationsweiten Statistik? Betrifft erst die Spec, die den ersten konkreten Nutzertyp einführt.
- [ ] **Anschluss, nicht Teil dieses PRs:** der neue Registrierungsprozess (erst den Nutzertyp wählen, dann die passenden Felder) wird derzeit konzipiert. Er setzt auf `groups.kind` und `hasGroupScope` auf — beide liegen nach diesem PR bereit. Im PR-Text darauf verweisen, damit beim Review klar ist, wofür das Fundament gegossen wurde.
