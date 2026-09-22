# Onboarding-Wizard PR 3 — Web: Fenster, Teil 1 (Fragen) und Teil 2 (Konto) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hinter dem Flag `onboarding` öffnet „Mitglied werden" ein Fenster über der aktuellen Seite (auf dem Handy in voller Höhe). Darin beantwortet man die Fragen aus `@bdas/onboarding`, sieht sein Ergebnis, legt ein Konto an und bekommt die Bestätigungsmail. Die Journey liegt danach auf dem Server.

**Architecture:** Neue Route `/mitmachen` — als Fenster über eine Next.js-Intercepting-Route im neuen Slot `app/@modal`, als volle Seite bei direktem Aufruf. Beide rendern denselben Client-Baustein `OnboardingWizard`. Der Wizard-Zustand ist ein reiner Reducer über `walk`/`nextStep` aus PR 1 und liegt in `sessionStorage`. Eine Server-Aktion legt Konto, Member-Zeile und Journey an und rechnet das Ergebnis selbst nach. Die bisherige Seite `/registrieren` bleibt unverändert; nur die Links zeigen bei eingeschaltetem Flag auf `/mitmachen`.

**Tech Stack:** Next.js 14 App Router (Parallel + Intercepting Routes, Server Actions, `useFormState`), React 18, Tailwind mit den Tokens aus `@bdas/design-system`, Vitest (Unit, happy-dom), Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-16-onboarding-wizard-design.md`](../specs/2026-09-16-onboarding-wizard-design.md) — §2, §4.1, §4.2, §4.4, §5.3 Punkte 1–2, §5.5, §6, §7 (E2E/A11y), §8 Punkt 3.

**Voraussetzungen:** PR 1 (`@bdas/onboarding`) und PR 2 (`universityCity` in `@bdas/profile`) sind auf `main`.

## Global Constraints

- **Nur betroffene Tests ausführen.** Niemals `pnpm test` über die ganze Suite. Einzelne Dateien: `pnpm vitest run <pfad>`; E2E: `pnpm e2e <datei>`.
- **Vitest erfasst zusätzlich Kopien unter `.claude/worktrees/`.** Nur der Treffer ohne `worktrees/` im Pfad zählt.
- **E2E:** vor dem Lauf prüfen, dass nichts Fremdes auf Port 3000 **und 3001** läuft (`lsof -i :3000 -i :3001`) und dass `pnpm --filter @bdas/web build` nach der letzten Änderung lief — Playwright startet `next start`, nicht `next dev`.
- **Flag-Gating (CLAUDE.md §1 Regel 6):** Jede neue Route ruft `requireOnboardingFlag()`. Bei ausgeschaltetem Flag ändert sich für Besucher nichts: alle Links zeigen weiter auf `/registrieren`.
- **Tokens (CLAUDE.md §7):** keine Hex-Werte, keine freien Radien/Schatten/Dauern. Markenrot nur für die gewählte Karte und den Hauptknopf.
- **Keine Chat-Optik, keine KI** (Spec §2 Punkt 7).
- **Sicherheit:** Ergebnis und Gruppen-ID aus dem Browser zählen nie; die Server-Aktion rechnet mit `loadFlowEnv` nach. Nichts geht vor der Einwilligung an den Server.
- **`exactOptionalPropertyTypes` ist an.**
- **Nicht in diesem PR:** Teil 3, Weiterleitung nach der Bestätigung, Login-Weiterleitung, Anträge (PR 4); Einstiegskontext-Begrüßungen (PR 6); Entfernen von `/registrieren` und des alten Wizards (Aufräum-PR nach Go-Live).
- **Branch:** `feat/onboarding-fenster`, abgezweigt von `origin/main`. Vor dem Push `git log origin/main..HEAD` prüfen.
- **Reviews:** `/review` und `/security-review` (Auth).
- **Commit-Fußzeile:** jeder Commit endet mit `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Abweichungen von der Spec (bewusst)

1. **Route `/mitmachen` statt `/registrieren` als Fenster.** Intercepting Routes sind statisch; ein Fenster über `/registrieren` ließe sich nicht per Flag abschalten. Mit einer eigenen Route bleibt `/registrieren` bei ausgeschaltetem Flag exakt wie heute, und die Links wechseln mit dem Flag. `/registrieren` wird erst im Aufräum-PR nach dem Go-Live umgeleitet.
2. **Kein eigener Willkommens-Bildschirm.** Der genehmigte Handy-Entwurf (Bildschirm 1) setzt die Begrüßung über die erste Frage („Schön, dass du da bist! Was beschreibt dich am besten?") und den Link „Du hast schon ein Konto? Anmelden" darunter. Das spart einen Bildschirm (Spec §2 Punkt 3).
3. **E2E auf einem zweiten Server (Port 3001) mit eingeschaltetem Flag.** Die bestehenden Specs laufen weiter gegen Port 3000 ohne das Flag; sie bleiben unverändert, bis der Aufräum-PR den alten Weg entfernt.

## Dateistruktur

| Datei                                                                                | Verantwortung                                            |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `core/design-system/src/components/Dialog.tsx` (+ Test)                              | neue Option `sheet`: auf dem Handy volle Höhe            |
| `apps/web/app/_onboarding/flag.ts` (+ Test)                                          | `onboardingEnabled`, `requireOnboardingFlag`, `joinHref` |
| `apps/web/app/_onboarding/place-search.ts` (+ Test)                                  | Suche nach Stadt/Hochschule → Gruppe                     |
| `apps/web/app/_onboarding/wizard-state.ts` (+ Test)                                  | reiner Reducer für Teil 1 und 2                          |
| `apps/web/app/_onboarding/storage.ts` (+ Test)                                       | `sessionStorage` lesen/schreiben                         |
| `apps/web/app/_onboarding/types.ts`                                                  | `WizardProps`                                            |
| `apps/web/app/_onboarding/load.ts`                                                   | Server: `loadWizardProps`                                |
| `apps/web/app/_onboarding/actions.ts` (+ Test)                                       | Server-Aktion `createAccountAction`                      |
| `apps/web/app/registrieren/finish.ts`                                                | gemeinsam: Bestätigungsmail + Newsletter nach `register` |
| `apps/web/app/registrieren/ConsentFields.tsx`                                        | gemeinsam: Einwilligung + Newsletter-Kästchen            |
| `apps/web/app/_onboarding/ui/*.tsx`                                                  | `Icon`, `AnswerCard`, `Progress`, Bildschirme            |
| `apps/web/app/_onboarding/OnboardingWizard.tsx` (+ Test)                             | Client-Container                                         |
| `apps/web/app/_onboarding/WizardModal.tsx`, `WizardPage.tsx`                         | Hüllen: Fenster und Seite                                |
| `apps/web/app/mitmachen/page.tsx`                                                    | volle Seite                                              |
| `apps/web/app/@modal/(.)mitmachen/page.tsx`                                          | Fenster                                                  |
| `apps/web/app/@modal/default.tsx`, `apps/web/app/@modal/[...catchAll]/page.tsx`      | leerer Slot                                              |
| `apps/web/app/layout.tsx`                                                            | rendert den Slot `modal`                                 |
| `apps/web/app/_public/PublicHeader.tsx`, `PublicHeaderView.tsx` (+ Test)             | Link-Ziel `joinHref`                                     |
| `apps/web/app/_public/landing/Hero.tsx`, `ConnectBlock.tsx`, `apps/web/app/page.tsx` | Link-Ziel `joinHref`                                     |
| `playwright.config.ts`                                                               | zweiter Server, Projekt `onboarding`                     |
| `e2e/helpers/db.ts`                                                                  | `journeyByEmail`                                         |
| `e2e/onboarding-konto.e2e.ts`                                                        | E2E                                                      |

---

### Task 1: `Dialog` bekommt die Option `sheet`

**Files:**

- Modify: `core/design-system/src/components/Dialog.tsx`
- Test: `core/design-system/src/components/Dialog.test.tsx`

**Interfaces:**

- Produces: `DialogProps.sheet?: boolean` — unterhalb von `sm` füllt der Dialog den Bildschirm (Spec §4: „Auf dem Handy wird es ein Sheet in voller Höhe").

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git switch -c feat/onboarding-fenster origin/main
```

- [ ] **Step 2: Failing test schreiben**

In `Dialog.test.tsx` innerhalb von `describe("Dialog", …)` anhängen:

```tsx
it("fills the phone screen when sheet is set", () => {
  render(
    <Dialog open onClose={() => {}} title="Mitglied werden" sheet>
      <p>Inhalt</p>
    </Dialog>,
  );
  const dialog = screen.getByRole("dialog", { hidden: true });
  expect(dialog.className).toContain("max-sm:h-dvh");
  expect(dialog.className).toContain("max-sm:max-w-none");
});

it("keeps the centred box without sheet", () => {
  render(
    <Dialog open onClose={() => {}} title="Frage">
      <p>Inhalt</p>
    </Dialog>,
  );
  expect(screen.getByRole("dialog", { hidden: true }).className).not.toContain("max-sm:h-dvh");
});
```

- [ ] **Step 3: Test laufen lassen, er muss fehlschlagen**

Run: `pnpm vitest run core/design-system/src/components/Dialog.test.tsx`
Expected: FAIL — Klasse `max-sm:h-dvh` fehlt.

- [ ] **Step 4: Implementieren**

In `Dialog.tsx`:

(a) in `DialogProps` nach `wide?: boolean;` einfügen:

```ts
  /** Below `sm` the dialog fills the screen instead of floating — for flows
   *  that need the whole phone (onboarding wizard). */
  sheet?: boolean;
```

(b) Signatur: `export function Dialog({ open, onClose, title, children, wide, sheet }: DialogProps) {`

(c) im `cx(...)` nach `"w-full max-h-[calc(100vh-4rem)] overflow-y-auto",` ergänzen:

```ts
        sheet && "max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none",
```

- [ ] **Step 5: Test laufen lassen, er muss bestehen**

Run: `pnpm vitest run core/design-system/src/components/Dialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/design-system/src/components/Dialog.tsx core/design-system/src/components/Dialog.test.tsx
git commit -m "feat(design-system): Dialog als Sheet auf dem Handy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Flag-Helfer und Gruppensuche

**Files:**

- Create: `apps/web/app/_onboarding/flag.ts`
- Create: `apps/web/app/_onboarding/place-search.ts`
- Test: `apps/web/app/_onboarding/flag.test.ts`
- Test: `apps/web/app/_onboarding/place-search.test.ts`
- Modify: `apps/web/package.json` (Abhängigkeit `@bdas/onboarding`)

**Interfaces:**

- Produces:
  - `onboardingEnabled(): boolean`, `requireOnboardingFlag(): void` (→ `notFound()`), `joinHref(): "/mitmachen" | "/registrieren"`
  - `MIN_QUERY = 2`
  - `cityMatches(groupCity: string, city: string): boolean`
  - `type PlaceHit = { readonly groupId: string; readonly label: string; readonly detail: string }`
  - `searchPlaces(query: string, groups: ReadonlyArray<FlowGroup>, universities: ReadonlyArray<readonly [string, string]>, limit?: number): PlaceHit[]`
  - `groupInCity(city: string, groups: ReadonlyArray<FlowGroup>): FlowGroup | null`

- [ ] **Step 1: Abhängigkeit eintragen**

In `apps/web/package.json` unter `dependencies` nach `"@bdas/notifications"` ergänzen:

```json
    "@bdas/onboarding": "workspace:*",
```

Run: `pnpm install`

- [ ] **Step 2: Failing tests schreiben**

`apps/web/app/_onboarding/flag.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import { joinHref, requireOnboardingFlag } from "./flag";

afterEach(() => {
  delete process.env["BDAS_FLAG_ONBOARDING"];
});

describe("onboarding flag", () => {
  it("keeps the old registration link while the flag is off", () => {
    expect(joinHref()).toBe("/registrieren");
    expect(() => requireOnboardingFlag()).toThrow("NOT_FOUND");
  });

  it("points at the wizard once the flag is on", () => {
    process.env["BDAS_FLAG_ONBOARDING"] = "true";
    expect(joinHref()).toBe("/mitmachen");
    expect(() => requireOnboardingFlag()).not.toThrow();
  });
});
```

`apps/web/app/_onboarding/place-search.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { cityMatches, groupInCity, searchPlaces } from "./place-search";

const GROUPS = [
  { id: "grp_ber", name: "BDAS Berlin", city: "Berlin" },
  { id: "grp_ffm", name: "BDAS Frankfurt", city: "Frankfurt" },
];
const UNIS = [
  ["TU Berlin", "Berlin"],
  ["Goethe-Universität", "Frankfurt am Main"],
  ["Universität Passau", "Passau"],
] as const;

describe("cityMatches", () => {
  it("matches the same city, case-insensitively, and longer official names", () => {
    expect(cityMatches("Berlin", "berlin")).toBe(true);
    expect(cityMatches("Frankfurt", "Frankfurt am Main")).toBe(true);
    expect(cityMatches("Frankfurt", "Frankfurter Umland")).toBe(false);
    expect(cityMatches("Berlin", "Passau")).toBe(false);
  });
});

describe("searchPlaces", () => {
  it("needs two characters", () => {
    expect(searchPlaces("b", GROUPS, UNIS)).toEqual([]);
  });

  it("finds groups by city and name", () => {
    expect(searchPlaces("berl", GROUPS, UNIS)[0]).toEqual({
      groupId: "grp_ber",
      label: "BDAS Berlin",
      detail: "Aktive Hochschulgruppe · Berlin",
    });
  });

  it("maps a university to the group of its city", () => {
    expect(searchPlaces("goethe", GROUPS, UNIS)).toEqual([
      { groupId: "grp_ffm", label: "Goethe-Universität", detail: "BDAS Frankfurt" },
    ]);
  });

  it("offers nothing for a university in a city without a group", () => {
    expect(searchPlaces("passau", GROUPS, UNIS)).toEqual([]);
  });

  it("caps the list", () => {
    expect(searchPlaces("bdas", GROUPS, UNIS, 1)).toHaveLength(1);
  });
});

describe("groupInCity", () => {
  it("returns the group of a typed city, or null", () => {
    expect(groupInCity(" berlin ", GROUPS)?.id).toBe("grp_ber");
    expect(groupInCity("Passau", GROUPS)).toBeNull();
  });
});
```

- [ ] **Step 3: Tests laufen lassen, sie müssen fehlschlagen**

Run: `pnpm vitest run apps/web/app/_onboarding/flag.test.ts apps/web/app/_onboarding/place-search.test.ts`
Expected: FAIL — Module fehlen.

- [ ] **Step 4: Implementieren**

`apps/web/app/_onboarding/flag.ts`:

```ts
import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

export function onboardingEnabled(): boolean {
  return isFlagOn("onboarding");
}

/** Route-Gate (CLAUDE.md §1 Regel 6). */
export function requireOnboardingFlag(): void {
  if (!onboardingEnabled()) notFound();
}

/** Wohin „Mitglied werden" führt. Ohne Flag bleibt alles wie heute. */
export function joinHref(): "/mitmachen" | "/registrieren" {
  return onboardingEnabled() ? "/mitmachen" : "/registrieren";
}
```

`apps/web/app/_onboarding/place-search.ts`:

```ts
import type { FlowGroup } from "@bdas/onboarding";

export const MIN_QUERY = 2;

const norm = (s: string): string => s.trim().toLocaleLowerCase("de");

/** Gleiche Stadt — oder ein längerer amtlicher Name derselben Stadt
 *  („Frankfurt am Main" zur Gruppe in „Frankfurt"). */
export function cityMatches(groupCity: string, city: string): boolean {
  const g = norm(groupCity);
  const c = norm(city);
  return c === g || c.startsWith(`${g} `);
}

export type PlaceHit = {
  readonly groupId: string;
  readonly label: string;
  readonly detail: string;
};

/** Treffer für „Wo studierst du?" (Spec §4.1). Hochschulen erscheinen nur,
 *  wenn es in ihrer Stadt eine aktive Gruppe gibt. */
export function searchPlaces(
  query: string,
  groups: ReadonlyArray<FlowGroup>,
  universities: ReadonlyArray<readonly [string, string]>,
  limit = 6,
): PlaceHit[] {
  const q = norm(query);
  if (q.length < MIN_QUERY) return [];

  const hits: PlaceHit[] = [];
  for (const g of groups) {
    if (norm(g.name).includes(q) || norm(g.city).includes(q)) {
      hits.push({ groupId: g.id, label: g.name, detail: `Aktive Hochschulgruppe · ${g.city}` });
    }
  }
  for (const [uni, city] of universities) {
    if (!norm(uni).includes(q)) continue;
    const g = groups.find((x) => cityMatches(x.city, city));
    if (g) hits.push({ groupId: g.id, label: uni, detail: g.name });
  }
  return hits.slice(0, limit);
}

export function groupInCity(city: string, groups: ReadonlyArray<FlowGroup>): FlowGroup | null {
  return groups.find((g) => cityMatches(g.city, city)) ?? null;
}
```

- [ ] **Step 5: Tests laufen lassen, sie müssen bestehen**

Run: `pnpm vitest run apps/web/app/_onboarding/flag.test.ts apps/web/app/_onboarding/place-search.test.ts`
Expected: PASS (2 + 8 Tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/app/_onboarding/flag.ts apps/web/app/_onboarding/flag.test.ts apps/web/app/_onboarding/place-search.ts apps/web/app/_onboarding/place-search.test.ts
git commit -m "feat(web): Onboarding-Flag und Gruppensuche

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Wizard-Zustand und `sessionStorage`

**Files:**

- Create: `apps/web/app/_onboarding/wizard-state.ts`
- Create: `apps/web/app/_onboarding/storage.ts`
- Test: `apps/web/app/_onboarding/wizard-state.test.ts`
- Test: `apps/web/app/_onboarding/storage.test.ts`

**Interfaces:**

- Consumes: `walk`, `sanitizeAnswers`, `FLOW` und Typen aus `@bdas/onboarding`.
- Produces:
  - `type Stage = "fragen" | "ergebnis" | "konto" | "gesendet"`
  - `type WizardState = { readonly stage: Stage; readonly answers: Answers; readonly cursor: string | null; readonly email: string }`
  - `type WizardAction = { type: "answer"; question: string; value: AnswerValue } | { type: "back" } | { type: "change_type" } | { type: "to_account" } | { type: "sent"; email: string }`
  - `INITIAL: WizardState`
  - `reduce(flow: Flow, env: FlowEnv, state: WizardState, action: WizardAction): WizardState`
  - `currentQuestion(flow, state, env): string | null`, `currentOutcome(flow, state, env): OutcomeId | null`, `canGoBack(flow, state, env): boolean`, `partOf(stage: Stage): 1 | 2`
  - `STORAGE_KEY = "bdas:onboarding:v1"`, `loadState(flow: Flow): WizardState | null`, `saveState(flow: Flow, state: WizardState): void`, `clearState(): void`

Verhalten („Zurück verliert nichts", Spec §4.4): Antworten bleiben beim Zurückgehen stehen. `cursor` zeigt die Frage, die gerade offen ist; nach einer Antwort springt er auf die nächste Frage **des aktuellen Weges** (auch wenn sie schon beantwortet ist, damit man sie prüfen kann) oder zum Ergebnis.

- [ ] **Step 1: Failing tests schreiben**

`apps/web/app/_onboarding/wizard-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { FLOW, type FlowEnv } from "@bdas/onboarding";

import {
  canGoBack,
  currentOutcome,
  currentQuestion,
  INITIAL,
  partOf,
  reduce,
  type WizardAction,
  type WizardState,
} from "./wizard-state";

const ENV: FlowEnv = {
  groups: [{ id: "grp_ber", name: "BDAS Berlin", city: "Berlin" }],
  bdajGroupId: null,
  netzwerkGroupId: "grp_netz",
};
const NAME = { firstName: "Lea", lastName: "Y" };

const run = (...actions: WizardAction[]): WizardState =>
  actions.reduce((s, a) => reduce(FLOW, ENV, s, a), INITIAL);

describe("wizard-state", () => {
  it("starts at the first question", () => {
    expect(currentQuestion(FLOW, INITIAL, ENV)).toBe("typ");
    expect(canGoBack(FLOW, INITIAL, ENV)).toBe(false);
  });

  it("walks a student to the result", () => {
    const s = run(
      { type: "answer", question: "typ", value: "studiere" },
      { type: "answer", question: "name", value: NAME },
      { type: "answer", question: "studienort", value: { kind: "group", groupId: "grp_ber" } },
    );
    expect(s.stage).toBe("ergebnis");
    expect(currentOutcome(FLOW, s, ENV)).toBe("student");
  });

  it("stays on a question when the answer is invalid", () => {
    const s = run({ type: "answer", question: "name", value: { firstName: "", lastName: "" } });
    expect(s.stage).toBe("fragen");
    expect(currentQuestion(FLOW, s, ENV)).toBe("typ");
  });

  it("goes back without losing answers", () => {
    const s = run(
      { type: "answer", question: "typ", value: "unterstuetzen" },
      { type: "answer", question: "name", value: NAME },
      { type: "back" },
    );
    expect(s.stage).toBe("fragen");
    expect(currentQuestion(FLOW, s, ENV)).toBe("name");
    expect(s.answers["name"]).toEqual(NAME);

    const first = reduce(FLOW, ENV, s, { type: "back" });
    expect(currentQuestion(FLOW, first, ENV)).toBe("typ");
    expect(first.answers["typ"]).toBe("unterstuetzen");
    expect(reduce(FLOW, ENV, first, { type: "back" })).toEqual(first);
  });

  it("shows an already answered next question instead of skipping it", () => {
    const s = run(
      { type: "answer", question: "typ", value: "unterstuetzen" },
      { type: "answer", question: "name", value: NAME },
      { type: "change_type" },
      { type: "answer", question: "typ", value: "studiere" },
    );
    expect(currentQuestion(FLOW, s, ENV)).toBe("name");
  });

  it("goes to the account form only from a result, and back again", () => {
    expect(run({ type: "to_account" }).stage).toBe("fragen");
    const s = run(
      { type: "answer", question: "typ", value: "unterstuetzen" },
      { type: "answer", question: "name", value: NAME },
      { type: "to_account" },
    );
    expect(s.stage).toBe("konto");
    expect(partOf(s.stage)).toBe(2);
    expect(reduce(FLOW, ENV, s, { type: "back" }).stage).toBe("ergebnis");
  });

  it("forgets the answers once the mail is sent", () => {
    const s = run(
      { type: "answer", question: "typ", value: "unterstuetzen" },
      { type: "sent", email: "lea@example.org" },
    );
    expect(s).toEqual({ stage: "gesendet", answers: {}, cursor: null, email: "lea@example.org" });
    expect(canGoBack(FLOW, s, ENV)).toBe(false);
  });
});
```

`apps/web/app/_onboarding/storage.test.ts`:

```ts
/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { FLOW } from "@bdas/onboarding";

import { clearState, loadState, saveState, STORAGE_KEY } from "./storage";
import { INITIAL } from "./wizard-state";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("storage", () => {
  it("round-trips the state", () => {
    const state = { ...INITIAL, answers: { typ: "studiere" }, cursor: "name" };
    saveState(FLOW, state);
    expect(loadState(FLOW)).toEqual(state);
  });

  it("drops answers the flow does not know and unknown stages", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ stage: "hack", answers: { typ: "x", weg: 1 }, cursor: 5, email: 3 }),
    );
    expect(loadState(FLOW)).toEqual(INITIAL);
  });

  it("never persists the sent screen", () => {
    saveState(FLOW, { ...INITIAL, stage: "gesendet", email: "a@b.de" });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("survives a broken or blocked storage", () => {
    sessionStorage.setItem(STORAGE_KEY, "{kaputt");
    expect(loadState(FLOW)).toBeNull();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveState(FLOW, INITIAL)).not.toThrow();
    clearState();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `pnpm vitest run apps/web/app/_onboarding/wizard-state.test.ts apps/web/app/_onboarding/storage.test.ts`
Expected: FAIL — Module fehlen.

- [ ] **Step 3: Implementieren**

`apps/web/app/_onboarding/wizard-state.ts`:

```ts
import {
  walk,
  type AnswerValue,
  type Answers,
  type Flow,
  type FlowEnv,
  type OutcomeId,
} from "@bdas/onboarding";

export type Stage = "fragen" | "ergebnis" | "konto" | "gesendet";

export type WizardState = {
  readonly stage: Stage;
  readonly answers: Answers;
  /** Die gezeigte Frage; null = die erste offene. */
  readonly cursor: string | null;
  readonly email: string;
};

export type WizardAction =
  | { readonly type: "answer"; readonly question: string; readonly value: AnswerValue }
  | { readonly type: "back" }
  | { readonly type: "change_type" }
  | { readonly type: "to_account" }
  | { readonly type: "sent"; readonly email: string };

export const INITIAL: WizardState = { stage: "fragen", answers: {}, cursor: null, email: "" };

export function currentQuestion(flow: Flow, state: WizardState, env: FlowEnv): string | null {
  if (state.stage !== "fragen") return null;
  if (state.cursor !== null) return state.cursor;
  const { step } = walk(flow, state.answers, env);
  return step.kind === "question" ? step.question : null;
}

export function currentOutcome(flow: Flow, state: WizardState, env: FlowEnv): OutcomeId | null {
  const { step } = walk(flow, state.answers, env);
  return step.kind === "outcome" ? step.outcome : null;
}

export function canGoBack(flow: Flow, state: WizardState, env: FlowEnv): boolean {
  if (state.stage === "ergebnis" || state.stage === "konto") return true;
  if (state.stage === "fragen") return currentQuestion(flow, state, env) !== flow.start;
  return false;
}

export function partOf(stage: Stage): 1 | 2 {
  return stage === "konto" || stage === "gesendet" ? 2 : 1;
}

export function reduce(
  flow: Flow,
  env: FlowEnv,
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "answer": {
      const answers = { ...state.answers, [action.question]: action.value };
      const { path, step } = walk(flow, answers, env);
      const i = path.indexOf(action.question);
      const next = i >= 0 ? path[i + 1] : undefined;
      if (next !== undefined) return { ...state, answers, stage: "fragen", cursor: next };
      if (step.kind === "outcome") return { ...state, answers, stage: "ergebnis", cursor: null };
      return { ...state, answers, stage: "fragen", cursor: null };
    }
    case "back": {
      if (state.stage === "konto") return { ...state, stage: "ergebnis" };
      const { path } = walk(flow, state.answers, env);
      if (state.stage === "ergebnis") {
        return { ...state, stage: "fragen", cursor: path[path.length - 1] ?? null };
      }
      if (state.stage !== "fragen") return state;
      const current = currentQuestion(flow, state, env);
      const i = current === null ? -1 : path.indexOf(current);
      return i > 0 ? { ...state, cursor: path[i - 1] ?? null } : state;
    }
    case "change_type":
      return { ...state, stage: "fragen", cursor: flow.start };
    case "to_account":
      return currentOutcome(flow, state, env) !== null ? { ...state, stage: "konto" } : state;
    case "sent":
      // Die Journey liegt jetzt auf dem Server; im Tab bleibt nur die Adresse.
      return { stage: "gesendet", answers: {}, cursor: null, email: action.email };
  }
}
```

`apps/web/app/_onboarding/storage.ts`:

```ts
import { sanitizeAnswers, type Flow } from "@bdas/onboarding";

import { INITIAL, type Stage, type WizardState } from "./wizard-state";

/** Nur dieser Tab (Spec §5.3 Punkt 1): nichts geht vor der Einwilligung an den Server. */
export const STORAGE_KEY = "bdas:onboarding:v1";

const STAGES: ReadonlyArray<Stage> = ["fragen", "ergebnis", "konto"];

export function loadState(flow: Flow): WizardState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    return {
      stage: STAGES.includes(v["stage"] as Stage) ? (v["stage"] as Stage) : INITIAL.stage,
      answers: sanitizeAnswers(flow, v["answers"]),
      cursor: typeof v["cursor"] === "string" && v["cursor"] in flow.questions ? v["cursor"] : null,
      email: typeof v["email"] === "string" ? v["email"] : "",
    };
  } catch {
    return null;
  }
}

export function saveState(flow: Flow, state: WizardState): void {
  try {
    if (state.stage === "gesendet") {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, flowVersion: flow.version }));
  } catch {
    // Privates Fenster oder gesperrter Speicher: der Wizard funktioniert trotzdem.
  }
}

export function clearState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Tests laufen lassen, sie müssen bestehen**

Run: `pnpm vitest run apps/web/app/_onboarding/wizard-state.test.ts apps/web/app/_onboarding/storage.test.ts`
Expected: PASS (7 + 4 Tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_onboarding/wizard-state.ts apps/web/app/_onboarding/wizard-state.test.ts apps/web/app/_onboarding/storage.ts apps/web/app/_onboarding/storage.test.ts
git commit -m "feat(web): Wizard-Zustand mit Zurück ohne Verlust

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Server-Aktion „Konto anlegen"

**Files:**

- Create: `apps/web/app/registrieren/finish.ts`
- Modify: `apps/web/app/registrieren/actions.ts`
- Create: `apps/web/app/_onboarding/actions.ts`
- Test: `apps/web/app/_onboarding/actions.test.ts`
- Test (unverändert, muss grün bleiben): `apps/web/app/registrieren/actions.test.ts`

**Interfaces:**

- Consumes: `register`, `buildVerifyUrl`, `getNotifier` (`@bdas/auth`); `createProfile` (`@bdas/members`); `FLOW`, `QUESTION_NAME`, `sanitizeAnswers`, `nextStep`, `loadFlowEnv`, `startJourney`, `MAX_JSON_BYTES` (`@bdas/onboarding`); `subscribeAtRegistration` (`@bdas/newsletter`).
- Produces:
  - `finishRegistration(input: { userId: string; email: string; verifyToken: string; newsletter: boolean; sourcePath: string; ip: string }): Promise<void>` — schickt die Bestätigungsmail und trägt bei angekreuztem Newsletter ein; wirft nie
  - `clientIp(): string` (aus `registrieren/actions.ts` nach `finish.ts` verschoben)
  - `type CreateAccountState = { readonly error?: string; readonly fields?: Record<string, string>; readonly sentTo?: string }`
  - `createAccountAction(prev: CreateAccountState, formData: FormData): Promise<CreateAccountState>` — Formularfelder: `email`, `password`, `consent`, `newsletter`, `answers` (JSON), `from`

Reihenfolge (Spec §5.3 Punkt 2): Antworten bereinigen und mit `loadFlowEnv` nachrechnen → `register` → `createProfile` → `startJourney` → Mail/Newsletter. Scheitert `createProfile` oder `startJourney`, wird geloggt und trotzdem `sentTo` zurückgegeben (das Konto existiert; PR 4 setzt den Weg beim ersten Login fort).

- [ ] **Step 1: Failing test schreiben**

`apps/web/app/_onboarding/actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: () => ({ get: () => undefined }) }));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("../../lib/auth-bootstrap", () => ({ bootAuth: () => {} }));
vi.mock("../../lib/newsletter-bootstrap", () => ({ bootNewsletter: () => {} }));

const registerMock = vi.fn();
const sendMock = vi.fn();
vi.mock("@bdas/auth", () => ({
  register: (...a: unknown[]) => registerMock(...a),
  buildVerifyUrl: () => "http://x/verify",
  getNotifier: () => ({ send: sendMock }),
}));
const createProfileMock = vi.fn();
vi.mock("@bdas/members", () => ({ createProfile: (...a: unknown[]) => createProfileMock(...a) }));
const subscribeMock = vi.fn();
vi.mock("@bdas/newsletter", () => ({
  subscribeAtRegistration: (...a: unknown[]) => subscribeMock(...a),
}));

const startJourneyMock = vi.fn();
const ENV = {
  groups: [{ id: "grp_ber", name: "BDAS Berlin", city: "Berlin" }],
  bdajGroupId: null,
  netzwerkGroupId: "grp_netz",
};
vi.mock("@bdas/onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bdas/onboarding")>()),
  loadFlowEnv: async () => ENV,
  startJourney: (...a: unknown[]) => startJourneyMock(...a),
}));

import { createAccountAction } from "./actions";

const NAME = { firstName: "Lea", lastName: "Yıldız" };

function form(answers: unknown, extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("email", "lea@example.org");
  fd.set("password", "correcthorse1");
  fd.set("consent", "true");
  fd.set("answers", typeof answers === "string" ? answers : JSON.stringify(answers));
  fd.set("from", "kampagne:sommer");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

describe("createAccountAction", () => {
  beforeEach(() => {
    process.env["BDAS_FLAG_AUTH"] = "true";
    process.env["BDAS_FLAG_ONBOARDING"] = "true";
    registerMock.mockReset().mockResolvedValue({ userId: "usr_1", verifyToken: "tok" });
    createProfileMock.mockReset().mockResolvedValue({});
    startJourneyMock.mockReset().mockResolvedValue({});
    sendMock.mockReset().mockResolvedValue(undefined);
    subscribeMock.mockReset().mockResolvedValue(undefined);
  });

  it("creates account, member row and journey, then reports the address", async () => {
    const answers = { typ: "unterstuetzen", name: NAME };
    const state = await createAccountAction({}, form(answers));

    expect(state).toEqual({ sentTo: "lea@example.org" });
    expect(registerMock).toHaveBeenCalledWith(
      expect.anything(),
      { email: "lea@example.org", password: "correcthorse1", consent: true },
      expect.anything(),
    );
    expect(createProfileMock).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      firstName: "Lea",
      lastName: "Yıldız",
    });
    expect(startJourneyMock).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      answers,
      entrySource: "kampagne:sommer",
      env: ENV,
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "verify", to: "lea@example.org" }),
    );
  });

  it("drops what the browser adds to the answers", async () => {
    await createAccountAction({}, form({ typ: "unterstuetzen", name: NAME, outcome: "bdaj" }));
    expect(startJourneyMock.mock.calls[0]?.[1]).toMatchObject({
      answers: { typ: "unterstuetzen", name: NAME },
    });
    expect(startJourneyMock.mock.calls[0]?.[1].answers).not.toHaveProperty("outcome");
  });

  it("refuses unfinished answers before touching auth", async () => {
    const state = await createAccountAction({}, form({ typ: "studiere", name: NAME }));
    expect(state.error).toMatch(/Fragen/);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("refuses broken or oversized answers", async () => {
    expect((await createAccountAction({}, form("{kaputt"))).error).toMatch(/neu/);
    expect((await createAccountAction({}, form("x".repeat(20_000)))).error).toMatch(/groß/);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("returns the field errors of register", async () => {
    const { ValidationError } = await import("@bdas/errors");
    registerMock.mockRejectedValueOnce(
      new ValidationError("Eingabe ungültig", { fields: { password: "Zu kurz." } }),
    );
    const state = await createAccountAction({}, form({ typ: "unterstuetzen", name: NAME }));
    expect(state).toEqual({ error: "Eingabe ungültig", fields: { password: "Zu kurz." } });
  });

  it("still reports success when the journey could not be stored", async () => {
    startJourneyMock.mockRejectedValueOnce(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await createAccountAction({}, form({ typ: "unterstuetzen", name: NAME }));
    expect(state.sentTo).toBe("lea@example.org");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("subscribes to the newsletter only when ticked and the flag is on", async () => {
    process.env["BDAS_FLAG_NEWSLETTER"] = "true";
    await createAccountAction(
      {},
      form({ typ: "unterstuetzen", name: NAME }, { newsletter: "true" }),
    );
    expect(subscribeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "usr_1",
        source: "registrierung",
        sourcePath: "/mitmachen",
      }),
    );
    delete process.env["BDAS_FLAG_NEWSLETTER"];
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `pnpm vitest run apps/web/app/_onboarding/actions.test.ts`
Expected: FAIL — `./actions` fehlt.

- [ ] **Step 3: Gemeinsamen Abschluss herauslösen**

`apps/web/app/registrieren/finish.ts`:

```ts
import { headers } from "next/headers";

import { buildVerifyUrl, getNotifier } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { subscribeAtRegistration } from "@bdas/newsletter";

import { bootNewsletter } from "../../lib/newsletter-bootstrap";
import { newsletterEnabled } from "../_newsletter/flag";

export function clientIp(): string {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "0.0.0.0";
}

/**
 * Alles nach `register`, was beide Registrierungswege teilen: Bestätigungsmail
 * und Newsletter. Wirft nie — das Konto existiert bereits, und eine gescheiterte
 * Mail hat mit „Erneut senden" einen eigenen Rettungsweg.
 */
export async function finishRegistration(input: {
  userId: string;
  email: string;
  verifyToken: string;
  newsletter: boolean;
  sourcePath: string;
  ip: string;
}): Promise<void> {
  const verifyUrl = buildVerifyUrl(
    process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
    input.verifyToken,
  );
  try {
    await getNotifier().send({ kind: "verify", to: input.email, verifyUrl });
  } catch (err) {
    console.error("[auth] verify email send failed:", err);
  }

  if (!newsletterEnabled() || !input.newsletter) return;
  try {
    bootNewsletter();
    await subscribeAtRegistration(getDb(), {
      userId: input.userId,
      email: input.email,
      source: "registrierung",
      sourcePath: input.sourcePath,
      context: { ip: input.ip },
    });
  } catch (err) {
    console.error("[newsletter] registration signup failed:", err);
  }
}
```

In `apps/web/app/registrieren/actions.ts`:

(a) Import `headers` entfernen, `buildVerifyUrl`/`getNotifier` aus dem `@bdas/auth`-Import entfernen, `subscribeAtRegistration` und `bootNewsletter` entfernen; ergänzen:

```ts
import { clientIp, finishRegistration } from "./finish";
```

(b) Den Block von `const verifyUrl = buildVerifyUrl(` bis vor `redirect("/registrieren/erfolg");` ersetzen durch:

```ts
const ticked = formData.get("newsletter") === "true";
await finishRegistration({
  userId: result.userId,
  email,
  verifyToken: result.verifyToken,
  newsletter: ticked,
  sourcePath: "/registrieren",
  ip,
});

// Unticked: keep the address for the one softer second attempt on the
// success page. Ticked means done — nobody gets asked twice (§6).
// Deliberately outside any try around the redirect below — Next implements
// redirect() as a throw, and an enclosing catch would swallow the navigation.
if (newsletterEnabled() && !ticked) {
  try {
    setSignupCookie({ userId: result.userId, email: email.trim().toLowerCase() });
  } catch (err) {
    console.error("[newsletter] signup cookie failed:", err);
  }
}
```

(c) Die lokale Funktion `clientIp` am Dateiende löschen.

Run: `pnpm vitest run apps/web/app/registrieren/actions.test.ts`
Expected: PASS — das Verhalten der alten Seite ist unverändert.

- [ ] **Step 4: Aktion schreiben**

`apps/web/app/_onboarding/actions.ts`:

```ts
"use server";

import { register } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError, ValidationError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { createProfile } from "@bdas/members";
import {
  FLOW,
  loadFlowEnv,
  MAX_JSON_BYTES,
  nextStep,
  QUESTION_NAME,
  sanitizeAnswers,
  startJourney,
} from "@bdas/onboarding";

import { bootAuth } from "../../lib/auth-bootstrap";
import { clientIp, finishRegistration } from "../registrieren/finish";

export type CreateAccountState = {
  readonly error?: string;
  readonly fields?: Record<string, string>;
  readonly sentTo?: string;
};

/**
 * Teil 2 des Wizards (Spec §4.2, §5.3 Punkt 2). Das Ergebnis rechnet der
 * Server selbst nach; was der Browser außer den Antworten mitschickt, fällt
 * in `sanitizeAnswers` heraus.
 */
export async function createAccountAction(
  _prev: CreateAccountState,
  formData: FormData,
): Promise<CreateAccountState> {
  requireFlag("auth");
  requireFlag("onboarding");
  bootAuth();
  const db = getDb();

  const rawAnswers = String(formData.get("answers") ?? "");
  if (Buffer.byteLength(rawAnswers, "utf8") > MAX_JSON_BYTES) {
    return { error: "Eingabe zu groß." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawAnswers);
  } catch {
    return { error: "Deine Antworten sind verloren gegangen. Bitte fang neu an." };
  }

  const answers = sanitizeAnswers(FLOW, parsed);
  const env = await loadFlowEnv(db);
  const name = answers[QUESTION_NAME];
  if (
    nextStep(FLOW, answers, env).kind !== "outcome" ||
    typeof name !== "object" ||
    !("firstName" in name)
  ) {
    return { error: "Bitte beantworte zuerst alle Fragen." };
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const consent = formData.get("consent") === "true";
  const ip = clientIp();

  let result;
  try {
    result = await register(
      db,
      { email, password, consent },
      { ip, publicSiteUrl: process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000" },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return err.fields ? { error: err.message, fields: err.fields } : { error: err.message };
    }
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  // Ab hier existiert das Konto. Nichts darf die Antwort mehr scheitern lassen:
  // eine fehlende Member-Zeile oder Journey holt der erste Login nach (PR 4).
  try {
    await createProfile(db, {
      userId: result.userId,
      firstName: name.firstName,
      lastName: name.lastName,
    });
  } catch (err) {
    console.error("[onboarding] createProfile after register failed:", err);
  }
  try {
    await startJourney(db, {
      userId: result.userId,
      answers,
      entrySource: formData.get("from"),
      env,
    });
  } catch (err) {
    console.error("[onboarding] startJourney after register failed:", err);
  }

  await finishRegistration({
    userId: result.userId,
    email,
    verifyToken: result.verifyToken,
    newsletter: formData.get("newsletter") === "true",
    sourcePath: "/mitmachen",
    ip,
  });

  return { sentTo: email.trim() };
}
```

- [ ] **Step 5: Tests laufen lassen, sie müssen bestehen**

Run: `pnpm vitest run apps/web/app/_onboarding/actions.test.ts apps/web/app/registrieren/actions.test.ts`
Expected: PASS (7 neue Tests, alte unverändert grün).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/registrieren/finish.ts apps/web/app/registrieren/actions.ts apps/web/app/_onboarding/actions.ts apps/web/app/_onboarding/actions.test.ts
git commit -m "feat(web): Server-Aktion legt Konto und Journey an

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Bausteine und Bildschirme

**Files:**

- Create: `apps/web/app/registrieren/ConsentFields.tsx`
- Modify: `apps/web/app/registrieren/RegistrierenForm.tsx`
- Create: `apps/web/app/_onboarding/types.ts`
- Create: `apps/web/app/_onboarding/ui/Icon.tsx`
- Create: `apps/web/app/_onboarding/ui/AnswerCard.tsx`
- Create: `apps/web/app/_onboarding/ui/Progress.tsx`
- Create: `apps/web/app/_onboarding/ui/ChoiceScreen.tsx`
- Create: `apps/web/app/_onboarding/ui/NameScreen.tsx`
- Create: `apps/web/app/_onboarding/ui/PlaceScreen.tsx`
- Create: `apps/web/app/_onboarding/ui/ErgebnisScreen.tsx`
- Create: `apps/web/app/_onboarding/ui/KontoScreen.tsx`
- Create: `apps/web/app/_onboarding/ui/MailGesendet.tsx`

**Interfaces:**

- Consumes: `fillText`, `visibleOptions`, `MAX_NAME`, `MAX_CITY`, Typen aus `@bdas/onboarding`; `searchPlaces`, `groupInCity`, `MIN_QUERY`; `createAccountAction`; `resendAction` aus `../verifizierung-erneut-senden/actions`.
- Produces:
  - `ConsentFields({ privacyUrl, newsletterOn, consentError }: { privacyUrl: string; newsletterOn: boolean; consentError?: string | undefined })`
  - `type WizardProps = { readonly env: FlowEnv; readonly entry: EntryContext; readonly universities: ReadonlyArray<readonly [string, string]>; readonly privacyUrl: string; readonly passwordHint: string; readonly newsletterOn: boolean }`
  - Bildschirme mit den unten stehenden Props; jeder rendert genau ein `<h2 tabIndex={-1}>`, damit der Container den Fokus setzen kann

Diese Task hat keine eigenen Unit-Tests; die Bildschirme werden in Task 6 über den Container und in Task 9 per E2E geprüft. Nach jedem Schritt muss der Typcheck grün sein.

- [ ] **Step 1: Einwilligung herauslösen**

`apps/web/app/registrieren/ConsentFields.tsx` — das JSX der beiden Blöcke (Einwilligung, Newsletter) wortgleich aus `RegistrierenForm.tsx` übernehmen:

```tsx
/** Einwilligung und Newsletter-Kästchen — geteilt von `/registrieren` und dem Wizard. */
export function ConsentFields({
  privacyUrl,
  newsletterOn,
  consentError,
}: {
  privacyUrl: string;
  newsletterOn: boolean;
  consentError?: string | undefined;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="consent" className="flex items-start gap-2 text-sm text-bdas-ink-body">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            value="true"
            required
            aria-describedby={consentError ? "consent-error" : undefined}
            className="mt-0.5 accent-bdas-red"
          />
          <span>
            Ich habe die{" "}
            <a
              href={privacyUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-bdas-red hover:underline"
            >
              Datenschutzerklärung
            </a>{" "}
            gelesen und stimme der Verarbeitung meiner Daten zu.
          </span>
        </label>
        {consentError ? (
          <p id="consent-error" role="alert" className="text-sm text-bdas-red">
            {consentError}
          </p>
        ) : null}
      </div>
      {newsletterOn ? (
        <div className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-4">
          <label htmlFor="newsletter" className="flex items-start gap-2 text-sm text-bdas-ink-body">
            {/* Never pre-checked, never coupled to the registration (spec §6). */}
            <input
              id="newsletter"
              name="newsletter"
              type="checkbox"
              value="true"
              className="mt-1 accent-bdas-red"
            />
            <span>
              <span className="font-medium text-bdas-ink">Schreibt mir auch den Newsletter.</span>{" "}
              Ein paar Mal im Jahr, was im Verband ansteht.
            </span>
          </label>
          <p className="mt-2 text-xs text-bdas-ink-muted">
            Abbestellen kannst du jederzeit unter „Mein Konto“. Wie wir mit deinen Daten umgehen,
            steht im{" "}
            <a href={privacyUrl} target="_blank" rel="noreferrer noopener" className="underline">
              Datenschutzhinweis
            </a>
            .
          </p>
        </div>
      ) : null}
    </>
  );
}
```

In `RegistrierenForm.tsx` beide Blöcke (vom `<div className="flex flex-col gap-1">` der Einwilligung bis zum Ende des `newsletterOn ? … : null`-Ausdrucks) ersetzen durch

```tsx
<ConsentFields privacyUrl={privacyUrl} newsletterOn={newsletterOn} consentError={consentError} />
```

und `import { ConsentFields } from "./ConsentFields";` ergänzen.

Run: `pnpm --filter @bdas/web typecheck`
Expected: ohne Fehler.

- [ ] **Step 2: Typen, Icon, Karte, Fortschritt**

`apps/web/app/_onboarding/types.ts`:

```ts
import type { EntryContext, FlowEnv } from "@bdas/onboarding";

/** Alles, was der Wizard vom Server bekommt. Serialisierbar (Server → Client). */
export type WizardProps = {
  readonly env: FlowEnv;
  readonly entry: EntryContext;
  /** [Hochschule, Ort] — nur Hochschulen in Städten mit aktiver Gruppe. */
  readonly universities: ReadonlyArray<readonly [string, string]>;
  readonly privacyUrl: string;
  readonly passwordHint: string;
  readonly newsletterOn: boolean;
};
```

`apps/web/app/_onboarding/ui/Icon.tsx`:

```tsx
import type { ChoiceOption } from "@bdas/onboarding";

const PATHS: Record<ChoiceOption["icon"], string> = {
  studium: "M22 10 12 5 2 10l10 5 10-5z M6 12v5c3 2 9 2 12 0v-5",
  abschluss: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M8.5 14 7 22l5-3 5 3-1.5-8",
  bdaj:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z " +
    "M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  herz:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 " +
    "1-1.1a5.5 5.5 0 0 0 0-7.8z",
};

export function Icon({ name }: { name: ChoiceOption["icon"] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
```

`apps/web/app/_onboarding/ui/AnswerCard.tsx`:

```tsx
import { cx } from "@bdas/design-system";
import type { ChoiceOption } from "@bdas/onboarding";

import { Icon } from "./Icon";

const CARD =
  "flex w-full flex-col items-start gap-2 rounded-bdas border bg-bdas-surface p-4 text-left " +
  "shadow-bdas-card transition duration-bdas-soft ease-bdas " +
  "hover:shadow-bdas-lift-md motion-safe:hover:-translate-y-bdas-lift-sm " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-red/40";

/** Eine antippbare Antwort (Spec §2 Punkt 7). Markenrot nur im gewählten Zustand. */
export function AnswerCard({
  option,
  selected,
  onSelect,
}: {
  option: ChoiceOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(CARD, selected ? "border-bdas-red" : "border-bdas-soft")}
    >
      <span className={selected ? "text-bdas-red" : "text-bdas-ink-muted"}>
        <Icon name={option.icon} />
      </span>
      <span className="font-semibold text-bdas-ink">{option.label}</span>
      <span className="text-sm text-bdas-ink-body">{option.hint}</span>
    </button>
  );
}
```

`apps/web/app/_onboarding/ui/Progress.tsx`:

```tsx
import { cx } from "@bdas/design-system";

const PARTS = ["Über dich", "Konto", "Angaben"] as const;

/** Füllt pro Teil, nicht pro Frage (Spec §4.4). */
export function Progress({ part }: { part: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Fortschritt" className="mb-6 grid grid-cols-3 gap-2">
      {PARTS.map((label, i) => {
        const n = i + 1;
        const current = n === part;
        return (
          <li
            key={label}
            aria-current={current ? "step" : undefined}
            className="flex flex-col gap-1"
          >
            <span
              className={cx(
                "h-1 rounded-bdas-full transition-colors duration-bdas-slow ease-bdas",
                n <= part ? "bg-bdas-ink" : "bg-bdas-overlay-soft",
              )}
            />
            <span
              className={cx(
                "text-xs",
                current ? "font-semibold text-bdas-ink" : "text-bdas-ink-muted",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 3: Fragen-Bildschirme**

`apps/web/app/_onboarding/ui/ChoiceScreen.tsx`:

```tsx
import {
  fillText,
  visibleOptions,
  type AnswerValue,
  type FlowEnv,
  type Question,
  type TextContext,
} from "@bdas/onboarding";

import { AnswerCard } from "./AnswerCard";

export function ChoiceScreen({
  question,
  env,
  ctx,
  value,
  greeting,
  onAnswer,
}: {
  question: Extract<Question, { kind: "choice" }>;
  env: FlowEnv;
  ctx: TextContext;
  value: AnswerValue | undefined;
  greeting?: string | undefined;
  onAnswer: (value: string) => void;
}) {
  return (
    <section>
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        {greeting ? `${greeting} ` : ""}
        {fillText(question.title, ctx)}
      </h2>
      <p className="mt-1 text-sm text-bdas-ink-body">{fillText(question.help, ctx)}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {visibleOptions(question, env).map((o) => (
          <AnswerCard
            key={o.value}
            option={o}
            selected={value === o.value}
            onSelect={() => onAnswer(o.value)}
          />
        ))}
      </div>
    </section>
  );
}
```

`apps/web/app/_onboarding/ui/NameScreen.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";

import { Button, Field, Input } from "@bdas/design-system";
import {
  fillText,
  MAX_NAME,
  type AnswerValue,
  type NameAnswer,
  type Question,
  type TextContext,
} from "@bdas/onboarding";

export function NameScreen({
  question,
  ctx,
  value,
  onAnswer,
}: {
  question: Extract<Question, { kind: "name" }>;
  ctx: TextContext;
  value: AnswerValue | undefined;
  onAnswer: (value: NameAnswer) => void;
}) {
  const initial = typeof value === "object" && "firstName" in value ? value : null;
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("Bitte gib Vor- und Nachnamen an.");
      return;
    }
    onAnswer({ firstName: firstName.trim(), lastName: lastName.trim() });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        {fillText(question.title, ctx)}
      </h2>
      <p className="-mt-3 text-sm text-bdas-ink-body">{fillText(question.help, ctx)}</p>
      <Field label="Vorname" htmlFor="onb-vorname" {...(error ? { error } : {})}>
        <Input
          id="onb-vorname"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
          maxLength={MAX_NAME}
          invalid={Boolean(error) && !firstName.trim()}
        />
      </Field>
      <Field label="Nachname" htmlFor="onb-nachname">
        <Input
          id="onb-nachname"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          autoComplete="family-name"
          maxLength={MAX_NAME}
          invalid={Boolean(error) && !lastName.trim()}
        />
      </Field>
      <div>
        <Button type="submit">Weiter</Button>
      </div>
    </form>
  );
}
```

`apps/web/app/_onboarding/ui/PlaceScreen.tsx`:

```tsx
"use client";

import { useState } from "react";

import { Button, Field, Input } from "@bdas/design-system";
import {
  fillText,
  MAX_CITY,
  type AnswerValue,
  type FlowEnv,
  type PlaceAnswer,
  type Question,
  type TextContext,
} from "@bdas/onboarding";

import { groupInCity, MIN_QUERY, searchPlaces } from "../place-search";

const HIT =
  "flex w-full flex-col rounded-bdas border border-bdas-soft bg-bdas-surface px-4 py-3 text-left " +
  "transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-red/40";

function initialQuery(value: AnswerValue | undefined, env: FlowEnv): string {
  if (typeof value !== "object" || !("kind" in value)) return "";
  if (value.kind === "city") return value.city;
  if (value.kind === "group") return env.groups.find((g) => g.id === value.groupId)?.city ?? "";
  return "";
}

export function PlaceScreen({
  question,
  ctx,
  env,
  universities,
  value,
  onAnswer,
}: {
  question: Extract<Question, { kind: "place" }>;
  ctx: TextContext;
  env: FlowEnv;
  universities: ReadonlyArray<readonly [string, string]>;
  value: AnswerValue | undefined;
  onAnswer: (value: PlaceAnswer) => void;
}) {
  const [query, setQuery] = useState(() => initialQuery(value, env));
  const typed = query.trim();
  const tooShort = typed.length < MIN_QUERY;
  const hits = searchPlaces(typed, env.groups, universities);

  function goOn() {
    // Eine getippte Stadt mit Gruppe ist eine Gruppe — sonst landete man ohne Not im Netzwerk.
    const group = groupInCity(typed, env.groups);
    onAnswer(group ? { kind: "group", groupId: group.id } : { kind: "city", city: typed });
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        {fillText(question.title, ctx)}
      </h2>
      <Field label="Stadt oder Hochschule" htmlFor="onb-ort" hint={fillText(question.help, ctx)}>
        <Input
          id="onb-ort"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          maxLength={MAX_CITY}
          placeholder="z. B. Passau"
        />
      </Field>

      {hits.length > 0 ? (
        <ul aria-label="Treffer" className="flex flex-col gap-2">
          {hits.map((h) => (
            <li key={`${h.label}-${h.groupId}`}>
              <button
                type="button"
                className={HIT}
                onClick={() => onAnswer({ kind: "group", groupId: h.groupId })}
              >
                <span className="font-medium text-bdas-ink">✓ {h.label}</span>
                <span className="text-sm text-bdas-ink-muted">{h.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : !tooShort ? (
        <p
          aria-live="polite"
          className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-3 text-sm text-bdas-ink-body"
        >
          {fillText(question.noGroupHint, ctx, typed)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={tooShort} onClick={goOn}>
          Weiter
        </Button>
        {question.skippable ? (
          <Button type="button" variant="ghost" onClick={() => onAnswer({ kind: "skipped" })}>
            Überspringen
          </Button>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Ergebnis, Konto, Mail**

`apps/web/app/_onboarding/ui/ErgebnisScreen.tsx`:

```tsx
import { Button } from "@bdas/design-system";
import { fillText, type Outcome, type TextContext } from "@bdas/onboarding";

/** Ehrliches Ergebnis (Spec §2 Punkt 6): was man bekommt, wer entscheidet, wie lange. */
export function ErgebnisScreen({
  outcome,
  ctx,
  onConfirm,
  onChange,
}: {
  outcome: Outcome;
  ctx: TextContext;
  onConfirm: () => void;
  onChange: () => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-bdas-ink-muted">
        Dein Ergebnis
      </p>
      <h2 tabIndex={-1} className="-mt-3 text-xl font-semibold text-bdas-ink outline-none">
        {fillText(outcome.title, ctx)}
      </h2>
      <ul className="flex flex-col gap-2">
        {outcome.benefits.map((b) => (
          <li key={b} className="flex gap-2 text-bdas-ink-body">
            <span aria-hidden>✓</span>
            <span>{fillText(b, ctx)}</span>
          </li>
        ))}
      </ul>
      {outcome.hint ? <p className="text-bdas-ink-body">{fillText(outcome.hint, ctx)}</p> : null}
      <div className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-4">
        <p className="font-semibold text-bdas-ink">Wer entscheidet?</p>
        <p className="text-bdas-ink-body">
          {fillText(outcome.decider, ctx)} — {outcome.duration}.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onConfirm}>
          Passt — Konto anlegen
        </Button>
        <Button type="button" variant="secondary" onClick={onChange}>
          Doch etwas anderes
        </Button>
      </div>
    </section>
  );
}
```

`apps/web/app/_onboarding/ui/KontoScreen.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input, PasswordInput } from "@bdas/design-system";
import type { Answers, EntryContext } from "@bdas/onboarding";

import { ConsentFields } from "../../registrieren/ConsentFields";
import { createAccountAction, type CreateAccountState } from "../actions";

const initial: CreateAccountState = {};

export function KontoScreen({
  answers,
  entry,
  privacyUrl,
  passwordHint,
  newsletterOn,
  onSent,
}: {
  answers: Answers;
  entry: EntryContext;
  privacyUrl: string;
  passwordHint: string;
  newsletterOn: boolean;
  onSent: (email: string) => void;
}) {
  const [state, action] = useFormState(createAccountAction, initial);
  const sentTo = state.sentTo;
  useEffect(() => {
    if (sentTo) onSent(sentTo);
  }, [sentTo, onSent]);

  const err = (key: string) => (state.fields?.[key] ? { error: state.fields[key] } : {});

  return (
    <Form action={action}>
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        Fast geschafft — dein Konto
      </h2>
      <p className="-mt-2 text-sm text-bdas-ink-body">
        Mit E-Mail und Passwort meldest du dich später an.
      </p>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      <input type="hidden" name="from" value={entry.source} />
      <Field
        label="E-Mail"
        htmlFor="email"
        hint="Dorthin schicken wir den Bestätigungslink."
        {...err("email")}
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={entry.email ?? ""}
          required
        />
      </Field>
      <Field label="Passwort" htmlFor="password" hint={passwordHint} {...err("password")}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>
      <ConsentFields
        privacyUrl={privacyUrl}
        newsletterOn={newsletterOn}
        consentError={state.fields?.["consent"]}
      />
      <SubmitButton />
    </Form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird erstellt…" : "Konto erstellen"}
    </Button>
  );
}
```

`apps/web/app/_onboarding/ui/MailGesendet.tsx`:

```tsx
"use client";

import { useFormState } from "react-dom";

import { Button } from "@bdas/design-system";

import { resendAction, type ResendFormState } from "../../verifizierung-erneut-senden/actions";

const initial: ResendFormState = {};

export function MailGesendet({ email, onClose }: { email: string; onClose: () => void }) {
  const [state, action] = useFormState(resendAction, initial);
  return (
    <section className="flex flex-col gap-4">
      <h2 tabIndex={-1} className="text-xl font-semibold text-bdas-ink outline-none">
        Wir haben dir eine Mail geschickt
      </h2>
      <p className="text-bdas-ink-body">
        Klick auf den Link in der Mail an <strong className="text-bdas-ink">{email}</strong>. Danach
        geht es mit ein paar Angaben weiter — auf jedem Gerät. Dieses Fenster kannst du jetzt
        schließen.
      </p>
      <form action={action}>
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="secondary">
          Erneut senden
        </Button>
      </form>
      {state.sent ? (
        <p aria-live="polite" className="text-sm text-bdas-ink-body">
          Falls die Adresse bei uns registriert ist, ist ein neuer Link unterwegs.
        </p>
      ) : null}
      <div>
        <Button type="button" variant="ghost" onClick={onClose}>
          Schließen
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Typcheck**

Run: `pnpm --filter @bdas/web typecheck`
Expected: ohne Fehler.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/registrieren/ConsentFields.tsx apps/web/app/registrieren/RegistrierenForm.tsx apps/web/app/_onboarding/types.ts apps/web/app/_onboarding/ui
git commit -m "feat(web): Bildschirme für Fragen, Ergebnis und Konto

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Der Container `OnboardingWizard`

**Files:**

- Create: `apps/web/app/_onboarding/OnboardingWizard.tsx`
- Test: `apps/web/app/_onboarding/OnboardingWizard.interaction.test.tsx`

**Interfaces:**

- Consumes: alles aus Task 3 und 5; `FLOW`, `textContext` aus `@bdas/onboarding`.
- Produces: `OnboardingWizard(props: WizardProps & { onClose: () => void })`

- [ ] **Step 1: Failing test schreiben**

`apps/web/app/_onboarding/OnboardingWizard.interaction.test.tsx`:

```tsx
/**
 * @vitest-environment happy-dom
 *
 * Der Container verbindet Reducer, Speicher und Bildschirme. Die Server-Aktionen
 * sind hier Attrappen: ihr Verhalten prüfen actions.test.ts und das E2E.
 */
// vitest compiles JSX with the classic runtime, so React has to be in scope.
import React, { act } from "react";
import type * as ReactDOM from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactDOM>();
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
    useFormState: (_fn: unknown, init: unknown) => [init, () => {}],
  };
});
vi.mock("./actions", () => ({ createAccountAction: vi.fn() }));
vi.mock("../verifizierung-erneut-senden/actions", () => ({ resendAction: vi.fn() }));

import { OnboardingWizard } from "./OnboardingWizard";
import { STORAGE_KEY } from "./storage";
import type { WizardProps } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROPS: WizardProps = {
  env: {
    groups: [{ id: "grp_ber", name: "BDAS Berlin", city: "Berlin" }],
    bdajGroupId: "grp_bdaj",
    netzwerkGroupId: "grp_netz",
  },
  entry: { source: "direkt", greeting: "Schön, dass du da bist!" },
  universities: [["TU Berlin", "Berlin"]],
  privacyUrl: "/datenschutz",
  passwordHint: "Mindestens 10 Zeichen.",
  newsletterOn: false,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: Partial<WizardProps> = {}) {
  act(() => root.render(<OnboardingWizard {...PROPS} {...props} onClose={() => {}} />));
}
const heading = () => container.querySelector("h2")?.textContent ?? "";
function click(text: string) {
  const el = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!el) throw new Error(`no button "${text}"`);
  act(() => el.click());
}
function type(id: string, value: string) {
  const el = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) throw new Error(`no input #${id}`);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function submit() {
  act(() => container.querySelector("form")?.requestSubmit());
}

describe("OnboardingWizard", () => {
  it("greets and offers four cards, three without the bdaj group", () => {
    render();
    expect(heading()).toBe("Schön, dass du da bist! Was beschreibt dich am besten?");
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(4);

    render({ env: { ...PROPS.env, bdajGroupId: null } });
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(3);
  });

  it("walks a supporter to the result, speaks by first name, and goes back without losing the name", () => {
    render();
    click("Ich möchte unterstützen");
    expect(heading()).toBe("Wie dürfen wir dich nennen?");

    type("onb-vorname", "Lea");
    type("onb-nachname", "Yıldız");
    submit();
    expect(heading()).toBe("Du passt zu uns als Förderer*in.");
    expect(container.textContent).toContain("Der Bundesvorstand");

    click("Zurück");
    expect(heading()).toBe("Wie dürfen wir dich nennen?");
    expect(container.querySelector<HTMLInputElement>("#onb-vorname")?.value).toBe("Lea");
  });

  it("finds a group by university and names it on the result", () => {
    render();
    click("Ich studiere gerade");
    type("onb-vorname", "Lea");
    type("onb-nachname", "Y");
    submit();
    expect(heading()).toBe("Wo studierst du, Lea?");

    type("onb-ort", "TU Ber");
    click("TU Berlin");
    expect(heading()).toBe("Du passt zu uns als Student*in in Berlin.");
    expect(container.textContent).toContain("Der Vorstand von BDAS Berlin");
  });

  it("marks the chosen card and keeps it after a reload", () => {
    render();
    click("Ich habe studiert");
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}").answers).toEqual({
      typ: "studiert",
    });

    act(() => root.unmount());
    root = createRoot(container);
    render();
    expect(heading()).toBe("Wie dürfen wir dich nennen?");
  });

  it("opens the account form from the result", () => {
    render();
    click("Ich möchte unterstützen");
    type("onb-vorname", "Lea");
    type("onb-nachname", "Y");
    submit();
    click("Passt — Konto anlegen");
    expect(heading()).toBe("Fast geschafft — dein Konto");
    expect(container.querySelector<HTMLInputElement>('input[name="answers"]')?.value).toContain(
      '"typ":"unterstuetzen"',
    );
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `pnpm vitest run apps/web/app/_onboarding/OnboardingWizard.interaction.test.tsx`
Expected: FAIL — `./OnboardingWizard` fehlt.

- [ ] **Step 3: Implementieren**

`apps/web/app/_onboarding/OnboardingWizard.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@bdas/design-system";
import { FLOW, textContext, type AnswerValue } from "@bdas/onboarding";

import { clearState, loadState, saveState } from "./storage";
import type { WizardProps } from "./types";
import { ChoiceScreen } from "./ui/ChoiceScreen";
import { ErgebnisScreen } from "./ui/ErgebnisScreen";
import { KontoScreen } from "./ui/KontoScreen";
import { MailGesendet } from "./ui/MailGesendet";
import { NameScreen } from "./ui/NameScreen";
import { PlaceScreen } from "./ui/PlaceScreen";
import { Progress } from "./ui/Progress";
import {
  canGoBack,
  currentOutcome,
  currentQuestion,
  INITIAL,
  partOf,
  reduce,
  type WizardAction,
  type WizardState,
} from "./wizard-state";

/**
 * Teil 1 und 2 des Einstiegs (Spec §4.1, §4.2). Rendert im Fenster und auf der
 * vollen Seite gleich. Der Zustand lebt in diesem Tab; der Server sieht erst
 * beim Konto-Formular etwas.
 */
export function OnboardingWizard(props: WizardProps & { onClose: () => void }) {
  const { env, entry, universities, onClose } = props;
  const [state, setState] = useState<WizardState>(INITIAL);
  const [restored, setRestored] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadState(FLOW);
    if (saved) setState(saved);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) saveState(FLOW, state);
  }, [restored, state]);

  const dispatch = useCallback(
    (action: WizardAction) => setState((s) => reduce(FLOW, env, s, action)),
    [env],
  );
  const onSent = useCallback((email: string) => dispatch({ type: "sent", email }), [dispatch]);

  const questionId = currentQuestion(FLOW, state, env);
  const outcomeId = currentOutcome(FLOW, state, env);

  // Ein Thema pro Bildschirm: der Fokus springt auf die neue Überschrift, damit
  // Screenreader den Wechsel ansagen (Spec §4.4).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    frame.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [state.stage, questionId]);

  const ctx = textContext(FLOW, state.answers, env);
  const answer = (question: string) => (value: AnswerValue) =>
    dispatch({ type: "answer", question, value });

  let screen: ReactNode = null;
  if (state.stage === "fragen" && questionId) {
    const q = FLOW.questions[questionId];
    const value = state.answers[questionId];
    if (q?.kind === "choice") {
      screen = (
        <ChoiceScreen
          key={questionId}
          question={q}
          env={env}
          ctx={ctx}
          value={value}
          greeting={questionId === FLOW.start ? entry.greeting : undefined}
          onAnswer={answer(questionId)}
        />
      );
    } else if (q?.kind === "name") {
      screen = (
        <NameScreen
          key={questionId}
          question={q}
          ctx={ctx}
          value={value}
          onAnswer={answer(questionId)}
        />
      );
    } else if (q?.kind === "place") {
      screen = (
        <PlaceScreen
          key={questionId}
          question={q}
          ctx={ctx}
          env={env}
          universities={universities}
          value={value}
          onAnswer={answer(questionId)}
        />
      );
    }
  } else if (state.stage === "ergebnis" && outcomeId) {
    screen = (
      <ErgebnisScreen
        outcome={FLOW.outcomes[outcomeId]}
        ctx={ctx}
        onConfirm={() => dispatch({ type: "to_account" })}
        onChange={() => dispatch({ type: "change_type" })}
      />
    );
  } else if (state.stage === "konto") {
    screen = (
      <KontoScreen
        answers={state.answers}
        entry={entry}
        privacyUrl={props.privacyUrl}
        passwordHint={props.passwordHint}
        newsletterOn={props.newsletterOn}
        onSent={onSent}
      />
    );
  } else if (state.stage === "gesendet") {
    screen = (
      <MailGesendet
        email={state.email}
        onClose={() => {
          clearState();
          onClose();
        }}
      />
    );
  }

  return (
    <div ref={frame}>
      <Progress part={partOf(state.stage)} />
      {canGoBack(FLOW, state, env) ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-3 mb-2"
          onClick={() => dispatch({ type: "back" })}
        >
          ← Zurück
        </Button>
      ) : null}
      {screen}
      {state.stage === "fragen" && questionId === FLOW.start ? (
        <p className="mt-6 text-center text-sm text-bdas-ink-body">
          Du hast schon ein Konto?{" "}
          <Link href="/anmelden" className="text-bdas-red hover:underline">
            Anmelden
          </Link>
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Test laufen lassen, er muss bestehen**

Run: `pnpm vitest run apps/web/app/_onboarding/OnboardingWizard.interaction.test.tsx`
Expected: PASS (5 Tests).

Scheitert `type()` daran, dass React die Eingabe nicht übernimmt: Das Muster aus `apps/web/app/account/ProfileForm.interaction.test.tsx` nachschlagen und dessen Helfer übernehmen. Scheitert `next/link` außerhalb von Next: `vi.mock("next/link", () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))` ergänzen.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_onboarding/OnboardingWizard.tsx apps/web/app/_onboarding/OnboardingWizard.interaction.test.tsx
git commit -m "feat(web): OnboardingWizard verbindet Zustand und Bildschirme

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Routen — Fenster und volle Seite

**Files:**

- Create: `apps/web/app/_onboarding/load.ts`
- Create: `apps/web/app/_onboarding/WizardModal.tsx`
- Create: `apps/web/app/_onboarding/WizardPage.tsx`
- Create: `apps/web/app/mitmachen/page.tsx`
- Create: `apps/web/app/@modal/(.)mitmachen/page.tsx`
- Create: `apps/web/app/@modal/default.tsx`
- Create: `apps/web/app/@modal/[...catchAll]/page.tsx`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**

- Produces: `loadWizardProps(from: string | string[] | undefined): Promise<WizardProps>` (PR 6 erweitert sie um Begrüßung und E-Mail).

- [ ] **Step 1: Server-Lader**

`apps/web/app/_onboarding/load.ts`:

```ts
import { PASSWORD_RULE_HINT } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { loadFlowEnv, parseEntryContext } from "@bdas/onboarding";
import { UNIVERSITIES, universityCity } from "@bdas/profile";

import { legalUrls } from "../../lib/legal";
import { newsletterEnabled } from "../_newsletter/flag";
import { cityMatches } from "./place-search";
import type { WizardProps } from "./types";

export async function loadWizardProps(from: string | string[] | undefined): Promise<WizardProps> {
  const env = await loadFlowEnv(getDb());
  const universities = UNIVERSITIES.flatMap((u): Array<readonly [string, string]> => {
    const city = universityCity(u);
    return city && env.groups.some((g) => cityMatches(g.city, city)) ? [[u, city]] : [];
  });
  return {
    env,
    entry: parseEntryContext(typeof from === "string" ? from : undefined),
    universities,
    privacyUrl: legalUrls().privacy,
    passwordHint: PASSWORD_RULE_HINT,
    newsletterOn: newsletterEnabled(),
  };
}
```

- [ ] **Step 2: Hüllen**

`apps/web/app/_onboarding/WizardModal.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";

import { Dialog } from "@bdas/design-system";

import { OnboardingWizard } from "./OnboardingWizard";
import type { WizardProps } from "./types";

/** Das Fenster über der aktuellen Seite (Spec §5.5). Schließen = zurück zur Seite darunter. */
export function WizardModal(props: WizardProps) {
  const router = useRouter();
  const close = () => router.back();
  return (
    <Dialog open onClose={close} title="Mitglied werden" wide sheet>
      <OnboardingWizard {...props} onClose={close} />
    </Dialog>
  );
}
```

`apps/web/app/_onboarding/WizardPage.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";

import { Card } from "@bdas/design-system";

import { OnboardingWizard } from "./OnboardingWizard";
import type { WizardProps } from "./types";

/** Dieselbe Komponente als Seite — für geteilte Links, QR-Codes und Neuladen. */
export function WizardPage(props: WizardProps) {
  const router = useRouter();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-bdas-ink">Mitglied werden</h1>
      <Card flat className="p-6">
        <OnboardingWizard {...props} onClose={() => router.push("/")} />
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Seiten**

`apps/web/app/mitmachen/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { requireAuthFlag } from "../_auth/flag";
import { loadViewer } from "../_dashboard/session";
import { requireOnboardingFlag } from "../_onboarding/flag";
import { loadWizardProps } from "../_onboarding/load";
import { WizardPage } from "../_onboarding/WizardPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mitglied werden" };

export default async function MitmachenPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  requireAuthFlag();
  requireOnboardingFlag();
  // Eingeloggt gibt es nichts zu registrieren. PR 4 ersetzt das durch den Stand der Bewerbung.
  if (await loadViewer()) redirect("/account");
  return <WizardPage {...await loadWizardProps(searchParams?.["from"])} />;
}
```

`apps/web/app/@modal/(.)mitmachen/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { requireAuthFlag } from "../../_auth/flag";
import { loadViewer } from "../../_dashboard/session";
import { requireOnboardingFlag } from "../../_onboarding/flag";
import { loadWizardProps } from "../../_onboarding/load";
import { WizardModal } from "../../_onboarding/WizardModal";

export const dynamic = "force-dynamic";

/** Fängt die Navigation nach /mitmachen ab und zeigt den Wizard als Fenster (Spec §5.5). */
export default async function MitmachenModal({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  requireAuthFlag();
  requireOnboardingFlag();
  if (await loadViewer()) redirect("/account");
  return <WizardModal {...await loadWizardProps(searchParams?.["from"])} />;
}
```

`apps/web/app/@modal/default.tsx`:

```tsx
/** Ohne abgefangene Route ist der Slot leer. */
export default function ModalDefault() {
  return null;
}
```

`apps/web/app/@modal/[...catchAll]/page.tsx`:

```tsx
/**
 * Schließt das Fenster bei jeder anderen Navigation. Ohne diese Seite behielte
 * der Slot beim Weiterklicken den letzten Inhalt (Next.js-Muster für Modals).
 */
export default function ModalCatchAll() {
  return null;
}
```

- [ ] **Step 4: Slot im Root-Layout rendern**

In `apps/web/app/layout.tsx`:

(a) Signatur ersetzen:

```tsx
export default function RootLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
```

(b) direkt nach `<CookieNotice privacyUrl={privacy} />` einfügen:

```tsx
{
  modal;
}
```

- [ ] **Step 5: Bauen und von Hand prüfen**

```bash
pnpm --filter @bdas/web typecheck
pnpm --filter @bdas/web build
```

Expected: Build ohne Fehler; in der Routenliste erscheinen `/mitmachen` und `/(.)mitmachen` (bzw. `@modal`).

Dann `BDAS_FLAG_ONBOARDING=true pnpm --filter @bdas/web dev`, im Browser `/` öffnen, „Mitglied werden" klicken (nach Task 8) — bis dahin `/mitmachen` direkt aufrufen: die volle Seite erscheint.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_onboarding/load.ts apps/web/app/_onboarding/WizardModal.tsx apps/web/app/_onboarding/WizardPage.tsx apps/web/app/mitmachen "apps/web/app/@modal" apps/web/app/layout.tsx
git commit -m "feat(web): /mitmachen als Fenster und als Seite

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Links wechseln mit dem Flag

**Files:**

- Modify: `apps/web/app/_public/PublicHeaderView.tsx`
- Modify: `apps/web/app/_public/PublicHeader.tsx`
- Modify: `apps/web/app/_public/landing/Hero.tsx`
- Modify: `apps/web/app/_public/landing/ConnectBlock.tsx`
- Modify: `apps/web/app/page.tsx`
- Test: `apps/web/app/_public/PublicHeaderView.test.tsx`

**Interfaces:**

- Consumes: `joinHref()` aus Task 2.
- Produces: `PublicHeaderView` Prop `joinHref?: string` (Vorgabe `"/registrieren"`, damit der Puck-Canvas unverändert rendert); `Hero` und `ConnectBlock` ebenso.

- [ ] **Step 1: Failing test schreiben**

In `PublicHeaderView.test.tsx` innerhalb von `describe("PublicHeaderView", …)` anhängen:

```tsx
it("points 'Mitglied werden' at the given target", () => {
  const out = renderToStaticMarkup(
    <PublicHeaderView items={navItems({ isLoggedIn: false })} konto={null} joinHref="/mitmachen" />,
  );
  expect(out).toContain('href="/mitmachen"');
  expect(out).not.toContain('href="/registrieren"');
});

it("keeps /registrieren by default", () => {
  expect(renderToStaticMarkup(visitor())).toContain('href="/registrieren"');
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `pnpm vitest run apps/web/app/_public/PublicHeaderView.test.tsx`
Expected: FAIL — Typfehler bzw. `href="/registrieren"` bleibt.

- [ ] **Step 3: Implementieren**

`PublicHeaderView.tsx`: Props erweitern und beide `href="/registrieren"` ersetzen:

```tsx
export function PublicHeaderView({
  items,
  konto,
  joinHref = "/registrieren",
}: {
  items: NavItem[];
  konto: { displayName: string; isBoard: boolean; openCount: number; showFaq: boolean } | null;
  joinHref?: string;
}) {
```

Beide Vorkommen `href="/registrieren"` → `href={joinHref}`.

`PublicHeader.tsx`: `import { joinHref } from "../_onboarding/flag";` ergänzen und im JSX `<PublicHeaderView items={items} joinHref={joinHref()} konto={…}` setzen.

`landing/Hero.tsx`: Signatur

```tsx
export function Hero({
  loggedIn,
  hasGroup,
  joinHref = "/registrieren",
}: {
  loggedIn: boolean;
  hasGroup: boolean;
  joinHref?: string;
}) {
```

und `<Link href="/registrieren" className={SECONDARY}>` → `<Link href={joinHref} className={SECONDARY}>`.

`landing/ConnectBlock.tsx`: Prop `joinHref = "/registrieren"` (Typ `joinHref?: string`) ergänzen und `href={loggedIn ? "/account" : "/registrieren"}` → `href={loggedIn ? "/account" : joinHref}`.

`app/page.tsx`: `import { joinHref } from "./_onboarding/flag";` ergänzen; `<Hero loggedIn={loggedIn} hasGroup={hasGroup} joinHref={joinHref()} />` und `<ConnectBlock loggedIn={loggedIn} joinHref={joinHref()} />`.

- [ ] **Step 4: Tests und Typcheck**

```bash
pnpm vitest run apps/web/app/_public/PublicHeaderView.test.tsx
pnpm --filter @bdas/web typecheck
```

Expected: PASS; Typcheck grün.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_public apps/web/app/page.tsx
git commit -m "feat(web): Mitglied werden führt mit Flag in den Wizard

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: E2E auf einem zweiten Server

**Files:**

- Modify: `playwright.config.ts`
- Modify: `e2e/helpers/db.ts`
- Create: `e2e/onboarding-konto.e2e.ts`

**Interfaces:**

- Produces: Projekt `onboarding` (Port 3001, Flag an) für alle `e2e/onboarding-*.e2e.ts`; `journeyByEmail(email): Promise<{ outcome: string; status: string; entry_source: string; stadt: string | null; application_ref: string | null } | null>`.

- [ ] **Step 1: Playwright-Konfiguration**

In `playwright.config.ts`:

(a) unter `const baseURL = …` ergänzen:

```ts
/** Zweiter Server mit eingeschaltetem Onboarding-Wizard. Die übrigen Specs
 *  laufen weiter ohne das Flag, bis der alte Registrierungsweg entfernt ist. */
const ONBOARDING_PORT = 3001;
const onboardingURL = `http://localhost:${ONBOARDING_PORT}`;
const ONBOARDING_SPECS = /onboarding-.*\.e2e\.ts$/;

const APP_ENV = {
  BDAS_FLAG_AUTH: "true",
  BDAS_FLAG_MEMBERS: "true",
  BDAS_FLAG_GROUPS: "true",
  BDAS_FLAG_DASHBOARD: "true",
  BDAS_FLAG_PUBLIC_SHELL: "true",
  BDAS_FLAG_CONTENT: "true",
  BDAS_FLAG_BLOG: "true",
  BDAS_FLAG_BLOG_COMMENTS: "true",
  BDAS_FLAG_PROFILE: "true",
  BDAS_FLAG_FAQ: "true",
  BDAS_FLAG_FAQ_SUITE: "true",
  BDAS_FLAG_NEWSLETTER: "true",
};

const dismissedNotice = (origin: string) => ({
  cookies: [],
  origins: [{ origin, localStorage: [{ name: "bdas-cookie-notice", value: "dismissed" }] }],
});
```

(b) in `use` den Block `storageState: { … }` ersetzen durch `storageState: dismissedNotice(baseURL),` (Kommentar darüber stehen lassen).

(c) `projects` ersetzen:

```ts
  projects: [
    {
      name: "mobile-chromium",
      // §23 asks for mobile; use a mobile viewport/UA.
      use: { ...devices["Pixel 7"] },
      testIgnore: ONBOARDING_SPECS,
    },
    {
      name: "onboarding",
      use: {
        ...devices["Pixel 7"],
        baseURL: onboardingURL,
        storageState: dismissedNotice(onboardingURL),
      },
      testMatch: ONBOARDING_SPECS,
    },
  ],
```

(d) `webServer` ersetzen:

```ts
  webServer: [
    {
      command: "pnpm --filter @bdas/web start",
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: !process.env["CI"],
      env: APP_ENV,
    },
    {
      command: `pnpm --filter @bdas/web exec next start -p ${ONBOARDING_PORT}`,
      url: onboardingURL,
      timeout: 120_000,
      reuseExistingServer: !process.env["CI"],
      env: { ...APP_ENV, BDAS_FLAG_ONBOARDING: "true", PUBLIC_SITE_URL: onboardingURL },
    },
  ],
```

- [ ] **Step 2: DB-Helfer**

Am Ende von `e2e/helpers/db.ts` anhängen:

```ts
/** Die Journey eines Kontos (onboarding_journeys), oder null. */
export async function journeyByEmail(email: string): Promise<{
  outcome: string;
  status: string;
  entry_source: string;
  stadt: string | null;
  application_ref: string | null;
} | null> {
  const rows = await sql<
    {
      outcome: string;
      status: string;
      entry_source: string;
      stadt: string | null;
      application_ref: string | null;
    }[]
  >`
    SELECT j.outcome, j.status, j.entry_source, j.stadt, j.application_ref
    FROM onboarding_journeys j
    JOIN auth_users u ON u.id = j.user_id
    WHERE u.email_normalized = ${email.trim().toLowerCase()}`;
  return rows[0] ?? null;
}
```

- [ ] **Step 3: Spec schreiben**

`e2e/onboarding-konto.e2e.ts`:

```ts
/**
 * Onboarding-Wizard, Teil 1 und 2 (Spec 2026-09-16 §4.1, §4.2, §5.5, §7).
 * Läuft im Projekt `onboarding` gegen den Server mit BDAS_FLAG_ONBOARDING.
 */
import { expect, test, type Page } from "@playwright/test";

import { journeyByEmail, resetRateLimits, seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import { openMobileMenu, PASSWORD } from "./helpers/flows";

function uniqueCity(): string {
  return `Onbstadt${Math.random().toString(36).slice(2, 7)}`;
}

async function answerName(page: Page, first: string, last: string): Promise<void> {
  await page.getByLabel("Vorname").fill(first);
  await page.getByLabel("Nachname").fill(last);
  await page.getByRole("button", { name: "Weiter" }).click();
}

async function createAccount(page: Page, email: string): Promise<void> {
  await resetRateLimits();
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.locator("#consent").check();
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(
    page.getByRole("heading", { name: "Wir haben dir eine Mail geschickt" }),
  ).toBeVisible();
}

test("the window opens from the header and closes again", async ({ page }) => {
  await page.goto("/");
  await openMobileMenu(page);
  await page.getByRole("banner").locator('a[href="/mitmachen"]:visible').first().click();

  const dialog = page.getByRole("dialog", { name: "Mitglied werden" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/mitmachen$/);
  await expect(
    dialog.getByRole("heading", { name: /Was beschreibt dich am besten\?/ }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("a direct link renders the full page", async ({ page }) => {
  await page.goto("/mitmachen");
  await expect(page.getByRole("heading", { level: 1, name: "Mitglied werden" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("student with a group: questions, result, account, mail", async ({ page }) => {
  const city = uniqueCity();
  await seedGroup({ slug: uniqueSlug("e2e-onb"), name: `BDAS ${city}`, city, status: "active" });
  const email = uniqueEmail("onb-student");

  await page.goto("/mitmachen?from=kampagne:e2e");
  await page.getByRole("button", { name: /Ich studiere gerade/ }).click();
  await answerName(page, "Lea", "Test");

  await expect(page.getByRole("heading", { name: "Wo studierst du, Lea?" })).toBeVisible();
  await page.getByLabel("Stadt oder Hochschule").fill(city);
  await page
    .getByRole("button", { name: new RegExp(`BDAS ${city}`) })
    .first()
    .click();

  await expect(
    page.getByRole("heading", { name: `Du passt zu uns als Student*in in ${city}.` }),
  ).toBeVisible();
  await expect(page.getByText(`Der Vorstand von BDAS ${city}`)).toBeVisible();
  await page.getByRole("button", { name: "Passt — Konto anlegen" }).click();
  await createAccount(page, email);

  expect(await journeyByEmail(email)).toMatchObject({
    outcome: "student",
    status: "details_offen",
    entry_source: "kampagne:e2e",
    stadt: city,
    application_ref: null,
  });
});

test("student without a group lands with the federal board", async ({ page }) => {
  const city = uniqueCity();
  const email = uniqueEmail("onb-ohne");

  await page.goto("/mitmachen");
  await page.getByRole("button", { name: /Ich studiere gerade/ }).click();
  await answerName(page, "Mo", "Test");
  await page.getByLabel("Stadt oder Hochschule").fill(city);
  await expect(page.getByText(`In ${city} gibt es noch keine Gruppe`)).toBeVisible();
  await page.getByRole("button", { name: "Weiter" }).click();

  await expect(page.getByText(`Du willst in ${city} eine Gruppe gründen?`)).toBeVisible();
  await page.getByRole("button", { name: "Passt — Konto anlegen" }).click();
  await createAccount(page, email);

  expect(await journeyByEmail(email)).toMatchObject({
    outcome: "student_ohne_gruppe",
    stadt: city,
  });
});

test("supporter changes their mind and back, keeping the name", async ({ page }) => {
  const email = uniqueEmail("onb-foerderer");

  await page.goto("/mitmachen");
  await page.getByRole("button", { name: /Ich möchte unterstützen/ }).click();
  await answerName(page, "Ada", "Test");
  await expect(
    page.getByRole("heading", { name: "Du passt zu uns als Förderer*in." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Doch etwas anderes" }).click();
  await page.getByRole("button", { name: /Ich möchte unterstützen/ }).click();
  await expect(page.getByLabel("Vorname")).toHaveValue("Ada");
  await page.getByRole("button", { name: "Weiter" }).click();

  await page.getByRole("button", { name: "Passt — Konto anlegen" }).click();
  await createAccount(page, email);
  expect(await journeyByEmail(email)).toMatchObject({
    outcome: "foerderer",
    entry_source: "direkt",
  });
});

test("answers survive a reload", async ({ page }) => {
  await page.goto("/mitmachen");
  await page.getByRole("button", { name: /Ich studiere gerade/ }).click();
  await answerName(page, "Lea", "Test");
  await expect(page.getByRole("heading", { name: "Wo studierst du, Lea?" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Wo studierst du, Lea?" })).toBeVisible();
});

test("the whole first part works with the keyboard alone", async ({ page }) => {
  await page.goto("/mitmachen");
  const card = page.getByRole("button", { name: /Ich habe studiert/ });
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Wie dürfen wir dich nennen?" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.type("Kim");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Test");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Wo warst du aktiv, Kim?" })).toBeFocused();
});
```

Hinweis zum Tastatur-Test: Nach dem Fokus auf die Überschrift ist das nächste Tab-Ziel das Vorname-Feld, wenn „← Zurück" **vor** der Überschrift steht (so ist es gebaut). Scheitert die Reihenfolge, die Tab-Folge im Browser nachvollziehen und den Test anpassen — nicht die Reihenfolge der Elemente.

- [ ] **Step 4: Bauen und E2E laufen lassen**

```bash
lsof -i :3000 -i :3001
pnpm db:up && pnpm db:migrate
pnpm --filter @bdas/web build
pnpm e2e e2e/onboarding-konto.e2e.ts
```

Expected: 7 Tests PASS im Projekt `onboarding`.

- [ ] **Step 5: Übrige E2E-Specs unberührt?**

Run: `pnpm e2e e2e/auth.e2e.ts e2e/public-shell.e2e.ts`
Expected: PASS im Projekt `mobile-chromium` — der Server auf 3000 hat das Flag nicht.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e/helpers/db.ts e2e/onboarding-konto.e2e.ts
git commit -m "test(e2e): Onboarding Teil 1 und 2 auf eigenem Server

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Gesamtprüfung und PR

- [ ] **Step 1: Betroffene Tests**

```bash
pnpm vitest run apps/web/app/_onboarding apps/web/app/registrieren apps/web/app/_public/PublicHeaderView.test.tsx core/design-system/src/components/Dialog.test.tsx
```

Expected: alles PASS.

- [ ] **Step 2: Typcheck, Lint, Format**

```bash
pnpm --filter @bdas/web typecheck
pnpm --filter @bdas/design-system typecheck
pnpm lint
pnpm format:check
```

Expected: ohne Fehler.

- [ ] **Step 3: Sichtprüfung auf dem Handy**

`BDAS_FLAG_ONBOARDING=true pnpm --filter @bdas/web dev`, Chrome mit Gerätesymbolleiste (⌥⌘I, ⇧⌘M, Pixel 7): Fenster füllt den Bildschirm, keine waagrechte Scrollleiste, Karten heben sich beim Hover, nur die gewählte Karte und der Hauptknopf sind rot. Mit den genehmigten Entwürfen (`.superdesign/tmp/m1.html`, `m3.html`, `m4.html`) vergleichen.

- [ ] **Step 4: Push und PR**

```bash
git log --oneline origin/main..HEAD
git push -u origin feat/onboarding-fenster
gh pr create --title "feat(web): Onboarding-Fenster mit Fragen und Konto" --body "$(cat <<'EOF'
PR 3 von 6 aus `docs/superpowers/specs/2026-09-16-onboarding-wizard-design.md` §8.

- `/mitmachen` als Fenster (Intercepting Route im Slot `@modal`) und als volle Seite
- Teil 1: Fragen aus `@bdas/onboarding`, Gruppensuche nach Stadt oder Hochschule, Ergebnis
- Teil 2: Konto anlegen; die Server-Aktion rechnet das Ergebnis nach und speichert die Journey
- „Mitglied werden" zeigt nur mit Flag `onboarding` auf `/mitmachen`; `/registrieren` bleibt unverändert
- E2E auf einem zweiten Server (Port 3001) mit eingeschaltetem Flag

Abweichung von der Spec: eigene Route `/mitmachen` statt Fenster über `/registrieren`, damit das Flag den neuen Weg vollständig abschaltet.

Braucht `/security-review` (Registrierung).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Reviews**

`/review` und `/security-review`. Befunde beheben, bevor gemergt wird.
