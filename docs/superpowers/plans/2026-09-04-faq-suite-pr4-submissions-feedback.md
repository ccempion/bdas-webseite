# FAQ-Suite v2 — PR 4: Einreichungen + Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mitglieder können auf `/faq` Fragen einreichen (persistenter Button + No-Results-CTA, Dialog) und Einträge mit 👍/👎 bewerten; der Bundesvorstand sieht offene Fragen in einem zweiten Tab auf `/federal/faq`, beantwortet sie (verknüpft mit dem neuen Eintrag) oder verwirft sie, und eine Zählerkarte auf `/federal/overview` zeigt offene Fragen an.

**Architecture:** Zwei neue, öffentlich erreichbare Server Actions (`submitFaqQuestionAction`, `upsertFeedbackAction`) — anders als PR 3s Board-Actions ohne `assertFederal()`, aber mit derselben `getCurrentMember`-Prüfung ("Anmeldung erforderlich" statt Autorisierung). Der Board-Tab „Offene Fragen" ist ein zweiter Zustand von PR 3s bereits vorhandener `/federal/faq`-Seite (Query-Param `?tab=submissions`, exakt das Muster aus `federal/roles/page.tsx`) und öffnet zum Beantworten **denselben** `FaqEntryDialog` aus PR 3 mit vorbefüllter `question` und gesetzter `submissionId`. Feedback bleibt bewusst zustandslos auf dem Client (kein Re-Fetch der eigenen Stimme) — das Modul gibt nur Aggregate heraus (README), also zeigt die Leseseite nach dem Klick eine lokale Bestätigung statt eines aus der DB gelesenen "du hast schon abgestimmt"-Zustands.

**Tech Stack:** Next.js 14 App Router, React Client Components, Tailwind + Design-Tokens, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md` (§4, §5 „Einreichen", §6 „Offene Fragen" + Zählerkarte, §9)

## Global Constraints

- Voraussetzung: **PR 1, PR 2 und PR 3 sind gemerged** — `@bdas/faq` (`createSubmission`, `listSubmissions`, `discardSubmission`, `openSubmissionCount`, `upsertFeedback`, `feedbackCounts`, Typen `FaqSubmission`, `FaqSubmissionStatus`) und PR 3s `apps/web/app/(board)/federal/faq/{actions.ts,FaqEntryDialog.tsx,FaqAdminBoard.tsx,page.tsx}` existieren.
- Autorisierung (Spec §4): `createSubmission` und `upsertFeedback` sind für **jedes angemeldete Mitglied** offen — keine Rollenprüfung, nur „ist überhaupt angemeldet". `discardSubmission` und das Beantworten (= `saveEntryAction` aus PR 3) bleiben federal-board-only.
- Autoren-/Absender-Felder sind **User-IDs** (`me.user.id`), identisch zur Konvention aus PR 3 und `admin/events/actions.ts`.
- Kein Datum als `Date`-Instanz über die Server/Client-Grenze (PR 2s Konvention in `assemble.ts`: „nur Plain-Objekte, keine Date-Instanzen") — `FaqSubmission.createdAt` wird vor Übergabe an eine Client Component zu `createdAtIso: string` gewandelt.
- Kein E-Mail-Versand bei Einreichung (Spec §4 / Modul-README) — nicht nachrüsten.
- Destruktive Aktionen (`Verwerfen`) nutzen `window.confirm(...)`, wie in PR 3.
- Alle UI-Texte deutsch. Vor jedem Commit Prettier auf die geänderten Dateien.
- `/security-review` ist für diesen PR Pflicht (Spec §9: „PR 3–5 berühren Berechtigungen" — hier neu: zwei ungated Schreibpfade für jedes angemeldete Mitglied).

## File Structure

```
apps/web/app/faq/
  submission-actions.ts     "use server": submitFaqQuestionAction
  feedback-actions.ts        "use server": upsertFeedbackAction
  FaqSubmissionDialog.tsx    Dialog: Frage + Details, Bestätigungszustand
  FaqExplorer.tsx            + persistenter Header-Button, No-Results-CTA öffnet den Dialog
  FaqEntryCard.tsx           + Daumen-Buttons mit lokaler Bestätigung
apps/web/app/(board)/federal/faq/
  submission-view.ts          reine View-Mapping-Funktion
  submission-view.test.ts
  actions.ts                   + discardSubmissionAction
  SubmissionsPanel.tsx         "Offene Fragen"-Tab: Karten, Antwort verfassen, Verwerfen
  page.tsx                     + Tab-Umschaltung, lädt Submissions + Mitgliedernamen
apps/web/app/(board)/federal/overview/page.tsx   + Zählerkarte "Offene FAQ-Fragen"
e2e/faq.e2e.ts                erweitert: Einreichen → Zähler → Beantworten → veröffentlicht; Feedback-Klick
```

---

### Task 1: `submission-view.ts` — reine Mapping-Funktion (TDD)

**Files:**

- Create: `apps/web/app/(board)/federal/faq/submission-view.ts`, Test: `submission-view.test.ts`

**Interfaces:**

- Consumes: `FaqSubmission` aus `@bdas/faq`.
- Produces:

```ts
export type SubmissionView = {
  id: string;
  question: string;
  details: string | null;
  context: string | null;
  submittedByName: string;
  createdAtIso: string;
};
export function toSubmissionView(
  s: FaqSubmission,
  memberNames: ReadonlyMap<string, string>, // userId -> "Vorname Nachname"
): SubmissionView;
```

- [ ] **Step 1: Failing Test**

```ts
import { describe, expect, it } from "vitest";
import { toSubmissionView } from "./submission-view";
import type { FaqSubmission } from "@bdas/faq";

const submission: FaqSubmission = {
  id: "s1",
  question: "Wie melde ich mich an?",
  details: "Ich finde den Button nicht.",
  context: null,
  submittedBy: "user-1",
  status: "open",
  entryId: null,
  createdAt: new Date("2026-09-01T12:00:00.000Z"),
};

describe("toSubmissionView", () => {
  it("resolves the submitter's name and serializes the date", () => {
    const view = toSubmissionView(submission, new Map([["user-1", "Ada Lovelace"]]));
    expect(view).toEqual({
      id: "s1",
      question: "Wie melde ich mich an?",
      details: "Ich finde den Button nicht.",
      context: null,
      submittedByName: "Ada Lovelace",
      createdAtIso: "2026-09-01T12:00:00.000Z",
    });
  });

  it("falls back to a placeholder for an unresolved user id", () => {
    const view = toSubmissionView(submission, new Map());
    expect(view.submittedByName).toBe("Unbekannt");
  });
});
```

- [ ] **Step 2: FAIL sehen** — Run: `pnpm vitest run "app/(board)/federal/faq/submission-view.test.ts"` → FAIL.

- [ ] **Step 3: Implementieren**

```ts
import type { FaqSubmission } from "@bdas/faq";

export type SubmissionView = {
  id: string;
  question: string;
  details: string | null;
  context: string | null;
  submittedByName: string;
  createdAtIso: string;
};

export function toSubmissionView(
  s: FaqSubmission,
  memberNames: ReadonlyMap<string, string>,
): SubmissionView {
  return {
    id: s.id,
    question: s.question,
    details: s.details,
    context: s.context,
    submittedByName: memberNames.get(s.submittedBy) ?? "Unbekannt",
    createdAtIso: s.createdAt.toISOString(),
  };
}
```

- [ ] **Step 4: PASS + Typecheck** — Run: `pnpm vitest run "app/(board)/federal/faq" && pnpm --filter web typecheck` → grün.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(board\)/federal/faq/submission-view.ts apps/web/app/\(board\)/federal/faq/submission-view.test.ts
git commit -m "feat(faq): View-Mapping für Submission-Karten"
```

---

### Task 2: Öffentliche Server Actions — Einreichen + Feedback

**Files:**

- Create: `apps/web/app/faq/submission-actions.ts`, `apps/web/app/faq/feedback-actions.ts`

**Interfaces:**

- Consumes: `getDb` aus `@bdas/db`; `createSubmission, upsertFeedback` aus `@bdas/faq`; `getCurrentMember` aus `@bdas/members`; `isAppError` aus `@bdas/errors`; `readSessionCookie` aus `../../lib/auth-cookie`.
- Produces:

```ts
export type ActionResult = { ok: true } | { ok: false; error: string };
export async function submitFaqQuestionAction(input: {
  question: string;
  details?: string;
}): Promise<ActionResult>;
```

```ts
export type ActionResult = { ok: true } | { ok: false; error: string };
export async function upsertFeedbackAction(
  entryId: string,
  helpful: boolean,
): Promise<ActionResult>;
```

- [ ] **Step 1: Beide Dateien schreiben.**

```ts
// submission-actions.ts
"use server";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { createSubmission } from "@bdas/faq";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Jedes angemeldete Mitglied darf einreichen (Spec §4) — keine Rollenprüfung,
 *  nur "ist überhaupt angemeldet". Kein Revalidate: eine neue Einreichung
 *  verändert keine bereits gerenderte Seite außer /federal/faq (Zähler), das
 *  ohnehin `force-dynamic` ist. */
export async function submitFaqQuestionAction(input: {
  question: string;
  details?: string;
}): Promise<ActionResult> {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) return { ok: false, error: "Anmeldung erforderlich." };
  try {
    await createSubmission(getDb(), {
      question: input.question,
      details: input.details,
      submittedBy: me.user.id,
    });
    return { ok: true };
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    throw err;
  }
}
```

```ts
// feedback-actions.ts
"use server";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { upsertFeedback } from "@bdas/faq";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Jedes angemeldete Mitglied darf abstimmen, nur für die eigene Stimme
 *  (Spec §4) — `userId` kommt aus der Session, nie vom Client. */
export async function upsertFeedbackAction(
  entryId: string,
  helpful: boolean,
): Promise<ActionResult> {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) return { ok: false, error: "Anmeldung erforderlich." };
  try {
    await upsertFeedback(getDb(), { entryId, userId: me.user.id, helpful });
    return { ok: true };
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    throw err;
  }
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter web typecheck` → grün.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/faq/submission-actions.ts apps/web/app/faq/feedback-actions.ts
git commit -m "feat(faq): öffentliche Server Actions für Einreichen und Feedback"
```

---

### Task 3: `discardSubmissionAction` (Board-Actions erweitern)

**Files:**

- Modify: `apps/web/app/(board)/federal/faq/actions.ts`

**Interfaces:**

- Consumes zusätzlich: `discardSubmission` aus `@bdas/faq`.
- Produces zusätzlich: `export async function discardSubmissionAction(id: string): Promise<ActionResult>`.

- [ ] **Step 1: Import ergänzen** — in der bestehenden `import { ... } from "@bdas/faq"`-Zeile `discardSubmission` hinzufügen.

- [ ] **Step 2: Funktion ergänzen** (ans Dateiende, gleiches Muster wie `deleteEntryAction`):

```ts
export async function discardSubmissionAction(id: string): Promise<ActionResult> {
  try {
    const me = await assertFederal();
    await discardSubmission(getDb(), { id, decidedBy: me.user.id });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}
```

- [ ] **Step 3: Typecheck** — Run: `pnpm --filter web typecheck` → grün.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(board\)/federal/faq/actions.ts
git commit -m "feat(faq): Server Action zum Verwerfen offener Anfragen"
```

---

### Task 4: `FaqSubmissionDialog` — Einreichen-Formular

**Files:**

- Create: `apps/web/app/faq/FaqSubmissionDialog.tsx`

**Interfaces:**

- Consumes: `Alert, Dialog, Input` aus `@bdas/design-system`; `submitFaqQuestionAction` aus `./submission-actions`.
- Produces:

```tsx
export function FaqSubmissionDialog(props: {
  open: boolean;
  onClose: () => void;
  initialQuestion?: string; // vorbefüllt aus der Suche (No-Results-CTA)
}): ReactNode;
```

- Zustände: Formular (Frage-`Input`, Details-`<textarea>`, „Absenden") → bei Erfolg Bestätigungszustand (`Alert variant="success"`, „Schließen"-Button). Der Aufrufer muss bei jedem Öffnen mit neuem `initialQuestion` remounten (`key`-Prop am Call-Standort, wie bei `FaqEntryDialog` in PR 3) — diese Komponente selbst synchronisiert `initialQuestion` nur beim ersten Render.

- [ ] **Step 1: Datei schreiben.**

```tsx
"use client";

import { useState, useTransition, type ReactNode } from "react";

import { Alert, Dialog, Input } from "@bdas/design-system";

import { submitFaqQuestionAction } from "./submission-actions";

export function FaqSubmissionDialog({
  open,
  onClose,
  initialQuestion = "",
}: {
  open: boolean;
  onClose: () => void;
  initialQuestion?: string;
}): ReactNode {
  const [question, setQuestion] = useState(initialQuestion);
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleClose() {
    setSent(false);
    setError(null);
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Frage einreichen">
      {sent ? (
        <div className="flex flex-col gap-3">
          <Alert variant="success">
            Danke! Der Bundesvorstand beantwortet deine Frage — sie erscheint dann hier im FAQ.
          </Alert>
          <button
            type="button"
            onClick={handleClose}
            className="self-start rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm"
          >
            Schließen
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Deine Frage"
            aria-label="Deine Frage"
          />
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Details (optional)"
            className="min-h-[6rem] rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2.5 text-bdas-ink focus:border-bdas-red focus:outline-none"
          />
          <button
            type="button"
            disabled={pending || question.trim() === ""}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await submitFaqQuestionAction({
                  question,
                  details: details.trim() === "" ? undefined : details,
                });
                if (res.ok) setSent(true);
                else setError(res.error);
              })
            }
            className="self-start rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface disabled:opacity-40"
          >
            Absenden
          </button>
        </div>
      )}
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter web typecheck` → grün.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/faq/FaqSubmissionDialog.tsx
git commit -m "feat(faq): Einreichen-Dialog auf der Leseseite"
```

---

### Task 5: `FaqExplorer` verdrahten — Header-Button + No-Results-CTA

**Files:**

- Modify: `apps/web/app/faq/FaqExplorer.tsx`

**Interfaces:**

- Consumes zusätzlich: `FaqSubmissionDialog` aus `./FaqSubmissionDialog`.

- [ ] **Step 1: State + Import ergänzen** — nach den bestehenden `useState`-Zeilen:

```tsx
import { FaqSubmissionDialog } from "./FaqSubmissionDialog";
// ...
const [submitOpen, setSubmitOpen] = useState(false);
const [submitPrefill, setSubmitPrefill] = useState("");
```

- [ ] **Step 2: Persistenten Header-Button ergänzen** — im `<div className="mb-8">`-Block, direkt nach dem `<Input>` und vor dem Themen-Chip-`<div>`:

```tsx
<div className="mt-3 flex justify-end">
  <button
    type="button"
    onClick={() => {
      setSubmitPrefill("");
      setSubmitOpen(true);
    }}
    className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm font-semibold text-bdas-ink-body hover:bg-bdas-overlay-hover"
  >
    Frage einreichen
  </button>
</div>
```

- [ ] **Step 3: No-Results-CTA ersetzen** — den bestehenden `{/* PR 4: Submission-Dialog */}`-Kommentar-Block ersetzen durch:

```tsx
<button
  type="button"
  onClick={() => {
    setSubmitPrefill(query);
    setSubmitOpen(true);
  }}
  className="mt-3 rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface"
>
  Frage einreichen
</button>
```

- [ ] **Step 4: Dialog rendern** — am Ende der Funktion, vor dem schließenden `</div>` des äußersten Wrappers:

```tsx
<FaqSubmissionDialog
  key={submitOpen ? submitPrefill : "closed"}
  open={submitOpen}
  onClose={() => setSubmitOpen(false)}
  initialQuestion={submitPrefill}
/>
```

(Der `key` erzwingt einen Remount bei jedem Öffnen mit neuem Vorbefüll-Text — gleiche Begründung wie bei `FaqEntryCard`s `forceOpen`-Remount in PR 2.)

- [ ] **Step 5: Typecheck + bestehende Tests** — Run: `pnpm --filter web typecheck && pnpm vitest run app/faq` → grün (die reine Filterlogik in `explorer-filter.test.ts` ist unberührt).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/faq/FaqExplorer.tsx
git commit -m "feat(faq): Frage-einreichen-Button im Header und im No-Results-Zustand"
```

---

### Task 6: `FaqEntryCard` — Daumen-Feedback

**Files:**

- Modify: `apps/web/app/faq/FaqEntryCard.tsx`

**Interfaces:**

- Consumes zusätzlich: `upsertFeedbackAction` aus `./feedback-actions`; `useState, useTransition` aus `react`.

- [ ] **Step 1: Imports + State ergänzen** — oben in der Datei:

```tsx
"use client";

import { useState, useTransition, type ReactNode } from "react";

import type { FaqEntryView } from "../../lib/faq/assemble";
import { upsertFeedbackAction } from "./feedback-actions";
import { FaqRichText } from "./FaqRichText";
import { highlightMatches } from "./highlight";
import { YouTubeFacade } from "./YouTubeFacade";
```

Innerhalb der Komponentenfunktion, vor dem `return`:

```tsx
const [voted, setVoted] = useState<"up" | "down" | null>(null);
const [pending, start] = useTransition();

function vote(helpful: boolean) {
  start(async () => {
    const res = await upsertFeedbackAction(entry.id, helpful);
    if (res.ok) setVoted(helpful ? "up" : "down");
  });
}
```

- [ ] **Step 2: Daumen in die Fußzeile einfügen** — im bestehenden `<footer>`, nach dem „Link kopieren"-Button und vor den verwandten Fragen:

```tsx
<span className="flex items-center gap-1.5">
  {voted ? (
    <span className="text-bdas-ink-muted">Danke für dein Feedback!</span>
  ) : (
    <>
      <span>War das hilfreich?</span>
      <button
        type="button"
        disabled={pending}
        aria-label="Hilfreich"
        onClick={() => vote(true)}
        className="rounded-bdas-sm px-1.5 py-0.5 hover:bg-bdas-overlay-hover"
      >
        👍
      </button>
      <button
        type="button"
        disabled={pending}
        aria-label="Nicht hilfreich"
        onClick={() => vote(false)}
        className="rounded-bdas-sm px-1.5 py-0.5 hover:bg-bdas-overlay-hover"
      >
        👎
      </button>
    </>
  )}
</span>
```

- [ ] **Step 3: Typecheck** — Run: `pnpm --filter web typecheck` → grün.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/faq/FaqEntryCard.tsx
git commit -m "feat(faq): Daumen-Feedback auf der Leseseite"
```

---

### Task 7: `SubmissionsPanel` — Board-Tab „Offene Fragen"

**Files:**

- Create: `apps/web/app/(board)/federal/faq/SubmissionsPanel.tsx`

**Interfaces:**

- Consumes: `SubmissionView` aus `./submission-view`; `discardSubmissionAction` aus `./actions`; `FaqEntryDialog` aus `./FaqEntryDialog`; `FaqTopic` aus `@bdas/faq`.
- Produces:

```tsx
export function SubmissionsPanel(props: {
  submissions: readonly SubmissionView[]; // bereits nur status "open" (Server-Filter)
  allEntries: ReadonlyArray<{ id: string; question: string }>;
  topics: readonly FaqTopic[];
}): ReactNode;
```

- [ ] **Step 1: Datei schreiben.**

```tsx
"use client";

import { useState, useTransition, type ReactNode } from "react";

import type { FaqTopic } from "@bdas/faq";

import { discardSubmissionAction } from "./actions";
import { FaqEntryDialog, type FaqEntryDialogInitial } from "./FaqEntryDialog";
import type { SubmissionView } from "./submission-view";

const EMPTY_BODY = { type: "doc", content: [] } as const;

export function SubmissionsPanel({
  submissions,
  allEntries,
  topics,
}: {
  submissions: readonly SubmissionView[];
  allEntries: ReadonlyArray<{ id: string; question: string }>;
  topics: readonly FaqTopic[];
}): ReactNode {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [answering, setAnswering] = useState<SubmissionView | null>(null);

  function answerInitial(s: SubmissionView): FaqEntryDialogInitial {
    return {
      section: "mitglieder",
      subgroup: null,
      topicId: null,
      question: s.question,
      body: EMPTY_BODY,
      youtubeId: null,
      relatedIds: [],
      contexts: [],
      submissionId: s.id,
    };
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-bdas-red">{error}</p>}
      {submissions.map((s) => (
        <div
          key={s.id}
          className="flex flex-col gap-2 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card"
        >
          <p className="text-sm font-semibold text-bdas-ink">{s.question}</p>
          {s.details && <p className="text-sm text-bdas-ink-body">{s.details}</p>}
          <p className="text-xs text-bdas-ink-muted">
            {s.submittedByName} ·{" "}
            {new Date(s.createdAtIso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
            {s.context ? ` · ${s.context}` : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAnswering(s)}
              className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface"
            >
              Antwort verfassen
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`„${s.question}" verwerfen?`)) return;
                start(async () => {
                  const res = await discardSubmissionAction(s.id);
                  if (!res.ok) setError(res.error);
                });
              }}
              className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm text-bdas-ink-body hover:bg-bdas-overlay-hover"
            >
              Verwerfen
            </button>
          </div>
        </div>
      ))}
      {submissions.length === 0 && (
        <p className="text-sm text-bdas-ink-muted">Keine offenen Fragen.</p>
      )}
      {answering && (
        <FaqEntryDialog
          open
          onClose={() => setAnswering(null)}
          initial={answerInitial(answering)}
          allEntries={allEntries}
          topics={topics}
          currentStatus={null}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter web typecheck` → grün.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(board\)/federal/faq/SubmissionsPanel.tsx
git commit -m "feat(faq): Board-Tab 'Offene Fragen' mit Antwort verfassen und Verwerfen"
```

---

### Task 8: `/federal/faq` — Tab-Umschaltung

**Files:**

- Modify: `apps/web/app/(board)/federal/faq/page.tsx`

**Interfaces:**

- Consumes zusätzlich: `listSubmissions` aus `@bdas/faq`; `listMembers` aus `@bdas/members`; `toSubmissionView` aus `./submission-view`; `SubmissionsPanel`.

- [ ] **Step 1: Datei ersetzen** — vollständiger neuer Inhalt (Tab-Nav nach dem Muster in `federal/roles/page.tsx`):

```tsx
import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { feedbackCounts, listEntries, listSubmissions, listTopics } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";
import { listMembers } from "@bdas/members";

import { requireFederalScope } from "../../../_dashboard/session";
import { FaqAdminBoard } from "./FaqAdminBoard";
import { SubmissionsPanel } from "./SubmissionsPanel";
import { toSubmissionView } from "./submission-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "FAQ" };

export default async function FederalFaqPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  if (!isFlagOn("faq_suite")) notFound();
  await requireFederalScope();

  const db = getDb();
  const [entries, topics, openSubmissions, members] = await Promise.all([
    listEntries(db),
    listTopics(db),
    listSubmissions(db, { status: "open" }),
    listMembers(db, {}),
  ]);
  const counts = await feedbackCounts(
    db,
    entries.map((e) => e.id),
  );
  const feedbackByEntry = Object.fromEntries(counts);
  const memberNames = new Map(members.map((m) => [m.userId, `${m.firstName} ${m.lastName}`]));
  const submissionViews = openSubmissions.map((s) => toSubmissionView(s, memberNames));
  const allEntries = entries.map((e) => ({ id: e.id, question: e.question }));

  const tab = searchParams["tab"];
  const showSubmissions = tab === "submissions";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-bdas-ink">FAQ</h1>
        <nav className="flex gap-4 text-sm">
          <a
            href="/federal/faq"
            className={!showSubmissions ? "font-bold text-bdas-red" : "text-bdas-ink-body"}
          >
            Fragen &amp; Antworten
          </a>
          <a
            href="/federal/faq?tab=submissions"
            className={showSubmissions ? "font-bold text-bdas-red" : "text-bdas-ink-body"}
          >
            Offene Fragen ({submissionViews.length})
          </a>
        </nav>
      </div>
      {showSubmissions ? (
        <SubmissionsPanel submissions={submissionViews} allEntries={allEntries} topics={topics} />
      ) : (
        <FaqAdminBoard entries={entries} topics={topics} feedbackByEntry={feedbackByEntry} />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter web typecheck` → grün.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(board\)/federal/faq/page.tsx
git commit -m "feat(faq): Tab-Umschaltung Fragen&Antworten / Offene Fragen"
```

---

### Task 9: Zählerkarte auf `/federal/overview`

**Files:**

- Modify: `apps/web/app/(board)/federal/overview/page.tsx`

**Interfaces:**

- Consumes zusätzlich: `openSubmissionCount` aus `@bdas/faq`; `isFlagOn` aus `@bdas/feature-flags`.

- [ ] **Step 1: Import + Datenladung ergänzen** — am Dateikopf und im Body:

```tsx
import { getDb } from "@bdas/db";
import { listManagedEvents } from "@bdas/events-module";
import { openSubmissionCount } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";
import { listGroups } from "@bdas/groups";
import { countMembersByStatus, signupsOverTime } from "@bdas/members";
// ... bestehende Imports unverändert
```

Im `Promise.all` ergänzen (als eigenständiger `await`, da bedingt):

```tsx
const [counts, signups, groups, events] = await Promise.all([
  countMembersByStatus(db, {}),
  signupsOverTime(db, { days: 30 }),
  listGroups(db, { status: "active" }),
  listManagedEvents(db, viewerFrom(me)),
]);
const openFaq = isFlagOn("faq_suite") ? await openSubmissionCount(db) : 0;
```

- [ ] **Step 2: `ActionStrip`-Aufruf anpassen** — nur einfügen, wenn `openFaq > 0` (anders als „Freigaben", das immer grau sichtbar bleibt — Spec §6 verlangt hier explizit „nur bei > 0"):

```tsx
<ActionStrip
  items={[
    { count: counts.pending, label: "Freigaben", href: "/federal/members" },
    ...(openFaq > 0 ? [{ count: openFaq, label: "Offene FAQ-Fragen", href: "/federal/faq" }] : []),
  ]}
/>
```

- [ ] **Step 3: Typecheck** — Run: `pnpm --filter web typecheck` → grün.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(board\)/federal/overview/page.tsx
git commit -m "feat(faq): Zählerkarte 'Offene FAQ-Fragen' auf der Federal-Übersicht"
```

---

### Task 10: E2E + Security-Review-Hinweis + PR

**Files:**

- Modify: `e2e/faq.e2e.ts`

- [ ] **Step 1: End-to-End-Fluss testen** — an `e2e/faq.e2e.ts` anhängen:

```ts
test.describe("Einreichungen und Feedback", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("a member submits a question, a board member answers it, it appears on /faq", async ({
    page,
  }) => {
    const memberEmail = "faq-submitter@e2e.bdas.test";
    await deleteUserByEmail(memberEmail);
    await registerVerifyLogin(page, { email: memberEmail, firstName: "Faq", lastName: "Fragt" });

    await page.goto("/faq");
    await page.getByRole("button", { name: "Frage einreichen" }).first().click();
    await page.getByLabel("Deine Frage").fill("Wie funktioniert der E2E-Testfluss?");
    await page.getByRole("button", { name: "Absenden" }).click();
    await expect(page.getByText("Danke! Der Bundesvorstand")).toBeVisible();

    // War das hilfreich? — Daumen-Klick auf dem ersten offenen Eintrag.
    await page
      .locator(".bdas-accordion[open]")
      .first()
      .getByRole("button", { name: "Hilfreich" })
      .click();
    await expect(page.getByText("Danke für dein Feedback!").first()).toBeVisible();

    const boardEmail = "faq-answerer@e2e.bdas.test";
    await deleteUserByEmail(boardEmail);
    const boardPage = await page.context().newPage();
    await registerVerifyLogin(boardPage, {
      email: boardEmail,
      firstName: "Faq",
      lastName: "Beantwortet",
    });
    await grantFederalBoard(boardEmail);

    await boardPage.goto("/federal/overview");
    await expect(boardPage.getByRole("link", { name: /Offene FAQ-Fragen/ })).toBeVisible();

    await boardPage.goto("/federal/faq?tab=submissions");
    await expect(boardPage.getByText("Wie funktioniert der E2E-Testfluss?")).toBeVisible();
    await boardPage.getByRole("button", { name: "Antwort verfassen" }).click();
    await boardPage.getByRole("button", { name: "Veröffentlichen" }).click();

    await boardPage.goto("/faq");
    await boardPage.getByPlaceholder("Suche").fill("E2E-Testfluss");
    await expect(boardPage.locator("mark").first()).toBeVisible();
  });
});
```

(`grantFederalBoard` wie in PR 3 — den tatsächlichen Helfernamen aus `e2e/helpers/db.ts` übernehmen.)

- [ ] **Step 2: Lokal grün** — Run: `pnpm exec playwright test e2e/faq.e2e.ts` (mit laufender DB, `faq_suite`-Flag) → PASS.

- [ ] **Step 3: Commit + Push + PR**

```bash
git add e2e/faq.e2e.ts
git commit -m "feat(faq): E2E für Einreichen, Beantworten und Feedback"
git push
gh pr create --title "feat(faq): Einreichungen und Feedback (FAQ-Suite v2, PR 4)" --body "$(cat <<'EOF'
FAQ-Suite v2, PR 4 von 5 (Spec: docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md §4-6, §9).

- /faq: "Frage einreichen" (Header + No-Results-CTA) öffnet einen Dialog, jedes Mitglied darf einreichen
- /faq: 👍/👎-Feedback pro Eintrag, eigene Stimme änderbar, nur Aggregate verlassen das Modul
- /federal/faq: neuer Tab "Offene Fragen" — Antwort verfassen (verknüpft mit dem neuen Eintrag) oder verwerfen
- /federal/overview: Zählerkarte "Offene FAQ-Fragen", nur sichtbar bei offenen Anfragen
- Kein E-Mail-Versand bei Einreichung (Spec §4)

⚠️ Berührt Berechtigungen (zwei neue ungated Schreibpfade) — /security-review vor Merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Danach `/review` **und** `/security-review` auf den PR.

---

## Self-Review (erledigt)

- Spec §5 „Einreichen" abgedeckt: persistenter Button ✓ (T5), No-Results-CTA verdrahtet ✓ (T5), Dialog mit Bestätigungszustand ✓ (T4). §5 „Daumen" ✓ (T6). §6 „Offene Fragen"-Tab, „Antwort verfassen" (vorbefüllt + verknüpft), „Verwerfen" (mit Bestätigung) ✓ (T7, T8). §6 Zählerkarte, „nur bei > 0", href auf `/federal/faq` ✓ (T9). §4 Autorisierung: `createSubmission`/`upsertFeedback` ungated bis auf Anmeldung ✓ (T2); `discardSubmission`/Beantworten federal-board-only ✓ (T3, wiederverwendet `assertFederal` aus PR 3). Kein E-Mail-Versand ✓ (nirgends implementiert, explizit in Constraints benannt).
- Nicht in diesem PR (laut Spec-Schnitt §9 explizit PR 5): Hilfe-Panel, Kontext-Register-Erweiterung um Routen-Matching, `<FaqHinweis>`, kontextbezogene Einreichung (der `context` bleibt bei jeder Einreichung aus diesem PR `null`, da es noch keinen Aufrufort mit Routen-Kontext gibt).
- Platzhalter: keine offenen; der E2E-Helfer `grantFederalBoard` verweist explizit auf PR 3s Fundort-Anweisung.
- Typkonsistenz: `SubmissionView` identisch in T1 (Definition), T7 (`SubmissionsPanel`-Props), T8 (`toSubmissionView`-Aufruf); `ActionResult`-Form (`{ok:true}|{ok:false,error}`) identisch in T2 (neu) und T3 (PR-3-Wiederverwendung — PR 3s `ActionResult` hat zusätzlich ein optionales `id`, kompatibel als strukturelles Supertype, da T2 die eigene, engere Variante nur lokal in den beiden neuen Dateien verwendet und nicht mit PR 3s Typ vermischt).
- Abhängigkeit: Plan setzt PR-1/2/3-Merge voraus (Global Constraints, Satz 1); `FaqEntryDialog`/`FaqAdminBoard`/`actions.ts` aus PR 3 werden erweitert, nicht dupliziert.
