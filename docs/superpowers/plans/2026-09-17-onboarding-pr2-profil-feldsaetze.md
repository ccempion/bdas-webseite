# Onboarding-Wizard PR 2 — `profile`: Feldsätze je Nutzertyp — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@bdas/profile` speichert für jeden der vier Nutzertypen genau dessen Felder (Spec §4.3) und dazu die Studienfach-Kategorie; die Liste der Studienfächer ist als generierte Datei verfügbar.

**Architecture:** Eine neue Spalte `nutzertyp` entscheidet, welches zod-Schema gilt; ein beidseitiger DB-CHECK erzwingt die Pflichtfelder je Typ. Die vier Studierenden-Spalten werden nullable. `saveProfile` wählt das Schema nach dem mitgeschickten Typ, sonst nach dem gespeicherten, sonst `student` — so bleibt das Bearbeiten unter `/account` für bestehende Studierende unverändert. Die Studienfach-CSV wird wie die Hochschul-TSV per Skript in eine TypeScript-Datei übersetzt. Die App-Stellen, die heute nicht-leere Studierenden-Felder annehmen, werden auf `null` vorbereitet.

**Tech Stack:** TypeScript, PostgreSQL, Drizzle ORM, zod, Next.js 14 (nur Anpassungen), Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-16-onboarding-wizard-design.md`](../specs/2026-09-16-onboarding-wizard-design.md) — §4.3, §5.6 (Punkt `profile`), §8 Punkt 2.

## Global Constraints

- **Nur betroffene Tests ausführen.** Niemals `pnpm test` über die ganze Suite. Einzelne Dateien aus der Repo-Wurzel: `pnpm vitest run <pfad>`.
- **Vitest erfasst zusätzlich Kopien unter `.claude/worktrees/`.** Nur der Treffer ohne `worktrees/` im Pfad zählt.
- **Integrationstests brauchen Postgres:** vorher `pnpm db:up`; in der Ausgabe prüfen, dass nichts „skipped" ist.
- **CLAUDE.md §1 Regel 7:** Nächste freie Migration ist `profile/0004`.
- **Unabhängig von PR 1.** Dieser PR importiert nichts aus `@bdas/onboarding`. Die Namen der Nutzertypen (`student`, `alumnus`, `foerderer`, `bdaj`) stimmen absichtlich mit `UserType` aus PR 1 überein.
- **Kein Wizard.** Keine neuen Bildschirme; der alte Wizard unter `/profil` bleibt, bis PR 4 ihn entfernt.
- **`/account` bleibt für Studierende wie heute.** Für die anderen drei Typen zeigt die Seite in diesem PR nur die Zusammenfassung, ohne Bearbeiten-Formular (Nacharbeit, siehe Task 7).
- **Die Studienfach-Kategorie ist im Schema optional**, damit das bestehende Bearbeiten-Formular ohne Kategorie weiter speichert; fehlt sie beim Speichern, bleibt die gespeicherte erhalten. Der Wizard (PR 4) schickt sie immer mit.
- **`exactOptionalPropertyTypes` ist an.**
- **Branch:** `feat/profile-feldsaetze`, abgezweigt von `origin/main`. Vor dem Push `git log origin/main..HEAD` prüfen.
- **Commit-Fußzeile:** jeder Commit endet mit `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Dateistruktur

| Datei                                                     | Änderung                                        |
| --------------------------------------------------------- | ----------------------------------------------- |
| `modules/profile/data/studienfaecher.csv`                 | aus Branch `docs/studienfach-liste` übernommen  |
| `modules/profile/scripts/generate-studienfaecher.mjs`     | neu: CSV → TS                                   |
| `modules/profile/src/studienfaecher.generated.ts`         | neu, generiert                                  |
| `modules/profile/src/data.ts`                             | + Kategorien, BDAJ-Funktionen, `universityCity` |
| `modules/profile/scripts/generate-universities.mjs`       | schreibt zusätzlich den Ort je Hochschule       |
| `modules/profile/src/university-cities.generated.ts`      | neu, generiert                                  |
| `modules/profile/migrations/0004_nutzertyp.sql`           | neu                                             |
| `modules/profile/src/schema.ts`                           | Spalten                                         |
| `modules/profile/src/types.ts`                            | Schemata je Typ, `FIELD_SETS`, `MemberProfile`  |
| `modules/profile/src/services/profile.ts`                 | `saveProfile` je Typ, neu `setProfilePhoto`     |
| `modules/profile/src/index.ts`, `index.export.test.ts`    | Oberfläche                                      |
| `modules/profile/src/test-db.ts`                          | + `0004`                                        |
| `modules/profile/README.md`                               | Abschnitt Nutzertypen                           |
| `apps/web/app/account/photo-actions.ts`                   | nutzt `setProfilePhoto`                         |
| `apps/web/app/account/profile-summary.ts` (+ Test)        | nullable Felder, neue Zeilen                    |
| `apps/web/app/account/page.tsx`                           | Bearbeiten nur für Studierende                  |
| `apps/web/app/(board)/gruppe/[slug]/bewerbungen/page.tsx` | nullable Felder                                 |
| `apps/web/app/(board)/_components/ApplicationCard.tsx`    | Geburtsdatum nur wenn vorhanden                 |

---

### Task 1: Studienfach-Liste übernehmen und generieren

**Files:**

- Create (per Cherry-Pick): `modules/profile/data/studienfaecher.csv`
- Create: `modules/profile/scripts/generate-studienfaecher.mjs`
- Create (generiert): `modules/profile/src/studienfaecher.generated.ts`
- Modify: `modules/profile/src/data.ts`
- Test: `modules/profile/src/data.test.ts`

**Interfaces:**

- Produces:
  - `STUDIENFACH_KATEGORIEN: ReadonlyArray<{ readonly name: string; readonly faecher: ReadonlyArray<string> }>` — Kategorien in CSV-Reihenfolge, `Sonstige` zuletzt; Fächer je Kategorie deutsch sortiert
  - `STUDIENFACH_KATEGORIE_NAMES: ReadonlyArray<string>`
  - `faecherIn(kategorie: string): ReadonlyArray<string>` — leere Liste für unbekannte Kategorie
  - `BDAJ_FUNKTION_OPTIONS` (`vorstandsmitglied` / `mitglied` / `geschaeftsstelle`), `BDAJ_FUNKTION_KEYS`

- [ ] **Step 1: Branch anlegen und die CSV übernehmen**

```bash
git fetch origin
git switch -c feat/profile-feldsaetze origin/main
git cherry-pick 4831088 80220f4
```

Expected: zwei Commits übernommen; `modules/profile/data/studienfaecher.csv` existiert (266 Zeilen inkl. Kopfzeile). Bei einem Konflikt in `modules/profile/README.md`: beide Seiten behalten, der Abschnitt wird in Task 6 ohnehin neu geschrieben.

- [ ] **Step 2: Failing test schreiben**

In `modules/profile/src/data.test.ts` den Import ersetzen:

```ts
import {
  BDAJ_FUNKTION_KEYS,
  canonicalUniversity,
  faecherIn,
  STUDIENFACH_KATEGORIE_NAMES,
  STUDIENFACH_KATEGORIEN,
  UNIVERSITIES,
} from "./data";
```

und am Dateiende anhängen:

```ts
describe("STUDIENFACH_KATEGORIEN", () => {
  const all = STUDIENFACH_KATEGORIEN.flatMap((k) => k.faecher);

  it("covers every row of the CSV", () => {
    const source = readFileSync(join(DATA_DIR, "studienfaecher.csv"), "utf8");
    const records = source.split("\n").filter((l) => l.trim() !== "").length - 1;
    expect(all).toHaveLength(records);
    expect(all).toHaveLength(265);
  });

  it("has the eleven categories, Sonstige last", () => {
    expect(STUDIENFACH_KATEGORIE_NAMES).toHaveLength(11);
    expect(STUDIENFACH_KATEGORIE_NAMES.at(-1)).toBe("Sonstige");
    expect(STUDIENFACH_KATEGORIE_NAMES).toContain("Ingenieurwissenschaften");
    expect(STUDIENFACH_KATEGORIE_NAMES).toContain(
      "Agrar-, Forst- und Ernährungswissenschaften, Veterinärmedizin",
    );
  });

  it("keeps quoted subjects with commas intact", () => {
    expect(faecherIn("Geisteswissenschaften")).toContain(
      "Evang. Religionspädagogik, kirchliche Bildungsarbeit",
    );
  });

  it("sorts subjects with German collation and trims them", () => {
    for (const k of STUDIENFACH_KATEGORIEN) {
      expect([...k.faecher].sort((a, b) => a.localeCompare(b, "de"))).toEqual(k.faecher);
      expect(k.faecher.filter((f) => f !== f.trim() || f === "")).toEqual([]);
    }
  });

  it("fits the stored column", () => {
    expect(Math.max(...all.map((f) => f.length))).toBeLessThanOrEqual(200);
    expect(Math.max(...STUDIENFACH_KATEGORIE_NAMES.map((k) => k.length))).toBeLessThanOrEqual(200);
  });

  it("returns nothing for an unknown category", () => {
    expect(faecherIn("Zauberei")).toEqual([]);
  });
});

describe("BDAJ_FUNKTION_KEYS", () => {
  it("offers exactly the three functions from the spec", () => {
    expect(BDAJ_FUNKTION_KEYS).toEqual(["vorstandsmitglied", "mitglied", "geschaeftsstelle"]);
  });
});
```

Hinweis: Die Kategorie-Zeichenkette oben prüfst du vor dem Lauf mit
`grep -m1 '^"Agrar' modules/profile/data/studienfaecher.csv`. Weicht sie ab, übernimm den Text aus der CSV.

- [ ] **Step 3: Test laufen lassen, er muss fehlschlagen**

Run: `pnpm vitest run modules/profile/src/data.test.ts`
Expected: FAIL — `STUDIENFACH_KATEGORIEN` ist nicht exportiert.

- [ ] **Step 4: Generator schreiben**

`modules/profile/scripts/generate-studienfaecher.mjs`:

```js
/**
 * Regenerates src/studienfaecher.generated.ts from data/studienfaecher.csv.
 *
 *   node modules/profile/scripts/generate-studienfaecher.mjs
 *
 * The CSV has two columns, `Kategorie,Studienfach`, RFC 4180 quoting with a
 * comma delimiter — several categories and subjects contain a comma. The
 * category is stored alongside the subject (spec 2026-09-16 §4.3): the subject
 * list will never be complete, so the category is the fallback that keeps an
 * answer usable.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..", "data", "studienfaecher.csv");
const TARGET = join(HERE, "..", "src", "studienfaecher.generated.ts");
const LAST = "Sonstige";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') {
        field += c;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length === 2);
}

const [header, ...records] = parseCsv(readFileSync(SOURCE, "utf8"));
if (header[0] !== "Kategorie" || header[1] !== "Studienfach") {
  throw new Error(`unexpected header in ${SOURCE}: ${header.join(",")}`);
}

const byCategory = new Map();
for (const [rawKategorie, rawFach] of records) {
  const kategorie = rawKategorie.replace(/\s+/g, " ").trim();
  const fach = rawFach.replace(/\s+/g, " ").trim();
  if (kategorie === "" || fach === "") throw new Error(`empty cell in ${SOURCE}`);
  const list = byCategory.get(kategorie) ?? [];
  if (list.includes(fach)) throw new Error(`duplicate subject "${fach}" in "${kategorie}"`);
  list.push(fach);
  byCategory.set(kategorie, list);
}

const names = [...byCategory.keys()].filter((k) => k !== LAST);
if (byCategory.has(LAST)) names.push(LAST);

const body = names
  .map((name) => {
    const faecher = [...byCategory.get(name)].sort((a, b) => a.localeCompare(b, "de"));
    return `  {\n    name: ${JSON.stringify(name)},\n    faecher: [\n${faecher
      .map((f) => `      ${JSON.stringify(f)},`)
      .join("\n")}\n    ],\n  },`;
  })
  .join("\n");

writeFileSync(
  TARGET,
  `// Generated by scripts/generate-studienfaecher.mjs from data/studienfaecher.csv.
// Do not edit by hand — edit the CSV and regenerate.

/** Study subjects by category, categories in source order with "Sonstige"
 *  last, subjects sorted with German collation. */
export const STUDIENFACH_KATEGORIEN: ReadonlyArray<{
  readonly name: string;
  readonly faecher: ReadonlyArray<string>;
}> = [
${body}
];
`,
  "utf8",
);

console.log(`wrote ${names.length} categories, ${records.length} subjects to ${TARGET}`);
```

- [ ] **Step 5: Generieren**

Run: `node modules/profile/scripts/generate-studienfaecher.mjs && pnpm prettier --write modules/profile/src/studienfaecher.generated.ts`
Expected: `wrote 11 categories, 265 subjects to …/studienfaecher.generated.ts`

- [ ] **Step 6: `data.ts` erweitern**

In `modules/profile/src/data.ts` unter den Import von `UNIVERSITIES` einfügen:

```ts
import { STUDIENFACH_KATEGORIEN } from "./studienfaecher.generated";
```

und nach `export const GEFUNDEN_DURCH_KEYS = …;` anhängen:

```ts
/** Die Funktion einer BDAJ-Funktionärin (Spec 2026-09-16 §4.3). */
export const BDAJ_FUNKTION_OPTIONS = [
  { value: "vorstandsmitglied", label: "Vorstandsmitglied" },
  { value: "mitglied", label: "Mitglied" },
  { value: "geschaeftsstelle", label: "Geschäftsstelle" },
] as const;

export const BDAJ_FUNKTION_KEYS = BDAJ_FUNKTION_OPTIONS.map((o) => o.value);

export { STUDIENFACH_KATEGORIEN };

export const STUDIENFACH_KATEGORIE_NAMES: ReadonlyArray<string> = STUDIENFACH_KATEGORIEN.map(
  (k) => k.name,
);

/** Die Fächer einer Kategorie; leer, wenn es die Kategorie nicht gibt. */
export function faecherIn(kategorie: string): ReadonlyArray<string> {
  return STUDIENFACH_KATEGORIEN.find((k) => k.name === kategorie)?.faecher ?? [];
}
```

- [ ] **Step 7: Test laufen lassen, er muss bestehen**

Run: `pnpm vitest run modules/profile/src/data.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add modules/profile/scripts/generate-studienfaecher.mjs modules/profile/src/studienfaecher.generated.ts modules/profile/src/data.ts modules/profile/src/data.test.ts
git commit -m "feat(profile): Studienfächer nach Kategorie als generierte Liste

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 1b: Ort je Hochschule

Der Wizard sucht „Wo studierst du?" nach Stadt **oder Hochschule** (Spec §4.1) und zeigt zur Hochschule die Gruppe ihrer Stadt („TU Berlin → BDAS Berlin"). Die HRK-Tabelle hat den Ort bereits (`Ort (Hausanschrift)`); der Generator schreibt ihn jetzt mit heraus.

**Files:**

- Modify: `modules/profile/scripts/generate-universities.mjs`
- Create (generiert): `modules/profile/src/university-cities.generated.ts`
- Modify: `modules/profile/src/data.ts`
- Test: `modules/profile/src/data.test.ts`

**Interfaces:**

- Produces: `UNIVERSITY_CITIES: ReadonlyArray<readonly [name: string, city: string]>` (privat), `universityCity(name: string): string | null` — akzeptiert auch die Altnamen aus `canonicalUniversity`.

- [ ] **Step 1: Failing test schreiben**

In `modules/profile/src/data.test.ts` den Import um `universityCity` erweitern und am Ende anhängen:

```ts
describe("universityCity", () => {
  it("knows the city of every listed university", () => {
    expect(UNIVERSITIES.filter((u) => universityCity(u) === null)).toEqual([]);
  });

  it("returns the address city", () => {
    expect(universityCity("RWTH Aachen")).toBe("Aachen");
  });

  it("resolves legacy names and rejects unknown ones", () => {
    expect(universityCity("Technische Universität Berlin")).toBe(universityCity("TU Berlin"));
    expect(universityCity("Hochschule Nirgendwo")).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `pnpm vitest run modules/profile/src/data.test.ts`
Expected: FAIL — `universityCity` ist nicht exportiert.

- [ ] **Step 3: Generator erweitern**

In `modules/profile/scripts/generate-universities.mjs`:

(a) unter `const TARGET = …` ergänzen:

```js
const CITY_TARGET = join(HERE, "..", "src", "university-cities.generated.ts");
const CITY_COLUMN = "Ort (Hausanschrift)";
```

(b) nach `if (nameIndex === -1) throw …` ergänzen:

```js
const cityIndex = header.indexOf(CITY_COLUMN);
if (cityIndex === -1) throw new Error(`column "${CITY_COLUMN}" missing from ${SOURCE}`);
```

(c) am Dateiende vor dem `console.log` ergänzen:

```js
const cities = records
  .map((r) => [
    (r[nameIndex] ?? "").replace(/\s+/g, " ").trim(),
    (r[cityIndex] ?? "").replace(/\s+/g, " ").trim(),
  ])
  .filter(([n, c]) => n !== "" && c !== "")
  .sort(([a], [b]) => a.localeCompare(b, "de"));

writeFileSync(
  CITY_TARGET,
  `// Generated by scripts/generate-universities.mjs from data/hochschulen.tsv.
// Do not edit by hand — edit the TSV and regenerate.

/** [university short name, city of its main address], sorted like UNIVERSITIES. */
export const UNIVERSITY_CITIES: ReadonlyArray<readonly [string, string]> = [
${cities.map(([n, c]) => `  [${JSON.stringify(n)}, ${JSON.stringify(c)}],`).join("\n")}
];
`,
  "utf8",
);
```

- [ ] **Step 4: Generieren**

Run: `node modules/profile/scripts/generate-universities.mjs && pnpm prettier --write modules/profile/src/university-cities.generated.ts modules/profile/src/universities.generated.ts`
Expected: `wrote 389 institutions …`; `git diff --stat modules/profile/src/universities.generated.ts` zeigt keine Änderung.

- [ ] **Step 5: `data.ts` ergänzen**

In `modules/profile/src/data.ts` einen Import ergänzen:

```ts
import { UNIVERSITY_CITIES } from "./university-cities.generated";
```

und am Dateiende anhängen:

```ts
const CITY_BY_UNI = new Map(UNIVERSITY_CITIES);

/** Der Ort der Hauptanschrift einer gelisteten Hochschule; null für Freitext. */
export function universityCity(name: string): string | null {
  const canonical = canonicalUniversity(name);
  return canonical ? (CITY_BY_UNI.get(canonical) ?? null) : null;
}
```

- [ ] **Step 6: Test laufen lassen, er muss bestehen**

Run: `pnpm vitest run modules/profile/src/data.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/profile/scripts/generate-universities.mjs modules/profile/src/university-cities.generated.ts modules/profile/src/data.ts modules/profile/src/data.test.ts
git commit -m "feat(profile): Ort je Hochschule für die Gruppensuche

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Migration `0004_nutzertyp.sql`

**Files:**

- Create: `modules/profile/migrations/0004_nutzertyp.sql`
- Modify: `modules/profile/src/test-db.ts` (Liste `PROFILE_TEST_MIGRATIONS`)
- Test: `modules/profile/src/schema.test.ts` (neuer `describeIfDb`-Block am Ende)

**Interfaces:**

- Produces: Spalten `nutzertyp` (NOT NULL, ohne Standardwert nach der Migration), `studienfach_kategorie`, `interesse`, `bdaj_funktion`; `studiengang`, `abschlussart`, `uni`, `geburtsdatum` nullable; CHECK `member_profiles_fieldset_check`.

- [ ] **Step 1: Bestehenden Test lesen**

Run: `sed -n 1,40p modules/profile/src/schema.test.ts`
Merke dir, wie die Datei `describeIfDb`, `setupProfileDb` und `seedAuthUser` importiert; der neue Block nutzt dieselben.

- [ ] **Step 2: Failing test schreiben**

Am Ende von `modules/profile/src/schema.test.ts` anhängen (fehlende Importe `beforeEach`, `afterEach`, `seedAuthUser`, `setupProfileDb`, `TestDb` ergänzen, falls die Datei sie nicht schon hat):

```ts
describeIfDb("member_profiles: nutzertyp (0004)", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupProfileDb();
    await seedAuthUser(t, "usr_1");
  });
  afterEach(async () => {
    await t.cleanup();
  });

  async function insert(row: Record<string, unknown>): Promise<void> {
    await t.client`INSERT INTO member_profiles ${t.client({
      user_id: "usr_1",
      gefunden_durch: "webseite",
      updated_by: "usr_1",
      ...row,
    })}`;
  }

  const student = {
    nutzertyp: "student",
    studiengang: "Informatik",
    abschlussart: "bachelor",
    uni: "RWTH Aachen",
    geburtsdatum: "2000-01-01",
  };

  it("requires the type on new rows", async () => {
    const { nutzertyp: _omit, ...rest } = student;
    await expect(insert(rest)).rejects.toThrow(/null value/i);
  });

  it("accepts each type with its own fields", async () => {
    await insert(student);
    await t.client`DELETE FROM member_profiles`;
    await insert({ nutzertyp: "alumnus", studiengang: "Jura", uni: "Universität zu Köln" });
    await t.client`DELETE FROM member_profiles`;
    await insert({ nutzertyp: "foerderer", interesse: "Kultur" });
    await t.client`DELETE FROM member_profiles`;
    await insert({ nutzertyp: "bdaj", bdaj_funktion: "mitglied" });
  });

  it.each([
    ["student without birth date", { ...student, geburtsdatum: null }],
    ["alumnus without university", { nutzertyp: "alumnus", studiengang: "Jura" }],
    ["supporter without interest", { nutzertyp: "foerderer" }],
    ["bdaj without function", { nutzertyp: "bdaj" }],
    ["bdaj with an unknown function", { nutzertyp: "bdaj", bdaj_funktion: "chef" }],
    ["an unknown type", { ...student, nutzertyp: "gast" }],
  ])("rejects %s", async (_label, row) => {
    await expect(insert(row)).rejects.toThrow(/check/i);
  });

  it("keeps existing rows valid as students", async () => {
    await insert(student);
    const [row] = await t.client`SELECT nutzertyp FROM member_profiles`;
    expect(row?.["nutzertyp"]).toBe("student");
  });
});
```

- [ ] **Step 3: Test laufen lassen, er muss fehlschlagen**

Run: `pnpm db:up && pnpm vitest run modules/profile/src/schema.test.ts`
Expected: FAIL — `column "nutzertyp" … does not exist`.

- [ ] **Step 4: Migration schreiben**

`modules/profile/migrations/0004_nutzertyp.sql`:

```sql
-- Field sets per user type (spec 2026-09-16-onboarding-wizard-design.md §4.3).
--
-- Until now every profile was a student's: all four study columns NOT NULL.
-- The onboarding wizard also takes alumni, supporters and BDAJ officials, each
-- with a different set of fields. `nutzertyp` says which set applies, and one
-- CHECK enforces it in both directions — the database, not only the form,
-- refuses a supporter row without an interest or a student row without a
-- birth date.
--
-- Every existing row is a student's and satisfies the student branch, so the
-- temporary default below backfills them correctly. It is dropped right after:
-- a new row must say what it is.

ALTER TABLE member_profiles
  ADD COLUMN nutzertyp text NOT NULL DEFAULT 'student'
    CHECK (nutzertyp IN ('student', 'alumnus', 'foerderer', 'bdaj')),
  -- Stored, not just used to filter the subject list: a subject the list
  -- misses still lands in a known category (decision 2026-09-16).
  ADD COLUMN studienfach_kategorie text,
  ADD COLUMN interesse text,
  ADD COLUMN bdaj_funktion text
    CHECK (bdaj_funktion IN ('vorstandsmitglied', 'mitglied', 'geschaeftsstelle'));

ALTER TABLE member_profiles ALTER COLUMN nutzertyp DROP DEFAULT;

ALTER TABLE member_profiles
  ALTER COLUMN studiengang DROP NOT NULL,
  ALTER COLUMN abschlussart DROP NOT NULL,
  ALTER COLUMN uni DROP NOT NULL,
  ALTER COLUMN geburtsdatum DROP NOT NULL;

ALTER TABLE member_profiles
  ADD CONSTRAINT member_profiles_fieldset_check CHECK (
    (nutzertyp = 'student'
      AND studiengang IS NOT NULL AND abschlussart IS NOT NULL
      AND uni IS NOT NULL AND geburtsdatum IS NOT NULL)
    OR (nutzertyp = 'alumnus' AND studiengang IS NOT NULL AND uni IS NOT NULL)
    OR (nutzertyp = 'foerderer' AND interesse IS NOT NULL)
    OR (nutzertyp = 'bdaj' AND bdaj_funktion IS NOT NULL)
  );
```

- [ ] **Step 5: Test-Harness ergänzen**

In `modules/profile/src/test-db.ts` in `PROFILE_TEST_MIGRATIONS` nach `0003_vorstellung.sql` anhängen:

```ts
  ["..", "migrations", "0004_nutzertyp.sql"],
```

- [ ] **Step 6: Test laufen lassen, er muss bestehen**

Run: `pnpm vitest run modules/profile/src/schema.test.ts`
Expected: PASS für den neuen Block. Der bestehende Test „creates the table with the expected columns" scheitert jetzt an den vier neuen Spalten — ergänze `"bdaj_funktion"`, `"interesse"`, `"nutzertyp"` und `"studienfach_kategorie"` in seiner Liste. Ältere Blöcke, die Zeilen ohne `nutzertyp` einfügen, scheitern mit „null value in column nutzertyp" — dort `nutzertyp: "student"` ergänzen. Danach läuft die ganze Datei grün.

- [ ] **Step 7: Commit**

```bash
git add modules/profile/migrations/0004_nutzertyp.sql modules/profile/src/test-db.ts modules/profile/src/schema.test.ts
git commit -m "feat(profile): Spalte nutzertyp mit Feldsatz-Constraint

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Schemata je Nutzertyp

**Files:**

- Modify: `modules/profile/src/types.ts`
- Modify: `modules/profile/src/schema.ts`
- Test: `modules/profile/src/validation.test.ts`

**Interfaces:**

- Consumes: `BDAJ_FUNKTION_KEYS`, `STUDIENFACH_KATEGORIE_NAMES` aus `./data`.
- Produces:
  - `NUTZERTYPEN = ["student", "alumnus", "foerderer", "bdaj"] as const`, `type Nutzertyp`, `isNutzertyp(v: unknown): v is Nutzertyp`
  - `MAX_INTERESSE = 500`
  - `StudentProfileFields`, `AlumnusProfileFields`, `FoerdererProfileFields`, `BdajProfileFields` (zod), `SaveProfileFields` (= `StudentProfileFields`, alter Name bleibt)
  - `PROFILE_FIELD_SCHEMAS: Record<Nutzertyp, z.ZodType<AnyProfileFields, z.ZodTypeDef, unknown>>`
  - `type AnyProfileFields`
  - `type ProfileField = "studienfach" | "abschlussart" | "uni" | "geburtsdatum" | "gefundenDurch" | "photo" | "interesse" | "bdajFunktion"`
  - `FIELD_SETS: Record<Nutzertyp, ReadonlyArray<ProfileField>>` — Reihenfolge wie Spec §4.3
  - `MemberProfile` mit `nutzertyp`, `studienfachKategorie`, `interesse`, `bdajFunktion`; `studiengang`, `abschlussart`, `uni`, `geburtsdatum` jetzt `string | null`

- [ ] **Step 1: Failing tests schreiben**

In `modules/profile/src/validation.test.ts` den Import ersetzen:

```ts
import {
  AlumnusProfileFields,
  BdajProfileFields,
  FIELD_SETS,
  FoerdererProfileFields,
  isNutzertyp,
  MAX_INTERESSE,
  MAX_VORSTELLUNG,
  SaveProfileFields,
} from "./types";
```

und am Dateiende anhängen:

```ts
describe("student: Studienfach-Kategorie", () => {
  it("accepts a known category and none at all", () => {
    expect(
      SaveProfileFields.safeParse({ ...valid, studienfachKategorie: "Ingenieurwissenschaften" })
        .success,
    ).toBe(true);
    expect(SaveProfileFields.safeParse({ ...valid, studienfachKategorie: null }).success).toBe(
      true,
    );
  });

  it("rejects an unknown category", () => {
    expect(
      SaveProfileFields.safeParse({ ...valid, studienfachKategorie: "Zauberei" }).success,
    ).toBe(false);
  });

  it("rejects a mismatching explicit type", () => {
    expect(SaveProfileFields.safeParse({ ...valid, nutzertyp: "alumnus" }).success).toBe(false);
  });
});

describe("AlumnusProfileFields", () => {
  const alumnus = { studiengang: "Jura", uni: "Universität zu Köln", gefundenDurch: "instagram" };

  it("needs no degree and no birth date", () => {
    expect(AlumnusProfileFields.safeParse(alumnus).success).toBe(true);
  });

  it("strips student-only fields instead of failing", () => {
    const r = AlumnusProfileFields.safeParse({ ...alumnus, abschlussart: "", geburtsdatum: "" });
    expect(r.success && !("abschlussart" in r.data)).toBe(true);
  });

  it("still needs subject, university and channel", () => {
    expect(AlumnusProfileFields.safeParse({ ...alumnus, uni: "" }).success).toBe(false);
    expect(AlumnusProfileFields.safeParse({ ...alumnus, studiengang: "" }).success).toBe(false);
    expect(AlumnusProfileFields.safeParse({ ...alumnus, gefundenDurch: "" }).success).toBe(false);
  });
});

describe("FoerdererProfileFields", () => {
  it("needs an interest within the cap", () => {
    const base = { gefundenDurch: "webseite" };
    expect(FoerdererProfileFields.safeParse({ ...base, interesse: "Kulturarbeit" }).success).toBe(
      true,
    );
    expect(FoerdererProfileFields.safeParse({ ...base, interesse: "  " }).success).toBe(false);
    expect(
      FoerdererProfileFields.safeParse({ ...base, interesse: "x".repeat(MAX_INTERESSE + 1) })
        .success,
    ).toBe(false);
  });
});

describe("BdajProfileFields", () => {
  it("accepts only the three functions", () => {
    const base = { gefundenDurch: "webseite" };
    expect(BdajProfileFields.safeParse({ ...base, bdajFunktion: "geschaeftsstelle" }).success).toBe(
      true,
    );
    expect(BdajProfileFields.safeParse({ ...base, bdajFunktion: "chef" }).success).toBe(false);
  });

  it("keeps the referral rule", () => {
    expect(
      BdajProfileFields.safeParse({ gefundenDurch: "empfehlung", bdajFunktion: "mitglied" })
        .success,
    ).toBe(false);
  });
});

describe("FIELD_SETS", () => {
  it("follows the spec order", () => {
    expect(FIELD_SETS).toEqual({
      student: ["studienfach", "abschlussart", "uni", "geburtsdatum", "gefundenDurch", "photo"],
      alumnus: ["studienfach", "uni", "gefundenDurch"],
      foerderer: ["interesse", "gefundenDurch"],
      bdaj: ["bdajFunktion", "gefundenDurch"],
    });
  });

  it("knows its types", () => {
    expect(isNutzertyp("alumnus")).toBe(true);
    expect(isNutzertyp("gast")).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `pnpm vitest run modules/profile/src/validation.test.ts`
Expected: FAIL — `AlumnusProfileFields` ist nicht exportiert.

- [ ] **Step 3: `types.ts` umbauen**

`modules/profile/src/types.ts` vollständig ersetzen durch:

```ts
import { z } from "zod";

import {
  ABSCHLUSSART_KEYS,
  BDAJ_FUNKTION_KEYS,
  GEFUNDEN_DURCH_KEYS,
  STUDIENFACH_KATEGORIE_NAMES,
} from "./data";

const MAX_TEXT = 200;
const MAX_UNI = 200;
const MIN_BIRTH_YEAR = 1900;
/** Room for a paragraph or two, not an essay (#122). */
export const MAX_VORSTELLUNG = 1000;
/** „Was interessiert dich an BDAS?" — ein, zwei Sätze. */
export const MAX_INTERESSE = 500;

/** Die vier Nutzertypen (Spec 2026-09-16 §4.3). Gleiche Namen wie `UserType` in @bdas/onboarding. */
export const NUTZERTYPEN = ["student", "alumnus", "foerderer", "bdaj"] as const;
export type Nutzertyp = (typeof NUTZERTYPEN)[number];

export function isNutzertyp(v: unknown): v is Nutzertyp {
  return typeof v === "string" && (NUTZERTYPEN as ReadonlyArray<string>).includes(v);
}

const studiengang = z.string().trim().min(1, "Bitte gib dein Studienfach an.").max(MAX_TEXT);

const studienfachKategorie = z
  .string()
  .refine((k) => STUDIENFACH_KATEGORIE_NAMES.includes(k), "Bitte wähle einen Studienbereich.")
  .optional()
  .nullable();

const uni = z.string().trim().min(1, "Bitte gib deine Hochschule an.").max(MAX_UNI);

const abschlussart = z.enum(ABSCHLUSSART_KEYS as [string, ...string[]], {
  errorMap: () => ({ message: "Bitte wähle eine Abschlussart." }),
});

const geburtsdatum = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte gib ein gültiges Datum an.")
  .refine((s) => {
    const [yearStr, monthStr, dayStr] = s.split("-") as [string, string, string];
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const d = new Date(`${s}T00:00:00Z`);
    return (
      !Number.isNaN(d.getTime()) &&
      d.getUTCFullYear() === year &&
      d.getUTCMonth() + 1 === month &&
      d.getUTCDate() === day &&
      year >= MIN_BIRTH_YEAR &&
      d < new Date()
    );
  }, "Das Geburtsdatum muss in der Vergangenheit liegen.");

/** Felder, die jeder Typ hat. */
const common = {
  gefundenDurch: z.enum(GEFUNDEN_DURCH_KEYS as [string, ...string[]], {
    errorMap: () => ({ message: "Bitte wähle aus, wie du BDAS gefunden hast." }),
  }),
  empfehlerName: z.string().trim().max(MAX_TEXT).optional().nullable(),
  // Optional for every channel, never required (#122). It gives the board
  // something to read; it verifies nothing and gates nothing.
  vorstellung: z
    .string()
    .trim()
    .max(MAX_VORSTELLUNG, `Bitte fasse dich auf ${MAX_VORSTELLUNG} Zeichen.`)
    .optional()
    .nullable(),
  photoStorageKey: z.string().trim().max(MAX_TEXT).optional().nullable(),
};

const referral = {
  check: (v: { gefundenDurch: string; empfehlerName?: string | null | undefined }) =>
    v.gefundenDurch !== "empfehlung" || (v.empfehlerName?.trim().length ?? 0) > 0,
  message: { message: "Bitte gib den Namen der empfehlenden Person an.", path: ["empfehlerName"] },
};

/**
 * Studierende. `uni` is the *resolved* university string: a list value, or the
 * free text typed under "Sonstige". `nutzertyp` may be omitted — the /account
 * edit form predates it — but if present it must match.
 */
export const StudentProfileFields = z
  .object({
    nutzertyp: z.literal("student").optional(),
    studiengang,
    studienfachKategorie,
    abschlussart,
    uni,
    geburtsdatum,
    ...common,
  })
  .refine(referral.check, referral.message);

/** Alumni: Studienfach und ehemalige Hochschule, kein Abschluss, kein Geburtsdatum. */
export const AlumnusProfileFields = z
  .object({
    nutzertyp: z.literal("alumnus").optional(),
    studiengang,
    studienfachKategorie,
    uni,
    ...common,
  })
  .refine(referral.check, referral.message);

/** Förderer*innen und Interessierte, einschließlich Studierender ohne Gruppe. */
export const FoerdererProfileFields = z
  .object({
    nutzertyp: z.literal("foerderer").optional(),
    interesse: z
      .string()
      .trim()
      .min(1, "Bitte erzähl uns kurz, was dich interessiert.")
      .max(MAX_INTERESSE, `Bitte fasse dich auf ${MAX_INTERESSE} Zeichen.`),
    ...common,
  })
  .refine(referral.check, referral.message);

/** BDAJ-Funktionär*innen: eine feste Auswahl. */
export const BdajProfileFields = z
  .object({
    nutzertyp: z.literal("bdaj").optional(),
    bdajFunktion: z.enum(BDAJ_FUNKTION_KEYS as [string, ...string[]], {
      errorMap: () => ({ message: "Bitte wähle deine Funktion in der BDAJ." }),
    }),
    ...common,
  })
  .refine(referral.check, referral.message);

/** Der alte Name. Heißt weiter so, weil `/account` und der alte Wizard ihn benutzen. */
export const SaveProfileFields = StudentProfileFields;
export type SaveProfileFields = z.infer<typeof StudentProfileFields>;

export type AnyProfileFields =
  | z.infer<typeof StudentProfileFields>
  | z.infer<typeof AlumnusProfileFields>
  | z.infer<typeof FoerdererProfileFields>
  | z.infer<typeof BdajProfileFields>;

export const PROFILE_FIELD_SCHEMAS: Record<
  Nutzertyp,
  z.ZodType<AnyProfileFields, z.ZodTypeDef, unknown>
> = {
  student: StudentProfileFields,
  alumnus: AlumnusProfileFields,
  foerderer: FoerdererProfileFields,
  bdaj: BdajProfileFields,
};

/** Ein Feld aus Sicht der Oberfläche. `studienfach` steht für Kategorie + Fach. */
export type ProfileField =
  | "studienfach"
  | "abschlussart"
  | "uni"
  | "geburtsdatum"
  | "gefundenDurch"
  | "photo"
  | "interesse"
  | "bdajFunktion";

/** Welche Felder ein Typ ausfüllt, in der Reihenfolge der Spec (§4.3). */
export const FIELD_SETS: Record<Nutzertyp, ReadonlyArray<ProfileField>> = {
  student: ["studienfach", "abschlussart", "uni", "geburtsdatum", "gefundenDurch", "photo"],
  alumnus: ["studienfach", "uni", "gefundenDurch"],
  foerderer: ["interesse", "gefundenDurch"],
  bdaj: ["bdajFunktion", "gefundenDurch"],
};

export type ProfileActor = {
  readonly userId: string;
  readonly grants: ReadonlyArray<{ role: string; groupId: string | null }>;
};

export type SaveProfileInput = {
  readonly userId: string;
  readonly fields: unknown;
  readonly actor: ProfileActor;
  /** Event-only: the member's primary group id, forwarded into
   *  `profile.completed` so the notifications subscriber can resolve the board.
   *  NOT persisted here — `members` owns the group (spec §9). */
  readonly groupId?: string | null;
};

export type SaveProfileResult = {
  readonly profile: MemberProfile;
  /** The photo object this write unreferenced, if it replaced a stored one.
   *  The caller deletes it: this module owns `photo_storage_key`, not the
   *  bytes it points at. Null when the photo was unchanged or absent. */
  readonly supersededPhotoStorageKey: string | null;
};

export type MemberProfile = {
  readonly userId: string;
  readonly nutzertyp: Nutzertyp;
  /** Null bei Förderer*innen und BDAJ. */
  readonly studiengang: string | null;
  readonly studienfachKategorie: string | null;
  /** Nur Studierende. */
  readonly abschlussart: string | null;
  /** Studierende und Alumni. */
  readonly uni: string | null;
  /** Nur Studierende. */
  readonly geburtsdatum: string | null;
  /** Nur Förderer*innen. */
  readonly interesse: string | null;
  /** Nur BDAJ. */
  readonly bdajFunktion: string | null;
  readonly gefundenDurch: string;
  readonly empfehlerName: string | null;
  readonly vorstellung: string | null;
  readonly photoStorageKey: string | null;
  readonly completedAt: Date | null;
  readonly updatedAt: Date;
  readonly updatedBy: string;
};
```

- [ ] **Step 4: `schema.ts` anpassen**

In `modules/profile/src/schema.ts` den Tabellenkörper ersetzen:

```ts
export const memberProfiles = pgTable("member_profiles", {
  userId: text("user_id").primaryKey(),
  nutzertyp: text("nutzertyp").notNull(),
  studiengang: text("studiengang"),
  studienfachKategorie: text("studienfach_kategorie"),
  abschlussart: text("abschlussart"),
  uni: text("uni"),
  geburtsdatum: date("geburtsdatum"),
  interesse: text("interesse"),
  bdajFunktion: text("bdaj_funktion"),
  gefundenDurch: text("gefunden_durch").notNull(),
  empfehlerName: text("empfehler_name"),
  vorstellung: text("vorstellung"),
  photoStorageKey: text("photo_storage_key"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull(),
});
```

und im Kommentar darüber einen Satz ergänzen: „`nutzertyp` decides which columns are required; the CHECK in 0004 enforces it."

- [ ] **Step 5: Test laufen lassen, er muss bestehen**

Run: `pnpm vitest run modules/profile/src/validation.test.ts`
Expected: PASS (bestehende Tests plus 13 neue).

`pnpm --filter @bdas/profile typecheck` scheitert jetzt noch in `services/profile.ts` — das behebt Task 4.

- [ ] **Step 6: Commit**

```bash
git add modules/profile/src/types.ts modules/profile/src/schema.ts modules/profile/src/validation.test.ts
git commit -m "feat(profile): Feldsätze je Nutzertyp als zod-Schemata

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `saveProfile` je Typ und `setProfilePhoto`

**Files:**

- Modify: `modules/profile/src/services/profile.ts`
- Test: `modules/profile/src/index.test.ts` (neuer `describe`-Block)

**Interfaces:**

- Consumes: `PROFILE_FIELD_SCHEMAS`, `isNutzertyp`, `type Nutzertyp`, `type AnyProfileFields`.
- Produces:
  - `saveProfile(db, input)` — Typ aus `fields.nutzertyp`, sonst gespeicherter Typ, sonst `student`; unbekannter Typ → `ValidationError`; Spalten fremder Typen werden `null`; fehlende Kategorie behält die gespeicherte
  - `setProfilePhoto(db: Db, input: { userId: string; actor: ProfileActor; photoStorageKey: string }): Promise<{ readonly updated: boolean; readonly supersededPhotoStorageKey: string | null }>`

- [ ] **Step 1: Failing tests schreiben**

Am Ende von `modules/profile/src/index.test.ts`, innerhalb des bestehenden `describeIfDb("profile service", …)`-Blocks (vor dessen schließender Klammer), anhängen und den Import um `setProfilePhoto` erweitern:

```ts
describe("user types", () => {
  const actor = OWNER;
  const save = (fields: Record<string, unknown>) =>
    saveProfile(t.db, { userId: OWNER.userId, fields, actor });

  it("stores a student by default, as the /account form sends no type", async () => {
    const { profile } = await save(FIELDS);
    expect(profile.nutzertyp).toBe("student");
  });

  it("stores an alumnus without degree and birth date", async () => {
    const { profile } = await save({
      nutzertyp: "alumnus",
      studiengang: "Jura",
      studienfachKategorie: "Rechts- und Verwaltungswissenschaften",
      uni: "Universität zu Köln",
      gefundenDurch: "instagram",
      abschlussart: "bachelor",
    });
    expect(profile).toMatchObject({
      nutzertyp: "alumnus",
      studiengang: "Jura",
      studienfachKategorie: "Rechts- und Verwaltungswissenschaften",
      abschlussart: null,
      geburtsdatum: null,
    });
  });

  it("stores a supporter and a bdaj official", async () => {
    const f = await save({
      nutzertyp: "foerderer",
      interesse: "Kultur",
      gefundenDurch: "webseite",
    });
    expect(f.profile).toMatchObject({ nutzertyp: "foerderer", interesse: "Kultur", uni: null });

    const b = await save({
      nutzertyp: "bdaj",
      bdajFunktion: "mitglied",
      gefundenDurch: "webseite",
    });
    expect(b.profile).toMatchObject({
      nutzertyp: "bdaj",
      bdajFunktion: "mitglied",
      interesse: null,
    });
  });

  it("keeps the stored type when the form omits it", async () => {
    await save({
      nutzertyp: "alumnus",
      studiengang: "Jura",
      uni: "Universität zu Köln",
      gefundenDurch: "instagram",
    });
    const { profile } = await save({
      studiengang: "Rechtswissenschaft",
      uni: "Universität zu Köln",
      gefundenDurch: "instagram",
    });
    expect(profile).toMatchObject({ nutzertyp: "alumnus", studiengang: "Rechtswissenschaft" });
  });

  it("keeps the stored category when the form omits it", async () => {
    await save({ ...FIELDS, studienfachKategorie: "Ingenieurwissenschaften" });
    const { profile } = await save({ ...FIELDS, studiengang: "Maschinenbau" });
    expect(profile.studienfachKategorie).toBe("Ingenieurwissenschaften");
  });

  it("rejects an unknown type and fields that do not fit the type", async () => {
    await expect(save({ ...FIELDS, nutzertyp: "gast" })).rejects.toThrow(/Nutzertyp/);
    await expect(save({ nutzertyp: "foerderer", gefundenDurch: "webseite" })).rejects.toThrow(
      /ungültig/,
    );
  });
});

describe("setProfilePhoto", () => {
  it("sets the key for any type and reports the one it replaced", async () => {
    await saveProfile(t.db, {
      userId: OWNER.userId,
      fields: { nutzertyp: "foerderer", interesse: "Kultur", gefundenDurch: "webseite" },
      actor: OWNER,
    });
    const first = await setProfilePhoto(t.db, {
      userId: OWNER.userId,
      actor: OWNER,
      photoStorageKey: "profiles/a.jpg",
    });
    expect(first).toEqual({ updated: true, supersededPhotoStorageKey: null });

    const second = await setProfilePhoto(t.db, {
      userId: OWNER.userId,
      actor: OWNER,
      photoStorageKey: "profiles/b.jpg",
    });
    expect(second).toEqual({ updated: true, supersededPhotoStorageKey: "profiles/a.jpg" });
    expect((await getProfile(t.db, OWNER.userId))?.photoStorageKey).toBe("profiles/b.jpg");
  });

  it("does nothing without a profile and refuses other owners", async () => {
    expect(
      await setProfilePhoto(t.db, { userId: OWNER.userId, actor: OWNER, photoStorageKey: "k" }),
    ).toEqual({ updated: false, supersededPhotoStorageKey: null });
    await expect(
      setProfilePhoto(t.db, { userId: OWNER.userId, actor: OTHER, photoStorageKey: "k" }),
    ).rejects.toThrow(/eigenes Profil/);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `pnpm vitest run modules/profile/src/index.test.ts`
Expected: FAIL — `setProfilePhoto` ist nicht exportiert bzw. `nutzertyp` fehlt beim Insert.

- [ ] **Step 3: Service umbauen**

In `modules/profile/src/services/profile.ts`:

(a) Importe ersetzen:

```ts
import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { z } from "zod";

import { ForbiddenError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { ProfileCompleted, ProfileUpdated } from "../events";
import { memberProfiles, type MemberProfileRow } from "../schema";
import { isNutzertyp, PROFILE_FIELD_SCHEMAS } from "../types";
import type {
  AnyProfileFields,
  MemberProfile,
  Nutzertyp,
  ProfileActor,
  SaveProfileInput,
  SaveProfileResult,
} from "../types";
```

(b) `row2profile` ersetzen:

```ts
function row2profile(row: MemberProfileRow): MemberProfile {
  return {
    userId: row.userId,
    nutzertyp: isNutzertyp(row.nutzertyp) ? row.nutzertyp : "student",
    studiengang: row.studiengang,
    studienfachKategorie: row.studienfachKategorie,
    abschlussart: row.abschlussart,
    uni: row.uni,
    geburtsdatum: row.geburtsdatum,
    interesse: row.interesse,
    bdajFunktion: row.bdajFunktion,
    gefundenDurch: row.gefundenDurch,
    empfehlerName: row.empfehlerName,
    vorstellung: row.vorstellung,
    photoStorageKey: row.photoStorageKey,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}
```

(c) In `saveProfile` den Block von `const parsed = SaveProfileFields.safeParse(input.fields);` bis einschließlich `const existing = await getProfile(db, input.userId);` ersetzen durch:

```ts
// Preserves an existing photo and category when this submit omits them, and
// tells us which type the row already has.
const existing = await getProfile(db, input.userId);

const raw = (input.fields ?? {}) as Record<string, unknown>;
const requested = raw["nutzertyp"];
if (requested !== undefined && !isNutzertyp(requested)) {
  throw new ValidationError("Unbekannter Nutzertyp.");
}
const nutzertyp: Nutzertyp = isNutzertyp(requested)
  ? requested
  : (existing?.nutzertyp ?? "student");

const parsed = PROFILE_FIELD_SCHEMAS[nutzertyp].safeParse(raw);
if (!parsed.success) {
  throw new ValidationError("Profil-Eingabe ungültig", { fields: flatten(parsed.error) });
}
const v: AnyProfileFields = parsed.data;
const now = new Date();
```

(d) Das `values`-Objekt ersetzen:

```ts
const hasStudy = "studiengang" in v;
const values = {
  userId: input.userId,
  nutzertyp,
  studiengang: hasStudy ? v.studiengang : null,
  studienfachKategorie: hasStudy
    ? (v.studienfachKategorie ?? existing?.studienfachKategorie ?? null)
    : null,
  abschlussart: "abschlussart" in v ? v.abschlussart : null,
  uni: "uni" in v ? v.uni : null,
  geburtsdatum: "geburtsdatum" in v ? v.geburtsdatum : null,
  interesse: "interesse" in v ? v.interesse : null,
  bdajFunktion: "bdajFunktion" in v ? v.bdajFunktion : null,
  gefundenDurch: v.gefundenDurch,
  empfehlerName: v.gefundenDurch === "empfehlung" ? (v.empfehlerName ?? null) : null,
  // Unlike empfehlerName this is not tied to a channel, so it is never
  // cleared on the way in. An empty string means "said nothing" — store it
  // as null so the board panel has one absent case, not two.
  vorstellung: v.vorstellung?.trim() ? v.vorstellung.trim() : null,
  photoStorageKey: v.photoStorageKey ?? existing?.photoStorageKey ?? null,
  completedAt: now,
  updatedAt: now,
  updatedBy: input.actor.userId,
};
```

(e) Im `onConflictDoUpdate.set` die Felder ergänzen, sodass es lautet:

```ts
      set: {
        nutzertyp: values.nutzertyp,
        studiengang: values.studiengang,
        studienfachKategorie: values.studienfachKategorie,
        abschlussart: values.abschlussart,
        uni: values.uni,
        geburtsdatum: values.geburtsdatum,
        interesse: values.interesse,
        bdajFunktion: values.bdajFunktion,
        gefundenDurch: values.gefundenDurch,
        empfehlerName: values.empfehlerName,
        vorstellung: values.vorstellung,
        photoStorageKey: values.photoStorageKey,
        // Immutable-once completion: a concurrent re-submit cannot re-stamp it.
        // The timestamp goes in as an ISO string with an explicit cast: inside a
        // raw `sql` template there is no column type to infer from, and the
        // driver rejects a bare Date as a bind parameter.
        completedAt: sql`COALESCE(${memberProfiles.completedAt}, ${now.toISOString()}::timestamptz)`,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      },
```

(f) Den Doc-Kommentar über `saveProfile` um einen Absatz ergänzen:

```ts
 * The field set follows `nutzertyp` (spec 2026-09-16 §4.3): taken from the
 * submit, else from the stored row, else `student` — the /account form sends
 * no type and must keep editing a student's profile as before. Columns that
 * belong to another type are written as null.
```

(g) Nach `clearProfilePhoto` einfügen:

```ts
/**
 * Set the profile photo on an existing profile, whatever its type. Owner-only.
 *
 * The avatar control used to re-submit the whole student record with a new
 * key; that cannot work for types without study fields. Returns the key it
 * replaced so the caller can delete that object (this module does not own the
 * bytes). No profile yet → nothing to attach the photo to.
 */
export async function setProfilePhoto(
  db: Db,
  input: {
    readonly userId: string;
    readonly actor: ProfileActor;
    readonly photoStorageKey: string;
  },
): Promise<{ readonly updated: boolean; readonly supersededPhotoStorageKey: string | null }> {
  if (input.actor.userId !== input.userId) {
    throw new ForbiddenError("Du darfst nur dein eigenes Profil bearbeiten.");
  }
  const key = input.photoStorageKey.trim();
  if (key === "" || key.length > 200) throw new ValidationError("Ungültiger Bildschlüssel.");

  const existing = await getProfile(db, input.userId);
  if (!existing) return { updated: false, supersededPhotoStorageKey: null };

  const now = new Date();
  await db
    .update(memberProfiles)
    .set({ photoStorageKey: key, updatedAt: now, updatedBy: input.actor.userId })
    .where(eq(memberProfiles.userId, input.userId));

  const event: ProfileUpdated = { type: "profile.updated", userId: input.userId, at: now };
  await getEventBus().publish(event);

  const previous = existing.photoStorageKey;
  return {
    updated: true,
    supersededPhotoStorageKey: previous && previous !== key ? previous : null,
  };
}
```

(h) Der Import `SaveProfileFields` aus `../types` wird nicht mehr gebraucht — entfernen, falls noch vorhanden.

- [ ] **Step 4: Tests laufen lassen, sie müssen bestehen**

```bash
pnpm vitest run modules/profile/src/index.test.ts modules/profile/src/authz.test.ts modules/profile/src/services/photo.test.ts
pnpm --filter @bdas/profile typecheck
```

Expected: PASS, nichts „skipped"; Typcheck ohne Fehler.

Scheitert `photo.test.ts` oder `authz.test.ts` an einem Insert ohne `nutzertyp`: dort `nutzertyp: "student"` ergänzen.

- [ ] **Step 5: Commit**

```bash
git add modules/profile/src/services/profile.ts modules/profile/src/index.test.ts modules/profile/src/authz.test.ts modules/profile/src/services/photo.test.ts
git commit -m "feat(profile): saveProfile je Nutzertyp, setProfilePhoto

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Öffentliche Oberfläche

**Files:**

- Modify: `modules/profile/src/index.ts`
- Test: `modules/profile/src/index.export.test.ts`

**Interfaces:**

- Produces (neu exportiert): `universityCity`, `AlumnusProfileFields`, `BdajProfileFields`, `FoerdererProfileFields`, `StudentProfileFields`, `PROFILE_FIELD_SCHEMAS`, `FIELD_SETS`, `NUTZERTYPEN`, `isNutzertyp`, `MAX_INTERESSE`, `BDAJ_FUNKTION_OPTIONS`, `STUDIENFACH_KATEGORIEN`, `STUDIENFACH_KATEGORIE_NAMES`, `faecherIn`, `setProfilePhoto`; Typen `Nutzertyp`, `ProfileField`, `AnyProfileFields`.

- [ ] **Step 1: Failing test anpassen**

In `modules/profile/src/index.export.test.ts` die erwartete Liste ersetzen durch:

```ts
      [
        "ABSCHLUSSART_OPTIONS",
        "AlumnusProfileFields",
        "BDAJ_FUNKTION_OPTIONS",
        "BdajProfileFields",
        "FIELD_SETS",
        "FoerdererProfileFields",
        "GEFUNDEN_DURCH_OPTIONS",
        "MAX_INTERESSE",
        "MAX_VORSTELLUNG",
        "NUTZERTYPEN",
        "PROFILE_FIELD_SCHEMAS",
        "SONSTIGE",
        "STUDIENFACH_KATEGORIEN",
        "STUDIENFACH_KATEGORIE_NAMES",
        "SaveProfileFields",
        "StudentProfileFields",
        "UNIVERSITIES",
        "canViewProfile",
        "canonicalUniversity",
        "clearProfilePhoto",
        "faecherIn",
        "getProfile",
        "isNutzertyp",
        "saveProfile",
        "setProfilePhoto",
        "universityCity",
      ].sort(),
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `pnpm vitest run modules/profile/src/index.export.test.ts`
Expected: FAIL — Liste weicht ab.

- [ ] **Step 3: `index.ts` ersetzen**

```ts
/**
 * @bdas/profile — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to other
 * workspaces. Internal files (schema, services) are private.
 */
export {
  getProfile,
  saveProfile,
  clearProfilePhoto,
  setProfilePhoto,
  canViewProfile,
  type Db,
} from "./services/profile";
export {
  ABSCHLUSSART_OPTIONS,
  BDAJ_FUNKTION_OPTIONS,
  GEFUNDEN_DURCH_OPTIONS,
  STUDIENFACH_KATEGORIEN,
  STUDIENFACH_KATEGORIE_NAMES,
  UNIVERSITIES,
  SONSTIGE,
  canonicalUniversity,
  faecherIn,
  universityCity,
} from "./data";
export {
  AlumnusProfileFields,
  BdajProfileFields,
  FIELD_SETS,
  FoerdererProfileFields,
  isNutzertyp,
  MAX_INTERESSE,
  MAX_VORSTELLUNG,
  NUTZERTYPEN,
  PROFILE_FIELD_SCHEMAS,
  SaveProfileFields,
  StudentProfileFields,
} from "./types";
export type {
  AnyProfileFields,
  MemberProfile,
  Nutzertyp,
  ProfileActor,
  ProfileField,
  SaveProfileInput,
  SaveProfileResult,
} from "./types";
export type { ProfileEvent, ProfileCompleted, ProfileUpdated } from "./events";
```

- [ ] **Step 4: Test laufen lassen, er muss bestehen**

Run: `pnpm vitest run modules/profile/src/index.export.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/profile/src/index.ts modules/profile/src/index.export.test.ts
git commit -m "feat(profile): Feldsätze und Studienfächer exportieren

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: App-Stellen auf nullable Felder vorbereiten

**Files:**

- Modify: `apps/web/app/account/photo-actions.ts`
- Modify: `apps/web/app/account/profile-summary.ts`
- Modify: `apps/web/app/account/page.tsx`
- Modify: `apps/web/app/(board)/gruppe/[slug]/bewerbungen/page.tsx`
- Modify: `apps/web/app/(board)/_components/ApplicationCard.tsx`
- Test: `apps/web/app/account/profile-summary.test.ts`

**Interfaces:**

- Consumes: `setProfilePhoto`, `BDAJ_FUNKTION_OPTIONS`, `MemberProfile` (nullable Felder) aus `@bdas/profile`.
- Produces: `SummaryInput` mit `studiengang/abschlussart/uni/geburtsdatum: string | null` und neuen Feldern `studienfachKategorie`, `interesse`, `bdajFunktion` (je `string | null`).

- [ ] **Step 1: Failing test schreiben**

In `apps/web/app/account/profile-summary.test.ts` am Ende anhängen (falls die Datei ein Basis-Objekt anders nennt, dieses verwenden und die fehlenden neuen Felder dort mit `null` ergänzen):

```ts
describe("buildProfileSummary — user types", () => {
  const base = {
    firstName: "Lea",
    lastName: "Yıldız",
    groupName: null,
    studiengang: null,
    studienfachKategorie: null,
    abschlussart: null,
    uni: null,
    geburtsdatum: null,
    interesse: null,
    bdajFunktion: null,
    gefundenDurch: "webseite",
    empfehlerName: null,
    vorstellung: null,
  };

  it("shows a supporter's interest and no empty study rows", () => {
    const rows = buildProfileSummary({ ...base, interesse: "Kulturarbeit" });
    expect(rows.map((r) => r.label)).toEqual([
      "Vorname",
      "Nachname",
      "Interesse",
      "Gefunden durch",
    ]);
  });

  it("shows the bdaj function by its label", () => {
    const rows = buildProfileSummary({ ...base, bdajFunktion: "geschaeftsstelle" });
    expect(rows).toContainEqual({ label: "Funktion in der BDAJ", value: "Geschäftsstelle" });
  });

  it("shows the study category next to the subject", () => {
    const rows = buildProfileSummary({
      ...base,
      studiengang: "Maschinenbau",
      studienfachKategorie: "Ingenieurwissenschaften",
    });
    expect(rows).toContainEqual({ label: "Studienbereich", value: "Ingenieurwissenschaften" });
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `pnpm vitest run apps/web/app/account/profile-summary.test.ts`
Expected: FAIL — keine Zeile „Interesse".

- [ ] **Step 3: `profile-summary.ts` anpassen**

Import ersetzen:

```ts
import { ABSCHLUSSART_OPTIONS, BDAJ_FUNKTION_OPTIONS, GEFUNDEN_DURCH_OPTIONS } from "@bdas/profile";
```

`SummaryInput` ersetzen:

```ts
export type SummaryInput = {
  firstName: string;
  lastName: string;
  groupName: string | null;
  studiengang: string | null;
  studienfachKategorie: string | null;
  abschlussart: string | null;
  uni: string | null;
  geburtsdatum: string | null;
  interesse: string | null;
  bdajFunktion: string | null;
  gefundenDurch: string;
  empfehlerName: string | null;
  vorstellung: string | null;
};
```

Die `rows`-Liste in `buildProfileSummary` ersetzen:

```ts
const rows: Array<{ label: string; value: string | null }> = [
  { label: "Vorname", value: input.firstName },
  { label: "Nachname", value: input.lastName },
  { label: "BDAS-Gruppe", value: input.groupName },
  { label: "Studienbereich", value: input.studienfachKategorie },
  { label: "Studiengang", value: input.studiengang },
  {
    label: "Abschlussart",
    value: input.abschlussart ? label(ABSCHLUSSART_OPTIONS, input.abschlussart) : "",
  },
  { label: "Hochschule", value: input.uni },
  { label: "Geburtsdatum", value: input.geburtsdatum ? formatDate(input.geburtsdatum) : "" },
  { label: "Interesse", value: input.interesse },
  {
    label: "Funktion in der BDAJ",
    value: input.bdajFunktion ? label(BDAJ_FUNKTION_OPTIONS, input.bdajFunktion) : "",
  },
  {
    label: "Gefunden durch",
    value: input.gefundenDurch ? label(GEFUNDEN_DURCH_OPTIONS, input.gefundenDurch) : "",
  },
];
```

- [ ] **Step 4: `page.tsx` (Konto) anpassen**

In `apps/web/app/account/page.tsx`:

(a) Den Aufruf `buildProfileSummary({...})` ersetzen durch:

```tsx
        rows={buildProfileSummary({
          firstName: me.member?.firstName ?? "",
          lastName: me.member?.lastName ?? "",
          groupName: currentGroupName,
          studiengang: profile?.studiengang ?? null,
          studienfachKategorie: profile?.studienfachKategorie ?? null,
          abschlussart: profile?.abschlussart ?? null,
          uni: profile?.uni ?? null,
          geburtsdatum: profile?.geburtsdatum ?? null,
          interesse: profile?.interesse ?? null,
          bdajFunktion: profile?.bdajFunktion ?? null,
          gefundenDurch: profile?.gefundenDurch ?? "",
          empfehlerName: profile?.empfehlerName ?? null,
          vorstellung: profile?.vorstellung ?? null,
        })}
```

(b) Die Zeile `extendedForm={profileFlagOn && me.member ? { initial: extendedInitial } : null}` ersetzen durch:

```tsx
        extendedForm={
          profileFlagOn && me.member && editableAsStudent ? { initial: extendedInitial } : null
        }
```

(c) Direkt über `const extendedInitial = {` einfügen:

```ts
// Das Bearbeiten-Formular kennt nur die Studierenden-Felder. Alumni,
// Förderer*innen und BDAJ sehen ihre Angaben vorerst nur als Zusammenfassung
// (Nacharbeit zum Onboarding-Wizard).
const editableAsStudent = !profile || profile.nutzertyp === "student";
```

(`extendedInitial` bleibt; die `?? ""`-Zuweisungen dort funktionieren mit den nullable Feldern unverändert.)

- [ ] **Step 5: `photo-actions.ts` auf `setProfilePhoto` umstellen**

In `apps/web/app/account/photo-actions.ts` den Import ersetzen:

```ts
import { clearProfilePhoto, setProfilePhoto } from "@bdas/profile";
```

den Doc-Kommentar von `savePhotoAction` ersetzen:

```ts
/**
 * Persist a freshly uploaded profile photo on its own, so the avatar control at
 * the top of /account saves immediately instead of waiting on the extended
 * profile form far below it. Works for every user type. A member without a
 * profile row yet is pointed at the extended profile instead of a silent no-op.
 */
```

und den Körper ab `const existing = await getProfile(db, me.user.id);` bis vor `} catch (err) {` ersetzen durch:

```ts
  try {
    const { updated, supersededPhotoStorageKey } = await setProfilePhoto(db, {
      userId: me.user.id,
      actor: { userId: me.user.id, grants: me.grants },
      photoStorageKey: key,
    });
    if (!updated) {
      return {
        error: "Bitte fülle zuerst das erweiterte Profil aus, dann kannst du ein Bild setzen.",
      };
    }
    // The photo it just replaced is now unreachable — personal data (spec §7)
    // should not outlive the profile that referenced it.
    await purgeUnreferencedPhoto(supersededPhotoStorageKey, me.user.id);

    revalidatePath("/account");
    return { notice: "Profilbild aktualisiert." };
```

Prüfe danach, dass `getProfile` und `saveProfile` in der Datei nicht mehr gebraucht werden (sonst Lint-Fehler „unused import") und der zweite Kommentar („Unlike `savePhotoAction` this does not re-submit the whole record") jetzt lautet: „Drop the profile photo, leaving the rest of the profile alone."

- [ ] **Step 6: Board-Bewerbungen anpassen**

In `apps/web/app/(board)/gruppe/[slug]/bewerbungen/page.tsx` das `profile`-Objekt der Karte ersetzen:

```tsx
              ? {
                  uni: profile.uni ?? "",
                  studiengang: profile.studiengang ?? "",
                  abschlussart: profile.abschlussart
                    ? label(ABSCHLUSSART_OPTIONS, profile.abschlussart)
                    : "",
                  geburtsdatum: profile.geburtsdatum ?? "",
                  gefundenDurch: label(GEFUNDEN_DURCH_OPTIONS, profile.gefundenDurch),
                  empfehlerName: profile.empfehlerName,
                  vorstellung: profile.vorstellung,
                }
```

In `apps/web/app/(board)/_components/ApplicationCard.tsx` die Zeilen

```tsx
                <br />
                geb. {new Date(profile.geburtsdatum).toLocaleDateString("de-DE")}
```

ersetzen durch:

```tsx
{
  profile.geburtsdatum ? (
    <>
      <br />
      geb. {new Date(profile.geburtsdatum).toLocaleDateString("de-DE")}
    </>
  ) : null;
}
```

- [ ] **Step 7: Tests und Typcheck**

```bash
pnpm vitest run apps/web/app/account/profile-summary.test.ts
pnpm --filter @bdas/web typecheck
```

Expected: PASS; Typcheck ohne Fehler. Meldet der Typcheck weitere Stellen (z. B. `apps/web/app/profil/Wizard.tsx`, `apps/web/app/_profile/steps.ts`, `apps/web/app/account/datenexport/route.ts`), behebe sie mit `?? ""` bzw. `?? null` — ohne Verhalten zu ändern. Der alte Wizard wird in PR 4 gelöscht.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/account "apps/web/app/(board)"
git commit -m "fix(web): Profilanzeige für Nutzertypen ohne Studienfelder

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: README und Gesamtprüfung

**Files:**

- Modify: `modules/profile/README.md`

- [ ] **Step 1: README ergänzen**

Den Absatz, der mit „Decided: the form asks in two steps" beginnt, samt dem folgenden Absatz („This is not bolted onto today's form …") ersetzen durch:

```markdown
The subject list is generated: `node modules/profile/scripts/generate-studienfaecher.mjs`
writes `src/studienfaecher.generated.ts` (`STUDIENFACH_KATEGORIEN`, 11 categories,
265 subjects). The form asks in two steps — category first, then subject within it.
The category is stored in `studienfach_kategorie`, not just used to filter: the
subject list will never be complete, so a subject it misses still lands in a known
category. Existing free-text `studiengang` values keep working; there is no
`canonicalStudienfach`.

## User types

`nutzertyp` (`student` | `alumnus` | `foerderer` | `bdaj`) decides which fields a
profile has (spec 2026-09-16 §4.3, `FIELD_SETS`). A CHECK in migration 0004
enforces the required columns per type; columns of other types are stored as
null. `saveProfile` takes the type from the submit, else from the stored row,
else `student` — the /account edit form sends none.

The /account edit form only knows the student fields. For the other three types
the page shows the summary without an edit button; editing their own fields there
is follow-up work to the onboarding wizard. `setProfilePhoto` sets the avatar for
every type.
```

- [ ] **Step 2: Alles Betroffene prüfen**

```bash
pnpm db:up
pnpm vitest run modules/profile apps/web/app/account/profile-summary.test.ts
pnpm --filter @bdas/profile typecheck
pnpm --filter @bdas/web typecheck
pnpm lint
pnpm format:check
pnpm db:migrate:dry
```

Expected: alles grün, nichts „skipped" unter `modules/profile`; `profile/0004_nutzertyp.sql` ist ausstehend.

- [ ] **Step 3: E2E für Profil und Konto**

Die bestehenden Abläufe dürfen sich nicht ändern:

```bash
pnpm e2e e2e/profile-onboarding.e2e.ts e2e/account-profile.e2e.ts e2e/profile-photo-crop.e2e.ts
```

Expected: PASS. Vorher prüfen, dass nichts Fremdes auf Port 3000 läuft (`lsof -i :3000`) — sonst testet Playwright einen alten Server.

- [ ] **Step 4: Commit, Push, PR**

```bash
git add modules/profile/README.md
git commit -m "docs(profile): Nutzertypen und Studienfach-Liste

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git log --oneline origin/main..HEAD
git push -u origin feat/profile-feldsaetze
gh pr create --title "feat(profile): Feldsätze je Nutzertyp und Studienfach-Kategorie" --body "$(cat <<'EOF'
PR 2 von 6 aus `docs/superpowers/specs/2026-09-16-onboarding-wizard-design.md` §8.

- Studienfach-Liste (aus `docs/studienfach-liste`) als generierte Datei, Kategorie wird gespeichert
- `member_profiles.nutzertyp` mit Feldsatz-Constraint (Migration 0004); Studierenden-Spalten nullable
- `saveProfile` je Typ, neu `setProfilePhoto`
- `/account` und Board-Bewerbungen vertragen fehlende Studienfelder; Bearbeiten vorerst nur für Studierende

Enthält die zwei Commits des lokalen Branches `docs/studienfach-liste`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Review**

`/review` auf dem PR. Nach dem Merge die lokalen Branches `docs/studienfach-liste` und `feat/studienfach-liste` löschen (`git branch -D …`, nur nach Rückfrage) — beide existieren nur lokal, nicht auf GitHub.
