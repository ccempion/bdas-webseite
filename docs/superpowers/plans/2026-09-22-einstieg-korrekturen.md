# Einstieg-Korrekturen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Einstieg speichert, was er anzeigt (Studierende ohne Gruppe bleiben Studierende), bietet Gründung und Beitritt zu einer anderen Gruppe an, spricht in neuen Texten, meldet nach dem Bestätigungslink direkt an und nimmt das Profilbild als Kreis entgegen.

**Architecture:** Der Ablauf bleibt reine Daten in `modules/onboarding/src/flow.ts`. Neu sind zwei Fragen (`absicht`, `gruppenwahl`), ein neuer Fragetyp `group_choice` und ein zusätzlicher Ausgang `student_gruendung`. Das Antragsziel entsteht weiter serverseitig aus `resolveTarget` (ADR 0048). Die Aufnahme ohne Gruppe wird im Mitglieder-Modul von „Alumnus" auf „mit angegebener Rolle" verallgemeinert; welche Rolle, entscheidet die App anhand des Nutzertyps. Der Bestätigungslink legt die Sitzung innerhalb von `@bdas/auth` an, damit keine frei aufrufbare „melde Nutzer X an"-Funktion nach außen entsteht.

**Tech Stack:** TypeScript, Next.js 14 App Router, Drizzle ORM auf PostgreSQL, Vitest, Playwright, Tailwind über `@bdas/design-system`.

**Spec:** [`docs/superpowers/specs/2026-09-22-einstieg-korrekturen-design.md`](../specs/2026-09-22-einstieg-korrekturen-design.md)

## Global Constraints

- Module besitzen ihre Tabellen; Zugriff von außen nur über den typisierten Dienst aus `index.ts` (CLAUDE.md §1).
- `modules/members` liest keine Profiltabelle. Der Nutzertyp kommt in der App aus `@bdas/profile`.
- `@bdas/onboarding/client` darf nur reinen Ablauf-Code enthalten, keine Dienste, keine Datenbank (ADR 0049).
- Keine langen Gedankenstriche in Texten, die ein Mensch liest. Erlaubt sind Komma, Doppelpunkt, Punkt.
- Brand-Rot `#d12020` nur für aktive Zustände; Radien, Schatten und Dauern kommen aus den Design-Tokens, keine eigenen Werte.
- Tests gehören in denselben PR wie der Code. Modultests laufen gegen echtes Postgres, nicht gegen Mocks.
- Dauer-Texte: Bundesvorstand „meist innerhalb von zwei Tagen", Gruppenvorstand „meist innerhalb weniger Tage".
- Befehle laufen im Wurzelverzeichnis des Worktrees. Tests einzeln aufrufen, nie die ganze Suite.

---

# PR A: Ablauf, Absicht, Gruppenwahl, Aufnahme ohne Gruppe

Ergebnis: Wer in seiner Stadt keine Gruppe findet, wählt zwischen Gründen, Dabeisein und Beitreten. Nutzertyp und Hauptgruppe stimmen mit dem überein, was der Bildschirm sagt.

### Task A1: `placeOf` bevorzugt die gewählte Gruppe

Heute gewinnt die erste Orts-Antwort in Fragen-Reihenfolge. Nach der neuen Abzweigung gibt es zwei: `studienort` (Stadt ohne Gruppe) und `gruppenwahl` (Gruppe). Das Antragsziel muss die Gruppe sein.

**Files:**

- Modify: `modules/onboarding/src/answers.ts:78-105` (`placeOf`)
- Test: `modules/onboarding/src/answers.test.ts`

**Interfaces:**

- Consumes: nichts aus früheren Tasks.
- Produces: `placeOf(flow, answers, env)` unverändert in der Signatur, geändert in der Reihenfolge: eine Antwort der Art `group`, deren ID in `env.groups` steht, schlägt jede Antwort der Art `city`.

- [ ] **Step 1: Failing test schreiben**

An `modules/onboarding/src/answers.test.ts` anhängen (der vorhandene Import-Block und die dort schon benutzten Testdaten bleiben):

```ts
describe("placeOf mit mehreren Orts-Antworten", () => {
  const env = {
    groups: [{ id: "grp_koeln", name: "BDAS Köln", city: "Köln" }],
    bdajGroupId: null,
    netzwerkGroupId: null,
  };

  it("nimmt die gewählte Gruppe, nicht die vorher getippte Stadt", () => {
    const answers = {
      studienort: { kind: "city" as const, city: "Passau" },
      gruppenwahl: { kind: "group" as const, groupId: "grp_koeln" },
    };
    expect(placeOf(FLOW, answers, env)).toEqual({
      groupId: "grp_koeln",
      groupName: "BDAS Köln",
      city: "Köln",
    });
  });

  it("bleibt bei der Stadt, wenn keine Gruppe gewählt wurde", () => {
    const answers = { studienort: { kind: "city" as const, city: "Passau" } };
    expect(placeOf(FLOW, answers, env)).toEqual({
      groupId: null,
      groupName: null,
      city: "Passau",
    });
  });

  it("ignoriert eine Gruppen-ID, die der Server nicht kennt", () => {
    const answers = {
      studienort: { kind: "city" as const, city: "Passau" },
      gruppenwahl: { kind: "group" as const, groupId: "grp_erfunden" },
    };
    expect(placeOf(FLOW, answers, env)).toEqual({
      groupId: null,
      groupName: null,
      city: "Passau",
    });
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm vitest run modules/onboarding/src/answers.test.ts`
Expected: FAIL, der erste Fall liefert `city: "Passau"` statt der Gruppe.

- [ ] **Step 3: `placeOf` umbauen**

`modules/onboarding/src/answers.ts`, die Funktion `placeOf` ersetzen:

```ts
/**
 * Der Ort, auf den sich das Ergebnis bezieht. Eine gewählte Gruppe schlägt eine
 * getippte Stadt: wer in einer Stadt ohne Gruppe studiert und einer Gruppe
 * anderswo beitritt, bewirbt sich dort, nicht im Netzwerk. Eine Gruppen-ID
 * zählt nur, wenn sie in `env.groups` steht — die Liste kommt vom Server, die
 * ID vom Browser.
 */
export function placeOf(
  flow: Flow,
  answers: Answers,
  env: FlowEnv,
): { groupId: string | null; groupName: string | null; city: string | null } {
  let city: string | null = null;

  for (const id of Object.keys(flow.questions)) {
    const value = answers[id];
    if (!isPlace(value)) continue;
    if (value.kind === "group") {
      const group = env.groups.find((g) => g.id === value.groupId);
      if (group) return { groupId: group.id, groupName: group.name, city: group.city };
      continue;
    }
    if (value.kind === "city" && city === null) city = value.city;
  }

  return { groupId: null, groupName: null, city };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm vitest run modules/onboarding/src/answers.test.ts modules/onboarding/src/target.test.ts modules/onboarding/src/text.test.ts`
Expected: PASS. `target.test.ts` und `text.test.ts` decken auf, ob die geänderte Reihenfolge ein bestehendes Verhalten bricht.

- [ ] **Step 5: Commit**

```bash
git add modules/onboarding/src/answers.ts modules/onboarding/src/answers.test.ts
git commit -m "feat(onboarding): gewählte Gruppe schlägt getippte Stadt"
```

---

### Task A2: Fragetyp `group_choice`

Eine Frage, die eine Gruppe aus einer Liste wählen lässt. Kein Suchen nach Städten wie bei `place`, keine Möglichkeit zu überspringen.

**Files:**

- Modify: `modules/onboarding/src/types.ts:33-52` (`Question`)
- Modify: `modules/onboarding/src/answers.ts:20-45` (`clean`)
- Modify: `modules/onboarding/src/validate-flow.ts:62-78` (`questionTexts`) und `:120-126` (`has_group`-Prüfung)
- Test: `modules/onboarding/src/answers.test.ts`, `modules/onboarding/src/validate-flow.test.ts`

**Interfaces:**

- Consumes: `placeOf` aus Task A1.
- Produces: `Question`-Variante `{ kind: "group_choice"; title: string; help: string }`. Gültige Antwort ist ausschließlich `{ kind: "group", groupId: string }` (der Typ `PlaceAnswer`, ohne `city` und ohne `skipped`).

- [ ] **Step 1: Failing test schreiben**

In `modules/onboarding/src/answers.test.ts`:

```ts
describe("sanitizeAnswers für group_choice", () => {
  const flow = {
    version: 1,
    start: "wahl",
    questions: {
      wahl: { kind: "group_choice" as const, title: "Welche Gruppe?", help: "Such dir eine aus." },
    },
    rules: [{ from: "wahl", to: { outcome: "student" as const } }],
    outcomes: FLOW.outcomes,
  };

  it("nimmt eine Gruppen-Antwort an", () => {
    expect(sanitizeAnswers(flow, { wahl: { kind: "group", groupId: "grp_1" } })).toEqual({
      wahl: { kind: "group", groupId: "grp_1" },
    });
  });

  it("verwirft Stadt und Überspringen", () => {
    expect(sanitizeAnswers(flow, { wahl: { kind: "city", city: "Köln" } })).toEqual({});
    expect(sanitizeAnswers(flow, { wahl: { kind: "skipped" } })).toEqual({});
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm vitest run modules/onboarding/src/answers.test.ts`
Expected: FAIL, TypeScript kennt `group_choice` nicht.

- [ ] **Step 3: Typ und Bereinigung ergänzen**

`modules/onboarding/src/types.ts`, in der Union `Question` nach der `place`-Variante:

```ts
  | {
      /** Eine Gruppe aus der Liste aller aktiven Hochschulgruppen. */
      readonly kind: "group_choice";
      readonly title: string;
      readonly help: string;
    };
```

`modules/onboarding/src/answers.ts`, in `clean` einen Zweig ergänzen:

```ts
    case "group_choice": {
      if (!isObj(value) || value["kind"] !== "group") return null;
      const groupId = text(value["groupId"], MAX_ID);
      return groupId ? { kind: "group", groupId } : null;
    }
```

`modules/onboarding/src/validate-flow.ts`, in `questionTexts` vor dem Schluss-`return base`:

```ts
  if (q.kind === "group_choice") return base;
```

und in `validateFlow` die `has_group`-Prüfung weiten, damit auch eine Gruppenwahl geprüft werden darf:

```ts
      } else if (q.kind !== "place" && q.kind !== "group_choice") {
        errors.push(`Regel ab „${r.from}": has_group braucht eine Orts- oder Gruppenfrage.`);
      }
```

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm vitest run modules/onboarding/src/answers.test.ts modules/onboarding/src/validate-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/onboarding/src/types.ts modules/onboarding/src/answers.ts modules/onboarding/src/validate-flow.ts modules/onboarding/src/answers.test.ts
git commit -m "feat(onboarding): Fragetyp group_choice"
```

---

### Task A3: Ablauf mit Absicht und Gruppenwahl

**Files:**

- Modify: `modules/onboarding/src/flow.ts` (ganze Datei, siehe unten)
- Modify: `modules/onboarding/src/types.ts:8-15` (`OUTCOME_IDS`)
- Modify: `modules/onboarding/src/index.ts:7` und `modules/onboarding/src/client.ts:10` (neue Frage-Konstanten exportieren)
- Test: `modules/onboarding/src/next-step.test.ts`, `modules/onboarding/src/validate-flow.test.ts`

**Interfaces:**

- Consumes: `group_choice` aus Task A2.
- Produces: `QUESTION_ABSICHT = "absicht"`, `QUESTION_GRUPPENWAHL = "gruppenwahl"`, Ausgang `"student_gruendung"`. `FLOW.version` ist 2. Die Antwortwerte der Absicht sind `"gruendung"`, `"dabei"`, `"beitreten"`.

- [ ] **Step 1: Failing test schreiben**

In `modules/onboarding/src/next-step.test.ts` anhängen:

```ts
describe("Abzweigung ohne Gruppe vor Ort", () => {
  const env = {
    groups: [{ id: "grp_koeln", name: "BDAS Köln", city: "Köln" }],
    bdajGroupId: null,
    netzwerkGroupId: "grp_netz",
  };
  const basis = {
    typ: "studiere",
    name: { firstName: "Lea", lastName: "Muster" },
    studienort: { kind: "city" as const, city: "Passau" },
  };

  it("fragt nach der Absicht, wenn die Stadt keine Gruppe hat", () => {
    expect(nextStep(FLOW, basis, env)).toEqual({ kind: "question", question: "absicht" });
  });

  it("führt Gründung zum eigenen Ausgang", () => {
    expect(nextStep(FLOW, { ...basis, absicht: "gruendung" }, env)).toEqual({
      kind: "outcome",
      outcome: "student_gruendung",
    });
  });

  it("führt Dabeisein zum Ausgang ohne Gruppe", () => {
    expect(nextStep(FLOW, { ...basis, absicht: "dabei" }, env)).toEqual({
      kind: "outcome",
      outcome: "student_ohne_gruppe",
    });
  });

  it("fragt bei Beitritt nach der Gruppe und endet dann als Studentin mit Gruppe", () => {
    const wahl = { ...basis, absicht: "beitreten" };
    expect(nextStep(FLOW, wahl, env)).toEqual({ kind: "question", question: "gruppenwahl" });
    expect(
      nextStep(FLOW, { ...wahl, gruppenwahl: { kind: "group", groupId: "grp_koeln" } }, env),
    ).toEqual({ kind: "outcome", outcome: "student" });
  });

  it("überspringt die Absicht, wenn es die Gruppe vor Ort gibt", () => {
    const mitGruppe = { ...basis, studienort: { kind: "group" as const, groupId: "grp_koeln" } };
    expect(nextStep(FLOW, mitGruppe, env)).toEqual({ kind: "outcome", outcome: "student" });
  });
});
```

In `modules/onboarding/src/validate-flow.test.ts` anhängen:

```ts
it("beschreibt die Ausgänge ohne Gruppe als Studierende", () => {
  expect(FLOW.outcomes.student_gruendung.userType).toBe("student");
  expect(FLOW.outcomes.student_gruendung.target).toBe("keine");
  expect(FLOW.outcomes.student_ohne_gruppe.userType).toBe("student");
  expect(FLOW.outcomes.student_ohne_gruppe.target).toBe("keine");
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm vitest run modules/onboarding/src/next-step.test.ts modules/onboarding/src/validate-flow.test.ts`
Expected: FAIL, „no rule leaves studienort" beziehungsweise unbekannter Ausgang `student_gruendung`.

- [ ] **Step 3: Ausgang ergänzen und Ablauf erweitern**

`modules/onboarding/src/types.ts`, `OUTCOME_IDS`:

```ts
export const OUTCOME_IDS = [
  "student",
  "student_gruendung",
  "student_ohne_gruppe",
  "alumnus",
  "foerderer",
  "bdaj",
] as const;
```

`modules/onboarding/src/flow.ts`, Konstanten oben ergänzen:

```ts
export const QUESTION_ABSICHT = "absicht";
export const QUESTION_GRUPPENWAHL = "gruppenwahl";
```

`FLOW.version` auf `2` setzen. In `questions` nach `QUESTION_STUDIENORT` einfügen:

```ts
    [QUESTION_ABSICHT]: {
      kind: "choice",
      title: "In {stadt} gibt es noch kein BDAS. Was möchtest du?",
      help: "Beides geht: mit uns etwas aufbauen oder erst mal nur dabei sein.",
      options: [
        {
          value: "gruendung",
          label: "Ein BDAS in {stadt} gründen",
          hint: "Wir helfen dir beim Aufbau",
          icon: "studium",
        },
        {
          value: "dabei",
          label: "Erst mal einfach dabei sein",
          hint: "Ohne Gruppe vor Ort",
          icon: "herz",
        },
        {
          value: "beitreten",
          label: "Dem nächstgelegenen BDAS beitreten",
          hint: "Auch wenn es etwas weiter weg ist",
          icon: "bdaj",
        },
      ],
    },
    [QUESTION_GRUPPENWAHL]: {
      kind: "group_choice",
      title: "Welchem BDAS möchtest du beitreten?",
      help: "Such dir eine Gruppe aus. Über deine Bewerbung entscheidet dann der Vorstand dieser Gruppe.",
    },
```

Die Regeln ab `QUESTION_STUDIENORT` ersetzen:

```ts
    {
      from: QUESTION_STUDIENORT,
      when: { kind: "has_group", question: QUESTION_STUDIENORT },
      to: { outcome: "student" },
    },
    { from: QUESTION_STUDIENORT, to: { question: QUESTION_ABSICHT } },
    {
      from: QUESTION_ABSICHT,
      when: { kind: "equals", question: QUESTION_ABSICHT, value: "beitreten" },
      to: { question: QUESTION_GRUPPENWAHL },
    },
    {
      from: QUESTION_ABSICHT,
      when: { kind: "equals", question: QUESTION_ABSICHT, value: "gruendung" },
      to: { outcome: "student_gruendung" },
    },
    { from: QUESTION_ABSICHT, to: { outcome: "student_ohne_gruppe" } },
    { from: QUESTION_GRUPPENWAHL, to: { outcome: "student" } },
```

In `outcomes` den bisherigen `student_ohne_gruppe` ersetzen und `student_gruendung` ergänzen:

```ts
    student_gruendung: {
      userType: "student",
      target: "keine",
      title: "Du wärst als Student*in in {stadt} angemeldet, mit uns an deiner Seite für die Gründung.",
      benefits: [
        "Unterstützung, wenn du in {stadt} eine Gruppe gründen willst",
        "Bundesweites Netzwerk alevitischer Studierender",
        "Einladungen zu überregionalen Events",
      ],
      decider: "Der Bundesvorstand",
      duration: "meist innerhalb von zwei Tagen",
      submittedTo: "beim Bundesvorstand",
    },
    student_ohne_gruppe: {
      userType: "student",
      target: "keine",
      title: "Du wärst als Student*in in {stadt} angemeldet, auch ohne Gruppe vor Ort.",
      benefits: [
        "Bundesweites Netzwerk alevitischer Studierender",
        "Einladungen zu überregionalen Events",
        "Zugang zur Plattform, auch ohne Gruppe in deiner Stadt",
      ],
      decider: "Der Bundesvorstand",
      duration: "meist innerhalb von zwei Tagen",
      submittedTo: "beim Bundesvorstand",
    },
```

Der Hinweis unter `studienort` beschreibt jetzt nur noch die Lage, die Absichtsfrage kommt gleich danach:

```ts
      noGroupHint: "In {eingabe} finden wir keine Gruppe. Kein Problem, es geht gleich weiter.",
```

Neue Konstanten exportieren, in `modules/onboarding/src/index.ts`:

```ts
export {
  FLOW,
  QUESTION_ABSICHT,
  QUESTION_AKTIV_WO,
  QUESTION_GRUPPENWAHL,
  QUESTION_NAME,
  QUESTION_STUDIENORT,
  QUESTION_TYP,
} from "./flow";
```

und in `modules/onboarding/src/client.ts`:

```ts
export { FLOW, QUESTION_GRUPPENWAHL, QUESTION_NAME } from "./flow";
```

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm vitest run modules/onboarding/src/next-step.test.ts modules/onboarding/src/validate-flow.test.ts modules/onboarding/src/index.test.ts modules/onboarding/src/target.test.ts`
Expected: PASS. `validate-flow.test.ts` prüft unter anderem, dass jeder Ausgang erreichbar ist und dass `{stadt}` nur nach einer Pflicht-Ortsfrage steht.

- [ ] **Step 5: Commit**

```bash
git add modules/onboarding/src/flow.ts modules/onboarding/src/types.ts modules/onboarding/src/index.ts modules/onboarding/src/client.ts modules/onboarding/src/next-step.test.ts modules/onboarding/src/validate-flow.test.ts
git commit -m "feat(onboarding): Absicht und Gruppenwahl ohne Gruppe vor Ort"
```

---

### Task A4: Bildschirm für die Gruppenwahl

**Files:**

- Create: `apps/web/app/_onboarding/ui/GruppenwahlScreen.tsx`
- Modify: `apps/web/app/_onboarding/OnboardingWizard.tsx:100-120` (Zweig für den neuen Fragetyp)
- Test: `apps/web/app/_onboarding/OnboardingWizard.interaction.test.tsx`

**Interfaces:**

- Consumes: `QUESTION_GRUPPENWAHL` und den Fragetyp aus Task A3.
- Produces: `GruppenwahlScreen({ question, ctx, env, value, onAnswer })`, wobei `onAnswer` einen `PlaceAnswer` der Art `group` liefert.

- [ ] **Step 1: Failing test schreiben**

In `apps/web/app/_onboarding/OnboardingWizard.interaction.test.tsx` anhängen. Die Datei testet ohne
Testing-Library: `render()`, `click()`, `type()`, `submit()` und `heading()` sind dort oben definiert,
`PROPS.env.groups` enthält „BDAS Berlin" in Berlin.

```tsx
it("führt von der Absicht zur Gruppenwahl und wählt eine Gruppe", () => {
  render();
  click("Ich studiere gerade");
  type("onb-vorname", "Lea");
  type("onb-nachname", "Muster");
  submit();

  type("onb-ort", "Passau");
  click("Weiter");
  expect(heading()).toBe("In Passau gibt es noch kein BDAS. Was möchtest du?");

  click("Dem nächstgelegenen BDAS beitreten");
  expect(heading()).toBe("Welchem BDAS möchtest du beitreten?");

  click("BDAS Berlin");
  expect(heading()).toBe("Du wärst als Student*in bei BDAS Berlin angemeldet.");
});

it("führt die Gründung zum eigenen Ergebnis", () => {
  render();
  click("Ich studiere gerade");
  type("onb-vorname", "Lea");
  type("onb-nachname", "Muster");
  submit();

  type("onb-ort", "Passau");
  click("Weiter");
  click("Ein BDAS in Passau gründen");
  expect(heading()).toContain("mit uns an deiner Seite");
});
```

Der erwartete Ergebnistitel „Du wärst als Student\*in bei {gruppe} angemeldet." kommt aus Task B1.
Solange PR A allein läuft, steht dort noch der alte Titel; in diesem Task den heutigen Text
erwarten und ihn in Task B1 mit umstellen.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm --filter @bdas/web exec vitest run app/_onboarding/OnboardingWizard.interaction.test.tsx`
Expected: FAIL, die Überschrift der Gruppenwahl erscheint nicht, weil der Wizard den Fragetyp nicht rendert.

- [ ] **Step 3: Bildschirm bauen und einhängen**

`apps/web/app/_onboarding/ui/GruppenwahlScreen.tsx`:

```tsx
"use client";

import React, { useState } from "react";

import { Field, Input } from "@bdas/design-system";
import {
  fillText,
  type AnswerValue,
  type FlowEnv,
  type PlaceAnswer,
  type Question,
  type TextContext,
} from "@bdas/onboarding/client";

const HIT =
  "flex w-full flex-col rounded-bdas border border-bdas-soft bg-bdas-surface px-4 py-3 text-left " +
  "transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-red/40";

const norm = (s: string): string => s.trim().toLocaleLowerCase("de");

export function GruppenwahlScreen({
  question,
  ctx,
  env,
  value,
  onAnswer,
}: {
  question: Extract<Question, { kind: "group_choice" }>;
  ctx: TextContext;
  env: FlowEnv;
  value: AnswerValue | undefined;
  onAnswer: (value: PlaceAnswer) => void;
}) {
  const [query, setQuery] = useState("");
  const chosen =
    typeof value === "object" && value !== null && "kind" in value && value.kind === "group"
      ? value.groupId
      : null;

  const q = norm(query);
  const groups = [...env.groups]
    .sort((a, b) => a.city.localeCompare(b.city, "de"))
    .filter((g) => q === "" || norm(g.name).includes(q) || norm(g.city).includes(q));

  return (
    <section className="flex flex-col gap-4">
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        {fillText(question.title, ctx)}
      </h2>
      <Field label="Gruppe suchen" htmlFor="onb-gruppe" hint={fillText(question.help, ctx)}>
        <Input
          id="onb-gruppe"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          placeholder="z. B. Köln"
        />
      </Field>

      {groups.length === 0 ? (
        <p aria-live="polite" className="text-sm text-bdas-ink-body">
          Keine Gruppe gefunden. Probier es mit einem anderen Namen.
        </p>
      ) : (
        <ul aria-label="Gruppen" className="flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                aria-pressed={chosen === g.id}
                className={HIT}
                onClick={() => onAnswer({ kind: "group", groupId: g.id })}
              >
                <span className="font-medium text-bdas-ink">{g.name}</span>
                <span className="text-sm text-bdas-ink-muted">{g.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

`apps/web/app/_onboarding/OnboardingWizard.tsx`: Import ergänzen und nach dem `place`-Zweig einfügen:

```tsx
    } else if (q?.kind === "group_choice") {
      screen = (
        <GruppenwahlScreen
          key={questionId}
          question={q}
          ctx={ctx}
          env={env}
          value={value}
          onAnswer={answer(questionId)}
        />
      );
    }
```

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @bdas/web exec vitest run app/_onboarding/OnboardingWizard.interaction.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_onboarding/ui/GruppenwahlScreen.tsx apps/web/app/_onboarding/OnboardingWizard.tsx apps/web/app/_onboarding/OnboardingWizard.interaction.test.tsx
git commit -m "feat(onboarding): Bildschirm für die Gruppenwahl"
```

---

### Task A5: Aufnahme ohne Gruppe mit angegebener Rolle

**Files:**

- Modify: `modules/members/src/services/status.ts:126-153` (`acceptAsAlumnus` wird `acceptWithoutGroup`)
- Modify: `modules/members/src/index.ts:14`
- Test: `modules/members/src/index.test.ts`

**Interfaces:**

- Consumes: nichts aus früheren Tasks.
- Produces: `acceptWithoutGroup(db: Db, memberId: string, actor: Actor, role: string | null): Promise<Member>`. `acceptAsAlumnus` gibt es nicht mehr.

- [ ] **Step 1: Failing test schreiben**

In `modules/members/src/index.test.ts` die beiden vorhandenen `acceptAsAlumnus`-Stellen (Zeilen 495
und 945) auf den neuen Namen umstellen und diesen Test ergänzen. Die Datei legt Mitglieder mit
`createProfile(t.db, { userId, firstName, lastName })` an (ohne `primaryGroupId` bleibt die
Hauptgruppe leer), der Nutzer dazu entsteht mit der dortigen Hilfe `createUser`; `BOARD` ist der
Bundesvorstands-Actor, `listRoleHolders` liest die vergebenen Rollen.

```ts
it("nimmt ohne Rolle auf, wenn keine verlangt wird", async () => {
  await createUser("usr_ohne_rolle", "ohne-rolle@example.test");
  const m = await createProfile(t.db, {
    userId: "usr_ohne_rolle",
    firstName: "Studentin",
    lastName: "OhneGruppe",
  });

  const accepted = await acceptWithoutGroup(t.db, m.id, BOARD, null);

  expect(accepted.status).toBe("active");
  const holders = await listRoleHolders(t.db);
  expect(holders.filter((h) => h.memberId === m.id)).toEqual([]);
});

it("vergibt die Rolle, wenn eine verlangt wird", async () => {
  await createUser("usr_mit_rolle", "mit-rolle@example.test");
  const m = await createProfile(t.db, {
    userId: "usr_mit_rolle",
    firstName: "Ehemalige",
    lastName: "OhneGruppe",
  });

  await acceptWithoutGroup(t.db, m.id, BOARD, "alumnus");

  const holders = await listRoleHolders(t.db);
  expect(holders.filter((h) => h.memberId === m.id).map((h) => h.role)).toEqual(["alumnus"]);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm db:up && pnpm vitest run modules/members/src/index.test.ts`
Expected: FAIL, `acceptWithoutGroup` ist nicht definiert.

- [ ] **Step 3: Dienst verallgemeinern**

`modules/members/src/services/status.ts`, `acceptAsAlumnus` ersetzen:

```ts
/**
 * Aufnahme einer Person ohne Gruppe (Spec 2026-09-16 §5.2, korrigiert im
 * Einstiegs-Design vom 2026-09-22). Nur der Bundesvorstand: ohne Gruppe gibt es
 * keinen lokalen Vorstand, der entscheiden könnte (ADR 0021).
 *
 * Welche Rolle die Aufnahme mitbringt, entscheidet der Aufrufer: Ehemalige
 * bekommen `alumnus`, Studierende ohne Gruppe vor Ort keine. Das Mitglieder-
 * Modul liest dafür keine Profiltabelle (CLAUDE.md §1 Regel 1).
 *
 * Zwei Schritte, bewusst ohne gemeinsame Transaktion — beide Services öffnen
 * ihre eigene. Bricht es dazwischen ab, ist die Person aufgenommen, aber nicht
 * markiert; ein zweiter Aufruf vervollständigt das. Die Reihenfolge ist
 * Pflicht: `grantRole` markiert nur aufgenommene Personen.
 */
export async function acceptWithoutGroup(
  db: Db,
  memberId: string,
  actor: Actor,
  role: string | null,
): Promise<Member> {
  if (!isFederalBoard(actor.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand nimmt Personen ohne Gruppe auf.");
  }
  const existing = await getMember(db, memberId);
  if (!existing) throw new NotFoundError("Mitglied nicht gefunden.");
  if (existing.primaryGroupId !== null) {
    throw new ValidationError(
      "Diese Person gehört einer Gruppe an, über die Aufnahme entscheidet deren Vorstand.",
    );
  }

  const member = await transitionStatus(db, memberId, "active", actor);
  if (role !== null) await grantRole(db, memberId, role, actor, null);
  return member;
}
```

`modules/members/src/index.ts`:

```ts
export { transitionStatus, approveMember, acceptWithoutGroup, type Actor } from "./services/status";
```

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm vitest run modules/members/src/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/members/src/services/status.ts modules/members/src/index.ts modules/members/src/index.test.ts
git commit -m "feat(members): Aufnahme ohne Gruppe mit angegebener Rolle"
```

---

### Task A6: Pool-Seite kennt die neuen Ausgänge

**Files:**

- Modify: `apps/web/app/(board)/federal/pool/kind-label.ts`
- Modify: `apps/web/app/(board)/federal/pool/actions.ts:47-80` (`acceptAsAlumnusAction` wird `acceptWithoutGroupAction`)
- Modify: `apps/web/app/(board)/federal/pool/page.tsx:13,77-82` (Import und Prop)
- Modify: `apps/web/app/(board)/federal/pool/PoolTable.tsx:69-82,120-133` (Rückfrage, Knopftext, Prop-Name)
- Test: `apps/web/app/(board)/federal/pool/kind-label.test.ts`

**Interfaces:**

- Consumes: `acceptWithoutGroup` aus Task A5, die Ausgänge aus Task A3.
- Produces: `acceptWithoutGroupAction(userId: string): Promise<AcceptResult>`; `PoolTable`-Prop heißt `onAccept`.

- [ ] **Step 1: Failing test schreiben**

In `apps/web/app/(board)/federal/pool/kind-label.test.ts`:

```ts
it("benennt die Ausgänge ohne Gruppe", () => {
  expect(
    poolKindLabel({ status: "pending", intent: { outcome: "student_gruendung", status: "abgeschickt" } }),
  ).toBe("Möchte eine Gruppe gründen");
  expect(
    poolKindLabel({ status: "pending", intent: { outcome: "student_ohne_gruppe", status: "abgeschickt" } }),
  ).toBe("Bewirbt sich ohne Gruppe");
  expect(
    poolKindLabel({ status: "pending", intent: { outcome: "alumnus", status: "abgeschickt" } }),
  ).toBe("Bewirbt sich als Alumna oder Alumnus");
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm --filter @bdas/web exec vitest run "app/(board)/federal/pool/kind-label.test.ts"`
Expected: FAIL, die ersten beiden Fälle liefern „Bewerber:in".

- [ ] **Step 3: Beschriftung, Aktion und Tabelle anpassen**

`kind-label.ts`:

```ts
  if (input.status === "active") return "Mitglied ohne Gruppe";
  if (input.intent?.status === "details_offen") return "Angaben offen";
  if (input.intent?.outcome === "student_gruendung") return "Möchte eine Gruppe gründen";
  if (input.intent?.outcome === "student_ohne_gruppe") return "Bewirbt sich ohne Gruppe";
  if (input.intent?.outcome === "alumnus") return "Bewirbt sich als Alumna oder Alumnus";
  return "Bewerber:in";
```

`actions.ts`, die Aktion ersetzen (Importe `acceptWithoutGroup` aus `@bdas/members` und `getProfile` aus `@bdas/profile` ergänzen):

```ts
/**
 * Nimmt eine Person ohne Gruppe auf. Die Rolle hängt am Nutzertyp: Ehemalige
 * werden als `alumnus` markiert, Studierende ohne Gruppe vor Ort bekommen keine
 * Rolle. Der Dienst prüft jede Regel noch einmal, der Knopf ist Bequemlichkeit,
 * kein Tor.
 */
export async function acceptWithoutGroupAction(userId: string): Promise<AcceptResult> {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me || !canSeeFederalScope(me.grants)) return { ok: false, error: "Keine Berechtigung." };

  const member = await getMemberByUserId(db, userId);
  if (!member) return { ok: false, error: "Person nicht gefunden." };
  if (member.status !== "pending")
    return { ok: false, error: "Diese Person ist bereits aufgenommen." };

  const profile = await getProfile(db, userId);
  const role = profile?.nutzertyp === "alumnus" ? "alumnus" : null;

  try {
    await acceptWithoutGroup(db, member.id, { userId: me.user.id, grants: me.grants }, role);
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/federal/pool");
  return { ok: true };
}
```

`PoolTable.tsx`: Prop `onAcceptAlumnus` in `onAccept` umbenennen, Funktion `acceptAlumnus` in `accept`, und die Texte:

```tsx
      !window.confirm(
        `${row.name} ohne Gruppe aufnehmen? Die Aufnahme lässt sich nicht rückgängig machen.`,
      )
```

```tsx
      setNotice(res.ok ? `${row.name} ist aufgenommen.` : res.error);
```

```tsx
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => accept(r)}>
                      Ohne Gruppe aufnehmen
                    </Button>
```

`page.tsx`: Import auf `acceptWithoutGroupAction` umstellen und `onAccept={acceptWithoutGroupAction}` übergeben.

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @bdas/web exec vitest run "app/(board)/federal/pool" && pnpm --filter @bdas/web typecheck`
Expected: PASS, und der Typcheck findet keine übrig gebliebene Verwendung des alten Namens.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(board)/federal/pool"
git commit -m "feat(pool): Aufnahme ohne Gruppe für alle Nutzertypen"
```

---

### Task A7: E2E für beide neuen Wege

**Files:**

- Modify: `e2e/onboarding-angaben.e2e.ts`
- Test: derselbe Lauf

**Interfaces:**

- Consumes: alles aus PR A. Hilfen `wizardSignup`, `verify`, `login`, `seedGroup`, `journeyByEmail`, `openRequestTargetByEmail` sind vorhanden.
- Produces: keine neuen Schnittstellen.

- [ ] **Step 1: Failing test schreiben**

In `e2e/onboarding-angaben.e2e.ts` anhängen:

```ts
test("Studentin ohne Gruppe vor Ort: Gründung landet ohne Gruppenantrag im Pool", async ({
  page,
}) => {
  const city = `Gruendstadt${Math.random().toString(36).slice(2, 7)}`;
  const email = uniqueEmail("ang-gruendung");

  await page.goto("/mitmachen");
  await page.getByRole("button", { name: /Ich studiere gerade/ }).click();
  await page.getByLabel("Vorname").fill("Mira");
  await page.getByLabel("Nachname").fill("E2E");
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByLabel("Stadt oder Hochschule").fill(city);
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: new RegExp(`Ein BDAS in ${city} gründen`) }).click();
  await expect(page.getByRole("heading", { name: /mit uns an deiner Seite/ })).toBeVisible();

  await page.getByRole("button", { name: "Passt so, Konto anlegen" }).click();
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.locator("#consent").check();
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(page.getByRole("heading", { name: /Wir haben dir eine Mail geschickt/ })).toBeVisible();

  await verify(page, email);
  await login(page, email, undefined, { expect: "mitmachen" });
  await pickCombo(page, "studienfachKategorie", "Ingenieurwissenschaften");
  await pickCombo(page, "studiengang", "Maschinenbau/-wesen");
  await page.locator("#abschlussart").selectOption("bachelor");
  await page.getByRole("button", { name: "Weiter" }).click();
  await pickCombo(page, "uni", UNI);
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByLabel("Geburtsdatum").fill("2003-05-06");
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.locator("#gefundenDurch").selectOption("webseite");
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: "Bewerbung abschicken" }).click();

  await expect(page).toHaveURL(/\/mitmachen\/fertig$/);
  expect(await openRequestTargetByEmail(email)).toBeNull();
  expect(await journeyByEmail(email)).toMatchObject({
    status: "abgeschickt",
    outcome: "student_gruendung",
  });
});

test("Studentin ohne Gruppe vor Ort: Beitritt bewirbt sich bei der gewählten Gruppe", async ({
  page,
}) => {
  const city = `Fernstadt${Math.random().toString(36).slice(2, 7)}`;
  const groupId = await seedGroup({
    slug: uniqueSlug("e2e-fern"),
    name: `BDAS Fernkoeln${Math.random().toString(36).slice(2, 5)}`,
    city: `Fernkoeln${Math.random().toString(36).slice(2, 5)}`,
  });
  const email = uniqueEmail("ang-beitritt");

  await page.goto("/mitmachen");
  await page.getByRole("button", { name: /Ich studiere gerade/ }).click();
  await page.getByLabel("Vorname").fill("Nil");
  await page.getByLabel("Nachname").fill("E2E");
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByLabel("Stadt oder Hochschule").fill(city);
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: /Dem nächstgelegenen BDAS beitreten/ }).click();
  await page.getByRole("button", { name: /BDAS Fernkoeln/ }).click();
  await expect(page.getByRole("heading", { name: /Du wärst als Student\*in/ })).toBeVisible();

  await page.getByRole("button", { name: "Passt so, Konto anlegen" }).click();
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.locator("#consent").check();
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await verify(page, email);
  await login(page, email, undefined, { expect: "mitmachen" });
  await pickCombo(page, "studienfachKategorie", "Ingenieurwissenschaften");
  await pickCombo(page, "studiengang", "Maschinenbau/-wesen");
  await page.locator("#abschlussart").selectOption("bachelor");
  await page.getByRole("button", { name: "Weiter" }).click();
  await pickCombo(page, "uni", UNI);
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByLabel("Geburtsdatum").fill("2003-05-06");
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.locator("#gefundenDurch").selectOption("webseite");
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: "Bewerbung abschicken" }).click();

  await expect(page).toHaveURL(/\/mitmachen\/fertig$/);
  expect(await openRequestTargetByEmail(email)).toBe(groupId);
});
```

Die Knopfbeschriftung „Passt so, Konto anlegen" kommt aus PR B. Solange PR A allein läuft, heißt der Knopf noch „Passt — Konto anlegen"; in diesem Task den heutigen Text verwenden und ihn in Task B2 mit umstellen.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm --filter @bdas/web build && PUBLIC_SITE_URL=http://localhost:3001 npx playwright test e2e/onboarding-angaben.e2e.ts --project=onboarding -g "ohne Gruppe vor Ort"`
Expected: FAIL vor dem Bau von A3/A4, PASS danach.

- [ ] **Step 3: Nichts implementieren**

Dieser Task hat keinen eigenen Produktionscode. Schlägt er fehl, liegt der Fehler in A1 bis A6 und gehört dort behoben.

- [ ] **Step 4: Ganzen Einstiegs-Lauf prüfen**

Run: `PUBLIC_SITE_URL=http://localhost:3001 npx playwright test e2e/onboarding-angaben.e2e.ts e2e/onboarding-einstieg.e2e.ts e2e/onboarding-konto.e2e.ts --project=onboarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/onboarding-angaben.e2e.ts
git commit -m "test(e2e): Gründung und Beitritt ohne Gruppe vor Ort"
```

---

### Task A8: ADR 0050

**Files:**

- Create: `docs/decisions/0050-studierende-ohne-gruppe.md`

- [ ] **Step 1: ADR schreiben**

```markdown
# ADR 0050 — Studierende ohne Gruppe behalten ihren Nutzertyp

**Status:** Accepted
**Date:** 2026-09-22
**Affects:** `modules/onboarding`, `modules/members`, `apps/web`
**Spec:** [`docs/superpowers/specs/2026-09-22-einstieg-korrekturen-design.md`](../superpowers/specs/2026-09-22-einstieg-korrekturen-design.md)

## Kontext

Der Einstieg führte Studierende, in deren Stadt es keine Gruppe gibt, als Förderer\*innen und
beantragte für sie die Netzwerk-Gruppe. Der Bildschirm sagte „Student\*in", die Datenbank sagte
„Förderer\*in". Für Gründung oder Beitritt anderswo gab es keinen Weg.

## Entscheidung

1. Der Nutzertyp bleibt `student`, die Hauptgruppe bleibt leer. Eine leere Hauptgruppe ist für
   diesen Weg der Normalfall, kein Fehler.
2. Nach einem Studienort ohne Gruppe fragt der Ablauf nach der Absicht: gründen, einfach dabei
   sein oder einer anderen Gruppe beitreten. Gründen und Dabeisein führen zu je einem eigenen
   Ausgang mit `target: "keine"`, der Beitritt zur Gruppenwahl und damit zum normalen Antrag.
3. Über Bewerbungen ohne Gruppe entscheidet der Bundesvorstand im Pool. `acceptAsAlumnus` wird zu
   `acceptWithoutGroup` mit angegebener Rolle; welche Rolle passt, entscheidet die App anhand des
   Nutzertyps, damit das Mitglieder-Modul keine Profiltabelle liest.

## Konsequenzen

- Der Pool zeigt zwei neue Arten: „Möchte eine Gruppe gründen" und „Bewirbt sich ohne Gruppe".
- Die Netzwerk-Gruppe bleibt der Weg für Förderer\*innen (ADR 0046), nicht mehr für Studierende.
- Wer später einer Gruppe beitritt, füllt die Hauptgruppe über den normalen Gruppenantrag.
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/0050-studierende-ohne-gruppe.md
git commit -m "docs(adr): 0050 Studierende ohne Gruppe behalten ihren Nutzertyp"
```

---

# PR B: Texte

Ergebnis: Der Einstieg spricht so, wie im Design beschrieben. Keine Rollenzuteilung, keine falsche Dauer, keine doppelte Frage, keine langen Gedankenstriche.

### Task B1: Texte im Ablauf und ein Test dagegen

**Files:**

- Modify: `modules/onboarding/src/flow.ts` (Titel der Ausgänge, BDAJ-Hinweis, Dauer)
- Test: `modules/onboarding/src/validate-flow.test.ts`

**Interfaces:**

- Consumes: die Ausgänge aus Task A3.
- Produces: Endfassungen der Ablauf-Texte.

- [ ] **Step 1: Failing test schreiben**

In `modules/onboarding/src/validate-flow.test.ts`:

```ts
it("kommt ohne lange Gedankenstriche aus", () => {
  const texts = [
    ...Object.values(FLOW.questions).flatMap((q) => {
      const base = [q.title, q.help];
      if (q.kind === "choice") return [...base, ...q.options.flatMap((o) => [o.label, o.hint])];
      if (q.kind === "place") return [...base, q.noGroupHint];
      return base;
    }),
    ...Object.values(FLOW.outcomes).flatMap((o) => [
      o.title,
      o.decider,
      o.duration,
      o.submittedTo,
      o.hint ?? "",
      ...o.benefits,
    ]),
  ];
  expect(texts.filter((t) => t.includes("—"))).toEqual([]);
});

it("verspricht dem Bundesvorstand zwei Tage", () => {
  for (const id of ["student_gruendung", "student_ohne_gruppe", "alumnus", "foerderer", "bdaj"] as const) {
    expect(FLOW.outcomes[id].duration).toBe("meist innerhalb von zwei Tagen");
  }
  expect(FLOW.outcomes.student.duration).toBe("meist innerhalb weniger Tage");
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm vitest run modules/onboarding/src/validate-flow.test.ts`
Expected: FAIL, mehrere Texte enthalten `—`, und die Dauern stehen noch auf zwei Wochen.

- [ ] **Step 3: Texte setzen**

In `modules/onboarding/src/flow.ts` ersetzen:

| Stelle                            | Neuer Text                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `typ.help`                        | „Damit wir dich an die richtige Stelle bringen, dauert keine Minute."          |
| Karte `bdaj`, `hint`              | „Für alle Mitglieder der BDAJ"                                                 |
| `aktiv_wo.help`                   | „Gruppe oder Stadt, so finden dich Leute von damals. Du kannst das überspringen." |
| `student.title`                   | „Du wärst als Student\*in bei {gruppe} angemeldet."                            |
| `alumnus.title`                   | „Du wärst als Alumna oder Alumnus angemeldet."                                 |
| `foerderer.title`                 | „Du wärst als Förderer\*in angemeldet."                                        |
| `bdaj.title`                      | „Du wärst als BDAJ-Mitglied angemeldet."                                       |
| `duration` bei allen Bundesvorstands-Ausgängen | „meist innerhalb von zwei Tagen"                                  |
| `student.duration`                | „meist innerhalb weniger Tage"                                                 |

Der Titel von `student` nennt die Gruppe statt der Stadt: nach einem Beitritt zu einer Gruppe
anderswo wäre „in {stadt}" die Stadt der Gruppe, nicht der Studienort. Die übrigen Titel für
Studierende ohne Gruppe bleiben bei `{stadt}` wie in Task A3 gesetzt.

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm vitest run modules/onboarding/src/validate-flow.test.ts modules/onboarding/src/text.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/onboarding/src/flow.ts modules/onboarding/src/validate-flow.test.ts
git commit -m "feat(onboarding): neue Ergebnis- und Dauertexte"
```

---

### Task B2: Ergebnis-Bildschirm fragt nach

**Files:**

- Modify: `apps/web/app/_onboarding/ui/ErgebnisScreen.tsx:40-54`
- Modify: `apps/web/app/_onboarding/ui/ResumeButton.tsx:28-31` (Knopftext)
- Modify: `e2e/helpers/onboarding.ts:38` und `e2e/onboarding-angaben.e2e.ts` (neuer Knopftext)
- Test: `apps/web/app/_onboarding/OnboardingWizard.interaction.test.tsx`

**Interfaces:**

- Consumes: die Ausgangstexte aus Task B1.
- Produces: Knopfbeschriftungen „Passt so, Konto anlegen" und „Etwas ändern"; der Satz „Passt das so?" steht über den Knöpfen.

- [ ] **Step 1: Failing test schreiben**

```tsx
it("fragt auf dem Ergebnis nach und bietet beide Wege an", () => {
  render();
  click("Ich möchte unterstützen");
  type("onb-vorname", "Ada");
  type("onb-nachname", "Muster");
  submit();

  expect(container.textContent).toContain("Passt das so?");
  const labels = [...container.querySelectorAll("button")].map((b) => b.textContent);
  expect(labels).toContain("Passt so, Konto anlegen");
  expect(labels).toContain("Etwas ändern");
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm --filter @bdas/web exec vitest run app/_onboarding/OnboardingWizard.interaction.test.tsx`
Expected: FAIL, die Knöpfe heißen noch „Passt — Konto anlegen" und „Doch etwas anderes".

- [ ] **Step 3: Bildschirm anpassen**

`apps/web/app/_onboarding/ui/ErgebnisScreen.tsx`, den Block ab dem Entscheider-Kasten ersetzen:

```tsx
      <div className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-4">
        <p className="font-semibold text-bdas-ink">Wer entscheidet?</p>
        <p className="text-bdas-ink-body">
          {fillText(outcome.decider, ctx)}, {outcome.duration}.
        </p>
      </div>
      <p className="font-medium text-bdas-ink">Passt das so?</p>
      <div className="flex flex-wrap gap-3">
        {confirm ?? (
          <Button type="button" onClick={onConfirm}>
            Passt so, Konto anlegen
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onChange}>
          Etwas ändern
        </Button>
      </div>
```

`ResumeButton.tsx`: „Passt — weiter" wird „Passt so, weiter".

In `e2e/helpers/onboarding.ts` und `e2e/onboarding-angaben.e2e.ts` die alten Beschriftungen auf die neuen umstellen.

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @bdas/web exec vitest run app/_onboarding && PUBLIC_SITE_URL=http://localhost:3001 npx playwright test e2e/onboarding-einstieg.e2e.ts --project=onboarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_onboarding e2e/helpers/onboarding.ts e2e/onboarding-angaben.e2e.ts
git commit -m "feat(onboarding): Ergebnis fragt nach, statt zuzuteilen"
```

---

### Task B3: Fertig-Seite ohne Entscheider im Satzinneren

**Files:**

- Modify: `apps/web/app/mitmachen/fertig/page.tsx:70-76`

**Interfaces:**

- Consumes: `outcome.duration` aus Task B1.
- Produces: keine.

- [ ] **Step 1: Failing test schreiben**

Neu anlegen: `apps/web/app/mitmachen/fertig/sentence.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { FLOW } from "@bdas/onboarding";

import { waitingSentence } from "./sentence";

describe("waitingSentence", () => {
  it("nennt die Dauer, ohne den Entscheider in den Satz zu setzen", () => {
    expect(waitingSentence(FLOW.outcomes.bdaj)).toBe(
      "Wir melden uns per Mail, sobald die Entscheidung da ist, meist innerhalb von zwei Tagen.",
    );
  });

  it("kommt ohne lange Gedankenstriche aus", () => {
    for (const outcome of Object.values(FLOW.outcomes)) {
      expect(waitingSentence(outcome)).not.toContain("—");
    }
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm --filter @bdas/web exec vitest run app/mitmachen/fertig/sentence.test.ts`
Expected: FAIL, `./sentence` gibt es nicht.

- [ ] **Step 3: Satz auslagern und einsetzen**

Neu: `apps/web/app/mitmachen/fertig/sentence.ts`

```ts
import type { Outcome } from "@bdas/onboarding";

/** Der Wartesatz. Der Entscheider steht bewusst nicht im Satz: sein Text ist als
 *  Satzanfang geschrieben („Der Bundesvorstand") und sähe eingeschoben falsch aus. */
export function waitingSentence(outcome: Outcome): string {
  return `Wir melden uns per Mail, sobald die Entscheidung da ist, ${outcome.duration}.`;
}
```

In `page.tsx` den Absatz ersetzen:

```tsx
            <p className="text-bdas-ink-body">{waitingSentence(outcome)}</p>
```

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @bdas/web exec vitest run app/mitmachen/fertig`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/mitmachen/fertig
git commit -m "feat(onboarding): Wartesatz ohne Entscheider im Satzinneren"
```

---

### Task B4: Herkunftsfrage nach der Person

**Files:**

- Modify: `apps/web/app/_onboarding/details.ts:73-78` (`copy` für `gefundenDurch`)
- Modify: `apps/web/app/profil/ProfileFields.tsx:195,215,231-233` (Feldbeschriftungen)
- Test: `apps/web/app/_onboarding/details.test.ts`

**Interfaces:**

- Consumes: keine.
- Produces: keine.

- [ ] **Step 1: Failing test schreiben**

In `apps/web/app/_onboarding/details.test.ts`:

```ts
it("fragt bei der Herkunft nach der Person, nicht nach dem Kanal", () => {
  const screen = detailScreens("student").find((s) => s.id === "gefundenDurch");
  expect(screen?.title).toBe("Wer hat dich zu uns gebracht?");
  expect(screen?.why).toBe(
    "Die meisten kommen über jemanden, den sie kennen. Nenn uns diese Person, dann weiß der Vorstand gleich, wo du herkommst.",
  );
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm --filter @bdas/web exec vitest run app/_onboarding/details.test.ts`
Expected: FAIL, Titel ist noch „Wie hast du uns gefunden?".

- [ ] **Step 3: Texte setzen**

`apps/web/app/_onboarding/details.ts`, im `copy`-Zweig `gefundenDurch`:

```ts
    case "gefundenDurch":
      return {
        title: "Wer hat dich zu uns gebracht?",
        why: "Die meisten kommen über jemanden, den sie kennen. Nenn uns diese Person, dann weiß der Vorstand gleich, wo du herkommst.",
      };
```

`apps/web/app/profil/ProfileFields.tsx`:

- Auswahlfeld: `label="Wie hast du BDAS gefunden?"` wird `label="Wie bist du zu uns gekommen?"`
- Empfehlerfeld: `label="Wer hat es dir empfohlen?"` wird `label="Wer hat dich empfohlen?"`
- Hinweis am Freitext: `Der Vorstand liest das bei deiner Bewerbung. Maximal ${MAX_VORSTELLUNG} Zeichen.` bleibt inhaltlich, enthält keinen langen Gedankenstrich.

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @bdas/web exec vitest run app/_onboarding app/profil`
Expected: PASS. Schlägt ein E2E-Schritt später an der Beschriftung fehl, dort mit umstellen.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_onboarding/details.ts apps/web/app/_onboarding/details.test.ts apps/web/app/profil/ProfileFields.tsx
git commit -m "feat(onboarding): Herkunftsfrage fragt nach der Person"
```

---

### Task B5: Übrige Einstiegstexte

**Files:**

- Modify: `apps/web/app/_onboarding/ui/KontoScreen.tsx:44`, `apps/web/app/_onboarding/ui/MailGesendet.tsx:22-27`, `apps/web/app/_onboarding/AngabenWizard.tsx:80`, `apps/web/app/_onboarding/details.ts` (übrige `why`-Texte), `apps/web/app/mitmachen/angaben/page.tsx:47-50`
- Test: `apps/web/app/_onboarding/details.test.ts`

**Interfaces:**

- Consumes: keine.
- Produces: keine.

- [ ] **Step 1: Failing test schreiben**

```ts
it("kommt in allen Angaben-Texten ohne lange Gedankenstriche aus", () => {
  for (const typ of ["student", "alumnus", "foerderer", "bdaj"] as const) {
    for (const s of detailScreens(typ)) {
      expect(`${s.title} ${s.why}`).not.toContain("—");
    }
  }
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm --filter @bdas/web exec vitest run app/_onboarding/details.test.ts`
Expected: FAIL, „Erst der Bereich, dann das Fach — so finden dich …" und „Freiwillig — so erkennt dich …".

- [ ] **Step 3: Texte setzen**

| Datei                    | Alt                                                        | Neu                                                        |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `details.ts` Studienfach | „Erst der Bereich, dann das Fach — so finden dich …"       | „Erst der Bereich, dann das Fach, so finden dich …"        |
| `details.ts` Foto        | „Freiwillig — so erkennt dich dein Vorstand …"             | „Freiwillig. So erkennt dich dein Vorstand …"              |
| `MailGesendet.tsx`       | „… mit ein paar Angaben weiter — auf jedem Gerät."         | „… mit ein paar Angaben weiter, auf jedem Gerät."          |
| `AngabenWizard.tsx`      | „Willkommen zurück, {Vorname} — fast geschafft."           | „Willkommen zurück, {Vorname}, fast geschafft."            |
| `KontoScreen.tsx`        | „Fast geschafft — dein Konto"                              | „Fast geschafft, dein Konto"                               |
| `angaben/page.tsx`       | Hinweis zur verschwundenen Gruppe                          | unverändert, enthält keinen langen Gedankenstrich          |

Die E2E-Erwartung „Willkommen zurück, Lea — fast geschafft." in `e2e/onboarding-angaben.e2e.ts` mit umstellen.

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @bdas/web exec vitest run app/_onboarding && PUBLIC_SITE_URL=http://localhost:3001 npx playwright test e2e/onboarding-angaben.e2e.ts --project=onboarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_onboarding apps/web/app/mitmachen e2e/onboarding-angaben.e2e.ts
git commit -m "feat(onboarding): Einstiegstexte ohne lange Gedankenstriche"
```

---

### Task B6: ADR 0052

**Files:**

- Create: `docs/decisions/0052-bdaj-mitglieder-statt-funktionaere.md`

- [ ] **Step 1: ADR schreiben**

```markdown
# ADR 0052 — BDAJ-Mitglieder statt Funktionär\*innen

**Status:** Accepted
**Date:** 2026-09-22
**Affects:** `modules/onboarding`, `modules/profile`, `apps/web`
**Spec:** [`docs/superpowers/specs/2026-09-22-einstieg-korrekturen-design.md`](../superpowers/specs/2026-09-22-einstieg-korrekturen-design.md)

## Kontext

ADR 0047 schneidet die Rechte für BDAJ-Leute zu und nennt sie durchgehend „Funktionär\*innen".
Im Einstieg las sich das als Bedingung: „Für Funktionär\*innen des BDAJ". Gemeint war nie eine
Einschränkung auf Vorstandsämter, sondern der Weg für alle, die in der BDAJ aktiv sind.

## Entscheidung

1. In allen Texten heißen sie „BDAJ-Mitglieder". Die Karte im Einstieg bleibt „Ich bin in der BDAJ
   aktiv", der Hinweis darunter wird „Für alle Mitglieder der BDAJ".
2. Die Auswahl der Funktion in Teil 3 bleibt unverändert (Vorstandsmitglied, Mitglied,
   Geschäftsstelle). Sie unterscheidet die Art des Zugangs, nicht die Berechtigung mitzumachen.
3. Der Rechte-Zuschnitt aus ADR 0047 bleibt gültig; nur die Sprache ändert sich.

## Konsequenzen

- Der Nutzertyp-Schlüssel `bdaj` und die Gruppenart `affiliate` bleiben, wie sie sind.
- Wer als BDAJ-Mitglied aufgenommen ist und zusätzlich in einer BDAS-Gruppe mitmachen will,
  wechselt die Hauptgruppe über den vorhandenen Gruppenantrag. Eine gleichzeitige Mitgliedschaft in
  zwei Gruppen bleibt ungelöst und ist bewusst nicht Teil dieses Durchgangs.
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/0052-bdaj-mitglieder-statt-funktionaere.md
git commit -m "docs(adr): 0052 BDAJ-Mitglieder statt Funktionär*innen"
```

---

# PR C: Bestätigungslink meldet an

### Task C1: `verifyEmail` gibt eine Sitzung zurück

**Files:**

- Modify: `modules/auth/src/services/verify.ts`
- Modify: `modules/auth/src/index.ts:10`
- Test: `modules/auth/src/index.test.ts`

**Interfaces:**

- Consumes: `createSession` und `issueToken`, beide modulintern.
- Produces: `verifyEmail(db, token, ctx?: { ip: string; userAgent?: string })` mit `VerifyResult = { userId, email, alreadyVerified, sessionToken: string | null }`. `sessionToken` ist nur bei einer frischen Bestätigung gesetzt.

- [ ] **Step 1: Failing test schreiben**

In `modules/auth/src/index.test.ts` anhängen. Die Datei legt Nutzer mit `register(...)` an und hat
den Bestätigungs-Token als `reg.verifyToken`:

```ts
it("legt bei der ersten Bestätigung eine Sitzung an, beim zweiten Klick nicht", async () => {
  const reg = await register(
    t.db,
    { email: "direkt@example.de", password: "Verysecret!23", consent: true },
    { ip: "1.1.1.1", publicSiteUrl: "https://bdas.de" },
  );

  const first = await verifyEmail(t.db, reg.verifyToken, { ip: "1.1.1.1" });
  expect(first.alreadyVerified).toBe(false);
  expect(first.sessionToken).toBeTruthy();

  const again = await verifyEmail(t.db, reg.verifyToken, { ip: "1.1.1.1" });
  expect(again.alreadyVerified).toBe(true);
  expect(again.sessionToken).toBeNull();
});

it("bleibt ohne Kontext benutzbar", async () => {
  const reg = await register(
    t.db,
    { email: "ohne-kontext@example.de", password: "Verysecret!23", consent: true },
    { ip: "1.1.1.1", publicSiteUrl: "https://bdas.de" },
  );

  const result = await verifyEmail(t.db, reg.verifyToken);

  expect(result.alreadyVerified).toBe(false);
  expect(result.sessionToken).toBeTruthy();
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm vitest run modules/auth/src/index.test.ts`
Expected: FAIL, `sessionToken` gibt es nicht.

- [ ] **Step 3: Dienst erweitern**

`modules/auth/src/services/verify.ts`:

```ts
import { createSession } from "../sessions";
import { isFederalBoardEmail } from "../federal";
import { issueToken, type Role } from "../sso";

export type VerifyContext = { readonly ip: string; readonly userAgent?: string | undefined };

export type VerifyResult = {
  readonly userId: string;
  readonly email: string;
  readonly alreadyVerified: boolean;
  /** Nur bei der ersten Bestätigung: der Link ist einmalig und befristet, also
   *  darf er die Sitzung gleich mitbringen (ADR 0051). */
  readonly sessionToken: string | null;
};

export async function verifyEmail(
  db: Db,
  token: string,
  ctx?: VerifyContext,
): Promise<VerifyResult> {
```

Im `alreadyVerified`-Zweig `sessionToken: null` ergänzen. Nach dem Veröffentlichen des Ereignisses:

```ts
  const session = await createSession(db, {
    userId: row.user.id,
    ip: ctx?.ip ?? null,
    ...(ctx?.userAgent !== undefined ? { userAgent: ctx.userAgent } : {}),
  });
  const roles: Role[] = isFederalBoardEmail(row.user.emailNormalized) ? ["federal_board"] : [];
  const sessionToken = await issueToken({
    userId: row.user.id,
    email: row.user.emailNormalized,
    roles,
    sessionId: session.id,
  });

  return {
    userId: row.user.id,
    email: row.user.emailNormalized,
    alreadyVerified: false,
    sessionToken,
  };
```

Den Import von `isFederalBoardEmail` an den Pfad anpassen, den `services/login.ts` benutzt.

`modules/auth/src/index.ts`:

```ts
export { verifyEmail, type VerifyResult, type VerifyContext } from "./services/verify";
```

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm vitest run modules/auth/src/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/auth/src/services/verify.ts modules/auth/src/index.ts modules/auth/src/index.test.ts
git commit -m "feat(auth): Bestätigung bringt die Sitzung mit"
```

---

### Task C2: Verify-Seite setzt die Sitzung

**Files:**

- Modify: `apps/web/app/verifizieren/[token]/page.tsx`
- Test: `e2e/onboarding-angaben.e2e.ts`

**Interfaces:**

- Consumes: `verifyEmail` mit `sessionToken` aus Task C1, `setSessionCookie` aus `apps/web/lib/auth-cookie.ts`, `resolveOnboardingLanding` aus `apps/web/app/_onboarding/landing.ts`.
- Produces: keine.

- [ ] **Step 1: Failing test schreiben**

In `e2e/onboarding-angaben.e2e.ts`:

```ts
test("der Bestätigungslink meldet direkt an", async ({ page }) => {
  const city = `Direktstadt${Math.random().toString(36).slice(2, 7)}`;
  await seedGroup({ slug: uniqueSlug("e2e-dir"), name: `BDAS ${city}`, city });
  const email = uniqueEmail("ang-direkt");

  await wizardSignup(page, { email, typ: /Ich studiere gerade/, firstName: "Deniz", place: city });
  await verify(page, email);

  await expect(page).toHaveURL(/\/mitmachen\/angaben$/);
  await expect(page.getByText("Willkommen zurück, Deniz, fast geschafft.")).toBeVisible();
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `PUBLIC_SITE_URL=http://localhost:3001 npx playwright test e2e/onboarding-angaben.e2e.ts --project=onboarding -g "meldet direkt an"`
Expected: FAIL, die Seite landet auf `/anmelden`.

- [ ] **Step 3: Seite anpassen**

`apps/web/app/verifizieren/[token]/page.tsx`, den Block nach `verifyEmail` ersetzen:

```tsx
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "0.0.0.0";
  const userAgent = h.get("user-agent") ?? undefined;

  let result: VerifyResult | null = null;
  let error: string | null = null;
  try {
    result = await verifyEmail(getDb(), params.token, {
      ip,
      ...(userAgent !== undefined ? { userAgent } : {}),
    });
  } catch (err) {
    error = isAppError(err) ? err.message : "Unbekannter Fehler.";
  }

  if (result && !result.alreadyVerified) {
    // Der Link ist einmalig und befristet, also darf er anmelden (ADR 0051).
    // Das Ziel rechnet der Server aus, nichts davon kommt aus der URL.
    if (result.sessionToken) setSessionCookie(result.sessionToken);
    if (onboardingEnabled()) {
      const landing = await resolveOnboardingLanding(getDb(), result.userId);
      redirect(landing ?? "/account");
    }
    if (isFlagOn("profile")) redirect("/profil");
    redirect("/account");
  }
```

Importe ergänzen: `headers` aus `next/headers`, `setSessionCookie` aus `../../../lib/auth-cookie`, `resolveOnboardingLanding` aus `../../_onboarding/landing`, Typ `VerifyResult` aus `@bdas/auth`. `buildAnmeldenUrl` und `getJourneyForUser` werden hier nicht mehr gebraucht; die Importe entfernen, falls sie sonst nirgends in der Datei stehen.

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @bdas/web build && PUBLIC_SITE_URL=http://localhost:3001 npx playwright test e2e/onboarding-angaben.e2e.ts e2e/onboarding-konto.e2e.ts --project=onboarding && npx playwright test e2e/auth.e2e.ts e2e/resend-verification.e2e.ts --project=mobile-chromium`
Expected: PASS. Die beiden letzten Läufe decken ab, dass der alte Weg ohne Einstiegs-Flag weiter funktioniert.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/verifizieren e2e/onboarding-angaben.e2e.ts
git commit -m "feat(auth): Bestätigungslink meldet an und führt weiter"
```

---

### Task C3: ADR 0051 und Sicherheitsdurchsicht

**Files:**

- Create: `docs/decisions/0051-bestaetigungslink-meldet-an.md`

- [ ] **Step 1: ADR schreiben**

```markdown
# ADR 0051 — Der Bestätigungslink legt die Sitzung an

**Status:** Accepted
**Date:** 2026-09-22
**Affects:** `modules/auth`, `apps/web`
**Spec:** [`docs/superpowers/specs/2026-09-22-einstieg-korrekturen-design.md`](../superpowers/specs/2026-09-22-einstieg-korrekturen-design.md)

## Kontext

Der Bestätigungslink führte auf die Anmeldung, ohne ein Wort zur Bestätigung. Wer gerade sein
Passwort gesetzt hat, musste es sofort wieder eintippen, und der Einstieg riss genau an der Stelle
ab, an der er weitergehen sollte.

## Entscheidung

1. Bei der ersten Einlösung legt `verifyEmail` die Sitzung an und gibt ihr Token zurück. Die Seite
   setzt das Sitzungs-Cookie und leitet auf das serverseitig berechnete Ziel weiter.
2. Ein schon benutzter oder abgelaufener Link legt keine Sitzung an. Gültigkeit, Einmaligkeit und
   Rate-Limits bleiben unverändert.
3. Es gibt keine exportierte Funktion, die eine Sitzung für eine beliebige Nutzerkennung anlegt.
   Die Sitzung entsteht innerhalb des Auth-Moduls an genau der Stelle, die den Token prüft.

## Konsequenzen

- Der Link in der Mail ist ein Anmeldemittel. Wer ihn weitergibt, gibt einen Zugang weiter, bis er
  eingelöst ist oder abläuft.
- Das Weiterleitungsziel kommt nie aus der URL, damit der Link nicht zum offenen Umleiter wird.
- Die Bestätigungsseite bleibt für den zweiten Klick erhalten und erklärt dort, was zu tun ist.
```

- [ ] **Step 2: Sicherheitsdurchsicht anstoßen**

Dieser PR fasst Auth an. Vor dem Merge `/security-review` laufen lassen (CLAUDE.md §4).

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0051-bestaetigungslink-meldet-an.md
git commit -m "docs(adr): 0051 Bestätigungslink legt die Sitzung an"
```

---

# PR D: Foto als Profilbild

### Task D1: Runder Platzhalter statt Datei-Ablage

**Files:**

- Modify: `apps/web/app/profil/PhotoField.tsx`
- Create: `apps/web/app/profil/PhotoField.test.tsx`

**Interfaces:**

- Consumes: `DropZone` und `CropDialog`, beide unverändert.
- Produces: keine neuen Schnittstellen; `PhotoField({ storageKey, onChange })` bleibt wie es ist.

- [ ] **Step 1: Failing test schreiben**

Das Repo hat keine Testing-Library; Komponententests laufen wie in
`app/_onboarding/OnboardingWizard.interaction.test.tsx` direkt über `react-dom/client`.

Neu: `apps/web/app/profil/PhotoField.test.tsx`

```tsx
/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_upload/upload-image", () => ({ uploadImage: vi.fn() }));

import { PhotoField } from "./PhotoField";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PhotoField", () => {
  it("zeigt einen runden Platzhalter zum Auswählen", () => {
    act(() => root.render(<PhotoField storageKey={null} onChange={vi.fn()} />));

    const button = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Foto auswählen",
    );
    expect(button).toBeTruthy();
    expect(button?.className).toContain("rounded-full");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm --filter @bdas/web exec vitest run app/profil/PhotoField.test.tsx`
Expected: FAIL, es gibt keinen Knopf „Foto auswählen".

- [ ] **Step 3: Darstellung umbauen**

In `apps/web/app/profil/PhotoField.tsx` den Inhalt der `DropZone` ersetzen. Der Knopf trägt den
Kreis, das Vorschaubild sitzt darin, darunter stehen die Aktionen:

```tsx
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Foto auswählen"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={
            "flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full " +
            "border border-dashed border-bdas-strong bg-bdas-overlay-faint text-bdas-ink-muted " +
            "transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover " +
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-red/40"
          }
        >
          {preview ? (
            <img src={preview} alt="Dein Profilbild" className="h-full w-full object-cover" />
          ) : (
            <span className="px-3 text-center text-sm">Foto hierher ziehen oder tippen</span>
          )}
        </button>
        <div className="flex flex-col gap-1 text-sm">
          {preview || storageKey ? (
            <>
              <button
                type="button"
                className="text-left text-bdas-red hover:underline"
                onClick={() => inputRef.current?.click()}
              >
                Foto ändern
              </button>
              <button
                type="button"
                className="text-left text-bdas-ink-body hover:underline"
                onClick={() => {
                  setLocalPreview(null);
                  onChange("");
                }}
              >
                Entfernen
              </button>
            </>
          ) : (
            <p className="text-bdas-ink-muted">JPG oder PNG, bis 5 MB.</p>
          )}
        </div>
      </div>
```

Der vorhandene `<input type="file">`, der Fehlertext und der Zuschnitt-Dialog bleiben unverändert
darunter stehen. Die Grenze „bis 5 MB" aus `PROFILE_IMAGE` ablesen und nicht fest eintippen, falls
dort ein anderer Wert steht.

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @bdas/web exec vitest run app/profil && PUBLIC_SITE_URL=http://localhost:3001 npx playwright test e2e/profile-photo-crop.e2e.ts --project=mobile-chromium`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/profil/PhotoField.tsx apps/web/app/profil/PhotoField.test.tsx
git commit -m "feat(profil): Profilbild als runder Platzhalter"
```

---

# PR E: Lange Gedankenstriche plattformweit

### Task E1: Bestandsaufnahme

**Files:**

- Create: `/private/tmp/einstieg-gedankenstriche.txt` (Arbeitsdatei, nicht committen)

- [ ] **Step 1: Vorkommen sammeln**

```bash
grep -rn "—" apps/web modules core infra \
  --include="*.ts" --include="*.tsx" --include="*.json" --include="*.sql" \
  | grep -v "/node_modules/" | grep -v "\.next/" \
  > /private/tmp/einstieg-gedankenstriche.txt
wc -l /private/tmp/einstieg-gedankenstriche.txt
```

- [ ] **Step 2: Nach Art sortieren**

Die Liste in drei Gruppen teilen und die Einordnung in der Arbeitsdatei notieren:

1. Text, den ein Mensch auf der Seite liest (Oberflächen, Feldbeschriftungen, Fehlermeldungen).
2. Text in Mails und Seed-Inhalten.
3. Kommentare, Testnamen, Dokumente. Diese Gruppe bleibt unangetastet.

- [ ] **Step 3: Commit**

Kein Commit, die Arbeitsdatei bleibt außerhalb des Repos.

---

### Task E2: Oberflächentexte ersetzen

**Files:**

- Modify: alle Dateien aus Gruppe 1 der Bestandsaufnahme

- [ ] **Step 1: Ersetzen**

Je Vorkommen entscheiden: Einschub wird Komma, Erläuterung wird Doppelpunkt, eigenständiger Satz
wird Punkt. Kein pauschales `sed`: ein Gedankenstrich zwischen Zahlen („2 — 3") oder in einem
Namen darf nicht zum Komma werden.

- [ ] **Step 2: Tests laufen lassen**

Run: `pnpm --filter @bdas/web exec vitest run app && pnpm vitest run modules`
Expected: PASS. Tests, die auf den alten Text prüfen, mit umstellen.

- [ ] **Step 3: Sichtprüfung**

Run: `pnpm --filter @bdas/web exec next dev -p 3001`
Die geänderten Seiten im Browser öffnen und auf Sätze prüfen, die nach dem Ersetzen holprig
klingen. Solche Sätze umschreiben, statt den Strich nur zu ersetzen.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "style: Oberflächentexte ohne lange Gedankenstriche"
```

---

### Task E3: Mails und Seed-Inhalte

**Files:**

- Modify: alle Dateien aus Gruppe 2 der Bestandsaufnahme

- [ ] **Step 1: Ersetzen**

Wie in Task E2. Bei Mail-Vorlagen auch die Betreffzeilen prüfen.

- [ ] **Step 2: Tests laufen lassen**

Run: `pnpm vitest run modules/notifications modules/newsletter`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style: Mail- und Seed-Texte ohne lange Gedankenstriche"
```

---

## Reihenfolge und Abhängigkeiten

```
PR A (A1 -> A2 -> A3 -> A4, A5 -> A6, dann A7, A8)
  |
  v
PR B (B1 -> B2 -> B3 -> B4 -> B5 -> B6)     PR C (C1 -> C2 -> C3)     PR D (D1)
  |                                               |                        |
  +-----------------------------------------------+------------------------+
                                |
                                v
                              PR E
```

PR B baut auf den Ausgängen aus PR A auf. PR C und PR D hängen an nichts aus A und B und können
parallel laufen. PR E kommt zuletzt, damit die vorherigen PRs keine Konflikte in denselben Zeilen
erzeugen.

## Vor dem Merge von PR A

`BDAS_FLAG_ONBOARDING` in der Produktion prüfen (Abschnitt 4 der Spec):

```bash
vercel env ls production | grep BDAS_FLAG_ONBOARDING
```

Ist das Flag an, vor dem Merge zählen, wie viele Journeys mit `outcome = 'student_ohne_gruppe'`
bereits abgeschickt sind, und diese Zahl im PR notieren.
