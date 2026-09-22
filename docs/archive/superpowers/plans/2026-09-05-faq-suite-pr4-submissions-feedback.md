# FAQ-Suite v2 — PR 4: Einreichungen + Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can submit a question from `/faq` and rate any entry with a thumb; the federal board triages those submissions in a new "Offene Fragen" tab, answers them into a linked draft entry, or discards them.

**Architecture:** Purely app-layer. `modules/faq` already exports every service this PR needs (`createSubmission`, `listSubmissions`, `openSubmissionCount`, `discardSubmission`, `upsertFeedback`, `feedbackCounts`) and `createEntry`/`publishEntry` already handle the `submissionId` link and the `open → answered` transition — PR 1 shipped and tested all of it. This PR adds two member-facing Server Actions under `apps/web/app/faq/`, one board-facing action, the submissions tab in the existing `FaqAdminBoard`, and the counter card on the federal overview. Every write authorizes at the app layer (Events lesson, ADR-recorded in `docs/decisions/`): federal-board for board writes, signed-in-member for the two member writes.

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions), React 18 client components, `@bdas/faq`, `@bdas/members`, `@bdas/design-system` (`Dialog`, `Alert`, `Input`, `Field`), Tailwind via `@bdas/design-system` tokens, vitest (node environment, `renderToStaticMarkup` for component output), Playwright for e2e.

**Spec:** [`docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md`](../specs/2026-09-04-faq-suite-v2-design.md) — §3 (`faq_submissions`, `faq_feedback`), §4 (authorization split), §5 (submit button + no-results CTA + thumbs), §6 (board tab, answer flow, counter card), §9 (PR 4 scope), §10 (tests).

**Predecessors:** PR 1 (`2026-09-04-faq-suite-pr1-module.md`), PR 2 (`2026-09-04-faq-suite-pr2-read-experience.md`), PR 3 (`2026-09-04-faq-suite-pr3-board.md`) — all merged to `main`.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Feature flag:** everything added here is behind `faq_suite`. `/faq` already falls back to `StaticFaq` when the flag is off (`apps/web/app/faq/page.tsx:62`); nothing this PR adds may render on that fallback path.
- **Authorization is the app layer's job.** `modules/faq` services are auth-agnostic (Spec §4). Board writes call `assertFederal()` in `apps/web/app/(board)/federal/faq/actions.ts`. The two member writes (`createSubmission`, `upsertFeedback`) require only a signed-in user — and `upsertFeedback` MUST pass the caller's own `me.user.id`, never a client-supplied user id.
- **No cross-module deep imports.** Import from `@bdas/faq` and `@bdas/members` only; never `@bdas/faq/src/...`. CI failure, not a nit (CLAUDE.md §4).
- **Design tokens only.** No inline hex, radius, shadow or duration. Use the existing token classes already in these files: `rounded-bdas` (12px), `rounded-bdas-sm` (6px), `rounded-bdas-pill`, `bg-bdas-red`, `text-bdas-surface`, `border-bdas-soft`, `text-bdas-ink` / `text-bdas-ink-body` / `text-bdas-ink-muted`, `bg-bdas-surface`, `bg-bdas-surface-hover`, `bg-bdas-overlay-hover`, `shadow-bdas-card`, `duration-bdas-quick`, `ease-bdas`. If a value is missing, raise it — do not invent one (CLAUDE.md §7).
- **All editing happens in a modal** (Spec §6): answering, editing, and the discard confirmation open the shared `Dialog` primitive from `@bdas/design-system`; the page behind stays put.
- **UI copy is German**, matching the strings already in `FaqAdminBoard.tsx` and `FaqExplorer.tsx`.
- **Tests ship in this PR** (CLAUDE.md §4). Pure helpers get vitest tests; interactive flows get Playwright coverage in `e2e/faq.e2e.ts`. The web app's vitest environment is `node` with no DOM testing library — component assertions use `renderToStaticMarkup` (see `apps/web/app/faq/highlight.test.tsx`), and anything needing a real browser goes to e2e.
- **`/review` and `/security-review` are required on this PR** (Spec §9 — PR 3–5 touch permissions).
- **Strengthen the tests below on sight.** Every task in PRs 1–3 found plan-supplied tests that would have passed against a wrong implementation. The snippets here are a floor, not a ceiling: the spec is the authority. If a test would still pass with the behaviour it is meant to pin removed, fix the test before writing the implementation.

### Known spec limitation — read this before Task 2

`modules/faq` deliberately exports **aggregate feedback only** (`feedbackCounts`); Spec §3 states "nur Aggregate verlassen das Modul", so there is **no service that reads back a member's own vote**. Consequence: the thumbs on `/faq` show a pressed state only for the duration of the page session. After a reload, an entry the member already rated renders unpressed (clicking again is harmless — the composite primary key upserts).

Implement it that way; do **not** add a `myFeedback` read service to satisfy the UI. `myFeedback` is not in the §4 service list, and widening what leaves the module is a product decision for the federation, not for this PR (CLAUDE.md §5). **Raise it in the PR description** so the reviewer can decide whether a follow-up spec change is wanted.

---

## File Structure

**Created**

| File                                                       | Responsibility                                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/faq/actions.ts`                              | The two member-facing Server Actions: `submitQuestionAction`, `voteEntryAction`. Signed-in gate only.                                     |
| `apps/web/app/faq/SubmitQuestionDialog.tsx`                | Client. Question + optional details form in a `Dialog`, with a confirmation state. Reused by PR 5's help panel — keep the `context` prop. |
| `apps/web/app/faq/FeedbackButtons.tsx`                     | Client. 👍/👎 pair for one entry, own-vote state held locally.                                                                            |
| `apps/web/app/(board)/federal/faq/submission-view.ts`      | Pure. Maps `FaqSubmission[]` + a user-id→name map into render-ready card view models.                                                     |
| `apps/web/app/(board)/federal/faq/submission-view.test.ts` | Unit tests for the above.                                                                                                                 |
| `apps/web/app/(board)/federal/faq/SubmissionsPanel.tsx`    | Client. The "Offene Fragen" tab body: cards + "Antwort verfassen" / "Verwerfen".                                                          |

**Modified**

| File                                                 | Change                                                                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/faq/FaqExplorer.tsx`                   | Persistent "Frage einreichen" button above the search field; the no-results CTA opens the same dialog with the query prefilled (replaces the `{/* PR 4: Submission-Dialog */}` marker at line 185). |
| `apps/web/app/faq/FaqEntryCard.tsx`                  | `<FeedbackButtons>` in the open-entry footer.                                                                                                                                                       |
| `apps/web/app/(board)/federal/faq/actions.ts`        | Add `discardSubmissionAction`.                                                                                                                                                                      |
| `apps/web/app/(board)/federal/faq/page.tsx`          | Load open submissions + submitter names, pass to the board.                                                                                                                                         |
| `apps/web/app/(board)/federal/faq/FaqAdminBoard.tsx` | Two tabs; "Antwort verfassen" opens the existing `FaqEntryDialog` prefilled and linked.                                                                                                             |
| `apps/web/app/(board)/federal/overview/page.tsx`     | "Offene FAQ-Fragen" counter card, only when > 0.                                                                                                                                                    |
| `e2e/faq.e2e.ts`                                     | Submission, feedback, answer-loop, discard and counter coverage.                                                                                                                                    |

**Untouched on purpose:** `modules/faq/**` (every service needed already exists and is integration-tested), `apps/web/lib/faq/**`, `FaqEntryDialog.tsx` (its `submissionId` prop already threads through to `saveEntryAction`).

---

### Task 1: Member submits a question

**Files:**

- Create: `apps/web/app/faq/actions.ts`
- Create: `apps/web/app/faq/SubmitQuestionDialog.tsx`
- Modify: `apps/web/app/faq/FaqExplorer.tsx` (imports; button above the search field; no-results CTA at lines 179–186)
- Test: `e2e/faq.e2e.ts`

**Interfaces:**

- Consumes: `createSubmission(db, { question, details?, context?, submittedBy })` from `@bdas/faq`; `getCurrentMember(db, session)` from `@bdas/members`; `readSessionCookie()` from `apps/web/lib/auth-cookie`; `Dialog`, `Alert`, `Input`, `Field` from `@bdas/design-system`.
- Produces:
  - `submitQuestionAction(input: { question: string; details?: string; context?: string }): Promise<FaqActionResult>` where `type FaqActionResult = { ok: true } | { ok: false; error: string }`.
  - `<SubmitQuestionDialog open onClose initialQuestion context />` — `initialQuestion: string` (may be `""`), `context: string | null`. **PR 5 mounts this same component with a route context key**, so neither prop may be dropped.

- [ ] **Step 1: Write the member-facing actions file**

Create `apps/web/app/faq/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { createSubmission, upsertFeedback } from "@bdas/faq";
import { getCurrentMember, type CurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";

export type FaqActionResult = { ok: true } | { ok: false; error: string };

/**
 * The two writes Spec §4 opens to every signed-in member. Unlike the board
 * actions in (board)/federal/faq/actions.ts there is no role check — but the
 * actor id always comes from the session, never from the caller's payload.
 */
async function requireSignedIn(): Promise<CurrentMember> {
  requireFlag("faq_suite");
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) throw new Error("UNAUTHENTICATED");
  return me;
}

function errorResult(err: unknown): FaqActionResult {
  if (err instanceof Error && err.message === "UNAUTHENTICATED") {
    return { ok: false, error: "Bitte melde dich an." };
  }
  if (isAppError(err)) return { ok: false, error: err.message };
  throw err;
}

export async function submitQuestionAction(input: {
  question: string;
  details?: string;
  context?: string;
}): Promise<FaqActionResult> {
  try {
    const me = await requireSignedIn();
    await createSubmission(getDb(), {
      question: input.question,
      ...(input.details ? { details: input.details } : {}),
      ...(input.context ? { context: input.context } : {}),
      submittedBy: me.user.id,
    });
    // The board's triage queue and its overview counter both read open
    // submissions server-side; neither is on this member's own route.
    revalidatePath("/federal/faq");
    revalidatePath("/federal/overview");
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function voteEntryAction(entryId: string, helpful: boolean): Promise<FaqActionResult> {
  try {
    const me = await requireSignedIn();
    // userId is the session's, never the client's — one vote per member per
    // entry, and no member can write another's row (Spec §4).
    await upsertFeedback(getDb(), { entryId, userId: me.user.id, helpful });
    revalidatePath("/federal/faq");
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}
```

- [ ] **Step 2: Write the submit dialog**

Create `apps/web/app/faq/SubmitQuestionDialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { Alert, Dialog, Field, Input } from "@bdas/design-system";

import { submitQuestionAction } from "./actions";

/**
 * Question + optional details, then a confirmation state (Spec §5). PR 5's
 * help panel mounts this same dialog with `context` set to the matched route
 * key, which is how a submission records the page it came from.
 */
export function SubmitQuestionDialog({
  open,
  onClose,
  initialQuestion,
  context,
}: {
  open: boolean;
  onClose: () => void;
  initialQuestion: string;
  context: string | null;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    setSent(false);
    setError(null);
    setDetails("");
    onClose();
  }

  function submit() {
    start(async () => {
      setError(null);
      const res = await submitQuestionAction({
        question,
        ...(details.trim() ? { details } : {}),
        ...(context ? { context } : {}),
      });
      if (res.ok) setSent(true);
      else setError(res.error);
    });
  }

  return (
    <Dialog open={open} onClose={close} title="Frage einreichen">
      {sent ? (
        <div className="flex flex-col gap-4">
          <p className="text-bdas-ink-body">
            Danke! Deine Frage liegt jetzt beim Bundesvorstand. Sobald sie beantwortet ist,
            erscheint sie hier im FAQ.
          </p>
          <button
            type="button"
            onClick={close}
            className="self-start rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface"
          >
            Schließen
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}
          <Field label="Deine Frage" htmlFor="faq-submit-question">
            <Input
              id="faq-submit-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Was möchtest du wissen?"
            />
          </Field>
          <Field label="Details (optional)" htmlFor="faq-submit-details">
            <textarea
              id="faq-submit-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              className="rounded-bdas border border-bdas-soft px-3 py-2 text-bdas-ink-body"
            />
          </Field>
          <button
            type="button"
            disabled={pending || question.trim() === ""}
            onClick={submit}
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

- [ ] **Step 3: Mount it in the explorer**

In `apps/web/app/faq/FaqExplorer.tsx`, add the import beside the existing ones:

```tsx
import { SubmitQuestionDialog } from "./SubmitQuestionDialog";
```

Add state next to the existing `useState` calls (after `const [hashTarget, setHashTarget] = useState<string | null>(null);`):

```tsx
// `null` = closed. A string is the question the dialog opens prefilled with,
// so the no-results CTA can hand over whatever the member just searched for.
const [submitPrefill, setSubmitPrefill] = useState<string | null>(null);
```

Replace the search-field wrapper (the `<div className="mb-8">` block starting at line 134) so the button sits beside the search input:

```tsx
<div className="mb-8">
  <div className="flex flex-wrap items-center gap-3">
    <div className="min-w-[16rem] flex-1">
      <Input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Suche"
        aria-label='FAQ durchsuchen ("/" drücken zum Fokussieren)'
      />
    </div>
    <button
      type="button"
      onClick={() => setSubmitPrefill("")}
      className="rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface"
    >
      Frage einreichen
    </button>
  </div>
  <div
    role="group"
    aria-label="Nach Thema filtern"
    className="mt-3 flex gap-2 overflow-x-auto lg:hidden"
  >
    {chips}
  </div>
</div>
```

Replace the no-results block (lines 179–186, the one holding the `{/* PR 4: Submission-Dialog */}` marker) with:

```tsx
<div className="rounded-bdas border border-bdas-soft bg-bdas-surface p-8 text-center">
  <p className="text-lg font-semibold text-bdas-ink">Keine Antwort gefunden.</p>
  <p className="mt-2 text-bdas-ink-muted">
    Stell deine Frage über „Frage einreichen“ — wir beantworten sie dann hier.
  </p>
  <button
    type="button"
    onClick={() => setSubmitPrefill(query.trim())}
    className="mt-4 rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface"
  >
    Frage einreichen
  </button>
</div>
```

Finally, render the dialog just before the component's closing `</div>` (after the `lg:grid` block):

```tsx
{
  submitPrefill !== null && (
    <SubmitQuestionDialog
      // Remount per prefill so a second open (e.g. from the no-results CTA
      // with a different query) resets the form's initial state.
      key={submitPrefill}
      open
      onClose={() => setSubmitPrefill(null)}
      initialQuestion={submitPrefill}
      context={null}
    />
  );
}
```

- [ ] **Step 4: Write the failing e2e test**

Append to `e2e/faq.e2e.ts`:

```ts
test.describe("Einreichungen", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("a member submits a question and sees the confirmation", async ({ page }) => {
    const email = "faq-einreicher@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Einreicher" });

    await page.goto("/faq");
    await page.getByRole("button", { name: "Frage einreichen" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Deine Frage").fill(`E2E-Einreichung ${uniqueSlug("q")}?`);
    await dialog.getByRole("button", { name: "Absenden" }).click();

    await expect(dialog.getByText("Danke!", { exact: false })).toBeVisible();
  });

  test("no search hit offers the query as a prefilled submission", async ({ page }) => {
    const email = "faq-nohit@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Nohit" });

    await page.goto("/faq");
    await page.getByPlaceholder("Suche").fill("zzzz-gibt-es-nicht-zzzz");
    await expect(page.getByText("Keine Antwort gefunden.")).toBeVisible();

    await page.getByRole("button", { name: "Frage einreichen" }).last().click();
    await expect(page.getByRole("dialog").getByLabel("Deine Frage")).toHaveValue(
      "zzzz-gibt-es-nicht-zzzz",
    );
  });
});
```

- [ ] **Step 5: Run the e2e test to verify it fails**

Run: `pnpm e2e e2e/faq.e2e.ts -g "Einreichungen"`
Expected (before Steps 1–3 are applied): FAIL — no "Frage einreichen" button on the page.
Expected (after Steps 1–3): PASS.

If the app is not already running, build and start it first as the config documents: `pnpm db:up && pnpm db:migrate && pnpm --filter @bdas/web build`, with `BDAS_FLAG_FAQ_SUITE=true` set for the server.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/faq/actions.ts apps/web/app/faq/SubmitQuestionDialog.tsx apps/web/app/faq/FaqExplorer.tsx e2e/faq.e2e.ts
git commit -m "feat(faq): members submit questions from /faq"
```

---

### Task 2: Thumbs on an entry

**Files:**

- Create: `apps/web/app/faq/FeedbackButtons.tsx`
- Modify: `apps/web/app/faq/FaqEntryCard.tsx` (footer, lines 65–93)
- Test: `e2e/faq.e2e.ts`

**Interfaces:**

- Consumes: `voteEntryAction(entryId: string, helpful: boolean): Promise<FaqActionResult>` from Task 1.
- Produces: `<FeedbackButtons entryId={string} />`.

Re-read the **Known spec limitation** note above before starting: the pressed state is session-local by design.

- [ ] **Step 1: Write the feedback buttons**

Create `apps/web/app/faq/FeedbackButtons.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { voteEntryAction } from "./actions";

/**
 * One vote per member per entry, changeable (Spec §3). The module exports
 * aggregates only (`feedbackCounts`) and no per-user read, so the pressed
 * state here is deliberately session-local: after a reload both thumbs render
 * unpressed. Voting again simply upserts the same row.
 */
export function FeedbackButtons({ entryId }: { entryId: string }) {
  const [vote, setVote] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  function cast(helpful: boolean) {
    const previous = vote;
    setVote(helpful);
    setFailed(false);
    start(async () => {
      const res = await voteEntryAction(entryId, helpful);
      if (!res.ok) {
        setVote(previous);
        setFailed(true);
      }
    });
  }

  const base =
    "rounded-bdas-sm border px-2 py-0.5 font-semibold transition-colors duration-bdas-quick ease-bdas disabled:opacity-40";
  const on = "border-bdas-red text-bdas-red";
  const off = "border-bdas-soft text-bdas-ink-muted hover:bg-bdas-overlay-hover";

  return (
    <span className="flex items-center gap-1.5">
      <span>War das hilfreich?</span>
      <button
        type="button"
        disabled={pending}
        aria-pressed={vote === true}
        aria-label="Hilfreich"
        onClick={() => cast(true)}
        className={`${base} ${vote === true ? on : off}`}
      >
        👍
      </button>
      <button
        type="button"
        disabled={pending}
        aria-pressed={vote === false}
        aria-label="Nicht hilfreich"
        onClick={() => cast(false)}
        className={`${base} ${vote === false ? on : off}`}
      >
        👎
      </button>
      {failed && <span className="text-bdas-red">Konnte nicht gespeichert werden.</span>}
    </span>
  );
}
```

- [ ] **Step 2: Render it in the entry footer**

In `apps/web/app/faq/FaqEntryCard.tsx`, add the import:

```tsx
import { FeedbackButtons } from "./FeedbackButtons";
```

Insert `<FeedbackButtons entryId={entry.id} />` inside the `<footer>` as the last child, after the `relatedQuestions` block and before `</footer>`:

```tsx
<FeedbackButtons entryId={entry.id} />
```

- [ ] **Step 3: Write the failing e2e test**

Append inside the existing `test.describe("Einreichungen", ...)` block in `e2e/faq.e2e.ts`:

```ts
test("a member rates an entry and the thumb stays pressed", async ({ page }) => {
  const email = "faq-daumen@e2e.bdas.test";
  await deleteUserByEmail(email);
  await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Daumen" });

  await page.goto("/faq");
  // A plain member's primary section is open by default (order.ts), so the
  // first entry's footer — and its thumbs — are already in the DOM.
  const thumbUp = page.getByRole("button", { name: "Hilfreich", exact: true }).first();
  await thumbUp.click();
  await expect(thumbUp).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 4: Run the e2e test**

Run: `pnpm e2e e2e/faq.e2e.ts -g "rates an entry"`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/faq/FeedbackButtons.tsx apps/web/app/faq/FaqEntryCard.tsx e2e/faq.e2e.ts
git commit -m "feat(faq): thumbs up/down on FAQ entries"
```

---

### Task 3: Board tab with the open-submission cards

**Files:**

- Create: `apps/web/app/(board)/federal/faq/submission-view.ts`
- Create: `apps/web/app/(board)/federal/faq/submission-view.test.ts`
- Create: `apps/web/app/(board)/federal/faq/SubmissionsPanel.tsx`
- Modify: `apps/web/app/(board)/federal/faq/page.tsx`
- Modify: `apps/web/app/(board)/federal/faq/FaqAdminBoard.tsx`
- Test: `apps/web/app/(board)/federal/faq/submission-view.test.ts`, `e2e/faq.e2e.ts`

**Interfaces:**

- Consumes: `listSubmissions(db, { status: "open" })` and the `FaqSubmission` type from `@bdas/faq`; `getMemberByUserId(db, userId)` from `@bdas/members`; `FAQ_CONTEXTS` from `apps/web/lib/faq/contexts`.
- Produces:
  - `type SubmissionCardView = { id: string; question: string; details: string | null; contextLabel: string | null; submitterName: string; submittedAtIso: string }`
  - `toSubmissionCards(input: { submissions: readonly FaqSubmission[]; namesByUserId: ReadonlyMap<string, string> }): SubmissionCardView[]`
  - `<SubmissionsPanel submissions onAnswer onDiscard pending />` where `onAnswer: (card: SubmissionCardView) => void` and `onDiscard: (card: SubmissionCardView) => void`. Tasks 4 and 5 supply those two callbacks.

- [ ] **Step 1: Write the failing unit test**

Create `apps/web/app/(board)/federal/faq/submission-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { FaqSubmission } from "@bdas/faq";

import { toSubmissionCards } from "./submission-view";

function submission(over: Partial<FaqSubmission> = {}): FaqSubmission {
  return {
    id: "s1",
    question: "Wie lege ich ein Event an?",
    details: null,
    context: null,
    submittedBy: "u1",
    status: "open",
    entryId: null,
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    ...over,
  };
}

describe("toSubmissionCards", () => {
  it("resolves the submitter's name", () => {
    const [card] = toSubmissionCards({
      submissions: [submission()],
      namesByUserId: new Map([["u1", "Ayşe Yılmaz"]]),
    });
    expect(card!.submitterName).toBe("Ayşe Yılmaz");
    expect(card!.submittedAtIso).toBe("2026-09-01T10:00:00.000Z");
  });

  it("falls back when the submitter has no member row", () => {
    const [card] = toSubmissionCards({
      submissions: [submission()],
      namesByUserId: new Map(),
    });
    expect(card!.submitterName).toBe("Unbekanntes Mitglied");
  });

  it("labels a known context key and passes an unknown one through", () => {
    const [known, unknown] = toSubmissionCards({
      submissions: [
        submission({ id: "s1", context: "dateien" }),
        submission({ id: "s2", context: "veraltet.schluessel" }),
      ],
      namesByUserId: new Map(),
    });
    expect(known!.contextLabel).toBe("Dateien");
    expect(unknown!.contextLabel).toBe("veraltet.schluessel");
  });

  it("leaves contextLabel null when the submission has no context", () => {
    const [card] = toSubmissionCards({ submissions: [submission()], namesByUserId: new Map() });
    expect(card!.contextLabel).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/app/\(board\)/federal/faq/submission-view.test.ts`
Expected: FAIL — cannot resolve `./submission-view`.

- [ ] **Step 3: Write the view mapper**

Create `apps/web/app/(board)/federal/faq/submission-view.ts`:

```ts
import type { FaqSubmission } from "@bdas/faq";

import { FAQ_CONTEXTS } from "../../../../lib/faq/contexts";

export type SubmissionCardView = {
  id: string;
  question: string;
  details: string | null;
  contextLabel: string | null;
  submitterName: string;
  submittedAtIso: string;
};

/**
 * A context key that is no longer in the registry still renders — as its raw
 * key. The module stores strings and the registry is code (Spec §3), so a key
 * can outlive an entry in FAQ_CONTEXTS; swallowing it would hide where the
 * question came from.
 */
function labelFor(context: string | null): string | null {
  if (context === null) return null;
  return FAQ_CONTEXTS.find((c) => c.key === context)?.label ?? context;
}

export function toSubmissionCards(input: {
  submissions: readonly FaqSubmission[];
  namesByUserId: ReadonlyMap<string, string>;
}): SubmissionCardView[] {
  return input.submissions.map((s) => ({
    id: s.id,
    question: s.question,
    details: s.details,
    contextLabel: labelFor(s.context),
    submitterName: input.namesByUserId.get(s.submittedBy) ?? "Unbekanntes Mitglied",
    submittedAtIso: s.createdAt.toISOString(),
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/web/app/\(board\)/federal/faq/submission-view.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the submissions panel**

Create `apps/web/app/(board)/federal/faq/SubmissionsPanel.tsx`:

```tsx
"use client";

import type { SubmissionCardView } from "./submission-view";

export function SubmissionsPanel({
  submissions,
  onAnswer,
  onDiscard,
  pending,
}: {
  submissions: readonly SubmissionCardView[];
  onAnswer: (card: SubmissionCardView) => void;
  onDiscard: (card: SubmissionCardView) => void;
  pending: boolean;
}) {
  if (submissions.length === 0) {
    return <p className="text-sm text-bdas-ink-muted">Keine offenen Fragen.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {submissions.map((s) => (
        <article
          key={s.id}
          className="rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card"
        >
          <h3 className="text-sm font-bold text-bdas-ink">{s.question}</h3>
          {s.details && <p className="mt-2 text-sm text-bdas-ink-body">{s.details}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-bdas-ink-muted">
            <span>{s.submitterName}</span>
            <span>
              {new Date(s.submittedAtIso).toLocaleDateString("de-DE", {
                timeZone: "Europe/Berlin",
              })}
            </span>
            {s.contextLabel && (
              <span className="rounded-bdas-pill border border-bdas-soft px-2 py-0.5 font-semibold">
                {s.contextLabel}
              </span>
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => onAnswer(s)}
              className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-xs font-semibold text-bdas-surface disabled:opacity-40"
            >
              Antwort verfassen
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onDiscard(s)}
              className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-xs text-bdas-ink-body hover:bg-bdas-overlay-hover disabled:opacity-40"
            >
              Verwerfen
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Load submissions on the board page**

Replace the body of `apps/web/app/(board)/federal/faq/page.tsx` with:

```tsx
import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { feedbackCounts, listEntries, listSubmissions, listTopics } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";
import { getMemberByUserId } from "@bdas/members";

import { requireFederalScope } from "../../../_dashboard/session";
import { FaqAdminBoard } from "./FaqAdminBoard";
import { toSubmissionCards } from "./submission-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "FAQ" };

export default async function FederalFaqPage() {
  if (!isFlagOn("faq_suite")) notFound();
  await requireFederalScope();

  const db = getDb();
  const [entries, topics, submissions] = await Promise.all([
    listEntries(db),
    listTopics(db),
    listSubmissions(db, { status: "open" }),
  ]);
  const counts = await feedbackCounts(
    db,
    entries.map((e) => e.id),
  );
  const feedbackByEntry = Object.fromEntries(counts);

  // One lookup per open submission. `@bdas/members` exposes no id-set query
  // (MemberQuery is groupId/status/search only) and the open queue is the
  // board's triage backlog — a bounded handful — so this stays cheaper than
  // pulling the whole member table to resolve a few names. Revisit if the
  // queue is ever allowed to grow unbounded.
  const submitterIds = [...new Set(submissions.map((s) => s.submittedBy))];
  const members = await Promise.all(submitterIds.map((id) => getMemberByUserId(db, id)));
  const namesByUserId = new Map(
    members.flatMap((m, i) =>
      m ? [[submitterIds[i]!, `${m.firstName} ${m.lastName}`] as const] : [],
    ),
  );

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">FAQ</h1>
      <FaqAdminBoard
        entries={entries}
        topics={topics}
        feedbackByEntry={feedbackByEntry}
        submissions={toSubmissionCards({ submissions, namesByUserId })}
      />
    </section>
  );
}
```

- [ ] **Step 7: Add the tabs to the board**

In `apps/web/app/(board)/federal/faq/FaqAdminBoard.tsx`, add imports:

```tsx
import { SubmissionsPanel } from "./SubmissionsPanel";
import type { SubmissionCardView } from "./submission-view";
```

Extend the props to accept `submissions: readonly SubmissionCardView[]`, and add tab state beside the existing `useState` calls:

```tsx
const [tab, setTab] = useState<"entries" | "submissions">("entries");
```

Insert the tab bar as the first child of the outermost `<div className="flex flex-col gap-6">`, before the `TopicsPanel` row:

```tsx
<div role="tablist" aria-label="FAQ-Verwaltung" className="flex gap-2">
  {(
    [
      ["entries", "Fragen & Antworten"],
      ["submissions", `Offene Fragen${submissions.length > 0 ? ` (${submissions.length})` : ""}`],
    ] as const
  ).map(([key, label]) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={
        tab === key
          ? "rounded-bdas-sm border border-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-red"
          : "rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm text-bdas-ink-body hover:bg-bdas-overlay-hover"
      }
    >
      {label}
    </button>
  ))}
</div>
```

Wrap the existing entry-management markup (the `TopicsPanel`/`+ Eintrag` row, the `groups.map(...)` blocks, and the empty-state `<p>`) in `{tab === "entries" && ( … )}`, and add the submissions branch after it:

```tsx
{
  tab === "submissions" && (
    <SubmissionsPanel
      submissions={submissions}
      onAnswer={() => {
        /* Task 4 */
      }}
      onDiscard={() => {
        /* Task 5 */
      }}
      pending={pending}
    />
  );
}
```

- [ ] **Step 8: Write the failing e2e test**

Append to the existing `test.describe("Board-Verwaltung /federal/faq", ...)` block in `e2e/faq.e2e.ts`:

```ts
test("the board sees an open submission in the Offene Fragen tab", async ({ page }) => {
  const question = `E2E-Frage-Board ${uniqueSlug("s")}?`;

  const memberEmail = "faq-board-einreicher@e2e.bdas.test";
  await deleteUserByEmail(memberEmail);
  await registerVerifyLogin(page, {
    email: memberEmail,
    firstName: "Faq",
    lastName: "Boardfrage",
  });
  await page.goto("/faq");
  await page.getByRole("button", { name: "Frage einreichen" }).first().click();
  await page.getByRole("dialog").getByLabel("Deine Frage").fill(question);
  await page.getByRole("dialog").getByRole("button", { name: "Absenden" }).click();
  await expect(page.getByRole("dialog").getByText("Danke!", { exact: false })).toBeVisible();
  await logout(page);

  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, {
    email: FEDERAL_EMAIL,
    firstName: "Bundes",
    lastName: "Vorstand",
  });
  await page.goto("/federal/faq");
  await page.getByRole("tab", { name: /Offene Fragen/ }).click();
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  await expect(page.getByText("Faq Boardfrage")).toBeVisible();
});
```

Extend the file's `./helpers/flows` import to include `logout`:

```ts
import { logout, registerVerifyLogin } from "./helpers/flows";
```

- [ ] **Step 9: Run the tests**

Run: `pnpm vitest run apps/web/app/\(board\)/federal/faq/submission-view.test.ts && pnpm e2e e2e/faq.e2e.ts -g "Offene Fragen tab"`
Expected: both PASS.

- [ ] **Step 10: Typecheck, lint and commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add "apps/web/app/(board)/federal/faq" e2e/faq.e2e.ts
git commit -m "feat(faq): open-submissions tab on the federal board"
```

---

### Task 4: Answer a submission into a linked draft

**Files:**

- Modify: `apps/web/app/(board)/federal/faq/FaqAdminBoard.tsx` (the `onAnswer` stub from Task 3)
- Test: `e2e/faq.e2e.ts`

**Interfaces:**

- Consumes: `FaqEntryDialogInitial` (already carries the optional `submissionId` field) and `<FaqEntryDialog>` from `./FaqEntryDialog`; `SubmissionCardView` from `./submission-view`; `saveEntryAction` already forwards `submissionId` to `createEntry` (see `actions.ts:75-79`).
- Produces: nothing new — this task wires existing pieces together.

No module or action change is needed: `createEntry` links the submission (`entries.ts:201-210`) and `publishEntry` flips it to `answered` (`entries.ts:299-302`). Both are integration-tested in PR 1.

- [ ] **Step 1: Wire the answer callback**

In `apps/web/app/(board)/federal/faq/FaqAdminBoard.tsx`, replace the `onAnswer` stub:

```tsx
          onAnswer={(card) =>
            setDialog({
              initial: {
                ...EMPTY_ENTRY,
                question: card.question,
                // Links the draft to the submission; publishing it flips the
                // submission to `answered` inside publishEntry's transaction.
                submissionId: card.id,
              },
              currentStatus: null,
            })
          }
```

- [ ] **Step 2: Write the failing e2e test**

Append to `test.describe("Board-Verwaltung /federal/faq", ...)` in `e2e/faq.e2e.ts`:

```ts
test("the board answers a submission and it leaves the open queue", async ({ page }) => {
  const question = `E2E-Antwortfrage ${uniqueSlug("a")}?`;

  const memberEmail = "faq-antwort-einreicher@e2e.bdas.test";
  await deleteUserByEmail(memberEmail);
  await registerVerifyLogin(page, { email: memberEmail, firstName: "Faq", lastName: "Antwort" });
  await page.goto("/faq");
  await page.getByRole("button", { name: "Frage einreichen" }).first().click();
  await page.getByRole("dialog").getByLabel("Deine Frage").fill(question);
  await page.getByRole("dialog").getByRole("button", { name: "Absenden" }).click();
  await expect(page.getByRole("dialog").getByText("Danke!", { exact: false })).toBeVisible();
  await logout(page);

  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, {
    email: FEDERAL_EMAIL,
    firstName: "Bundes",
    lastName: "Vorstand",
  });
  await page.goto("/federal/faq");
  await page.getByRole("tab", { name: /Offene Fragen/ }).click();

  const card = page.getByRole("article").filter({ hasText: question });
  await card.getByRole("button", { name: "Antwort verfassen" }).click();

  const dialog = page.getByRole("dialog");
  // The entry form opens prefilled with the submitted question.
  await expect(dialog.getByPlaceholder("Frage")).toHaveValue(question);
  await dialog.getByRole("button", { name: "Veröffentlichen" }).click();

  // Publishing the linked draft answers the submission: the open tab empties.
  await page.goto("/federal/faq");
  await page.getByRole("tab", { name: /Offene Fragen/ }).click();
  await expect(page.getByRole("article").filter({ hasText: question })).toHaveCount(0);

  // …and the answer is live on /faq.
  await page.goto("/faq");
  await page.getByPlaceholder("Suche").fill(question);
  await expect(page.locator("mark").first()).toBeVisible();
});
```

- [ ] **Step 3: Run the e2e test**

Run: `pnpm e2e e2e/faq.e2e.ts -g "answers a submission"`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint and commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add "apps/web/app/(board)/federal/faq/FaqAdminBoard.tsx" e2e/faq.e2e.ts
git commit -m "feat(faq): answer a submission into a linked draft entry"
```

---

### Task 5: Discard a submission

**Files:**

- Modify: `apps/web/app/(board)/federal/faq/actions.ts`
- Modify: `apps/web/app/(board)/federal/faq/FaqAdminBoard.tsx` (the `onDiscard` stub from Task 3)
- Test: `e2e/faq.e2e.ts`

**Interfaces:**

- Consumes: `discardSubmission(db, { id, decidedBy })` from `@bdas/faq`; the existing `assertFederal()`, `revalidateFaq()`, `errorResult()` helpers and the `ActionResult` type in `actions.ts`.
- Produces: `discardSubmissionAction(id: string): Promise<ActionResult>`.

Spec §6 requires the discard confirmation to be a modal, not `window.confirm`, so this uses the `Dialog` primitive.

- [ ] **Step 1: Add the action**

Append to `apps/web/app/(board)/federal/faq/actions.ts`, and add `discardSubmission` to the existing `@bdas/faq` import list:

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

- [ ] **Step 2: Add the confirmation dialog**

In `apps/web/app/(board)/federal/faq/FaqAdminBoard.tsx`, add imports:

```tsx
import { Dialog } from "@bdas/design-system";
```

…and add `discardSubmissionAction` to the existing `./actions` import list. Add state beside the other `useState` calls:

```tsx
const [discarding, setDiscarding] = useState<SubmissionCardView | null>(null);
```

Replace the `onDiscard` stub with `onDiscard={(card) => setDiscarding(card)}`, then render the confirmation next to the existing `{dialog && …}` block:

```tsx
{
  discarding && (
    <Dialog open onClose={() => setDiscarding(null)} title="Frage verwerfen">
      <div className="flex flex-col gap-4">
        <p className="text-bdas-ink-body">
          „{discarding.question}“ wird verworfen und verschwindet aus der Liste. Das lässt sich
          nicht rückgängig machen.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const id = discarding.id;
              setDiscarding(null);
              start(async () => {
                const res = await discardSubmissionAction(id);
                if (!res.ok) setError(res.error);
              });
            }}
            className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface disabled:opacity-40"
          >
            Verwerfen
          </button>
          <button
            type="button"
            onClick={() => setDiscarding(null)}
            className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm text-bdas-ink-body hover:bg-bdas-overlay-hover"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write the failing e2e test**

Append to `test.describe("Board-Verwaltung /federal/faq", ...)` in `e2e/faq.e2e.ts`:

```ts
test("the board discards a submission after confirming", async ({ page }) => {
  const question = `E2E-Verwerfen ${uniqueSlug("v")}?`;

  const memberEmail = "faq-verwerf-einreicher@e2e.bdas.test";
  await deleteUserByEmail(memberEmail);
  await registerVerifyLogin(page, { email: memberEmail, firstName: "Faq", lastName: "Verwerf" });
  await page.goto("/faq");
  await page.getByRole("button", { name: "Frage einreichen" }).first().click();
  await page.getByRole("dialog").getByLabel("Deine Frage").fill(question);
  await page.getByRole("dialog").getByRole("button", { name: "Absenden" }).click();
  await expect(page.getByRole("dialog").getByText("Danke!", { exact: false })).toBeVisible();
  await logout(page);

  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, {
    email: FEDERAL_EMAIL,
    firstName: "Bundes",
    lastName: "Vorstand",
  });
  await page.goto("/federal/faq");
  await page.getByRole("tab", { name: /Offene Fragen/ }).click();

  await page
    .getByRole("article")
    .filter({ hasText: question })
    .getByRole("button", { name: "Verwerfen" })
    .click();
  // The confirmation is a modal (Spec §6), not window.confirm.
  await page.getByRole("dialog").getByRole("button", { name: "Verwerfen" }).click();

  await expect(page.getByRole("article").filter({ hasText: question })).toHaveCount(0);
});
```

- [ ] **Step 4: Run the e2e test**

Run: `pnpm e2e e2e/faq.e2e.ts -g "discards a submission"`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add "apps/web/app/(board)/federal/faq" e2e/faq.e2e.ts
git commit -m "feat(faq): discard an open submission with a modal confirmation"
```

---

### Task 6: "Offene FAQ-Fragen" on the federal overview

**Files:**

- Modify: `apps/web/app/(board)/federal/overview/page.tsx`
- Test: `e2e/faq.e2e.ts`

**Interfaces:**

- Consumes: `openSubmissionCount(db)` from `@bdas/faq`; `isFlagOn` from `@bdas/feature-flags`; the existing `ActionStrip` (`apps/web/app/(board)/_components/ActionStrip.tsx`) and its `ActionItem` type.
- Produces: nothing consumed elsewhere.

Spec §6 asks for the card **only when the count is > 0** — unlike "Freigaben", which `ActionStrip` renders calm-grey at zero. Build the items array conditionally rather than changing `ActionStrip`, which other pages share.

- [ ] **Step 1: Add the conditional counter**

In `apps/web/app/(board)/federal/overview/page.tsx`, add imports:

```tsx
import { openSubmissionCount } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";
```

…and the type import for the strip's items:

```tsx
import { ActionStrip, type ActionItem } from "../../_components/ActionStrip";
```

Fetch the count alongside the existing reads — guarded by the flag, so the page keeps working (and skips the query) while `faq_suite` is off:

```tsx
const faqOpen = isFlagOn("faq_suite") ? await openSubmissionCount(db) : 0;
```

Replace the `<ActionStrip …>` call:

```tsx
<ActionStrip
  items={
    [
      { count: counts.pending, label: "Freigaben", href: "/federal/members" },
      // Spec §6: this one appears only when there is work — unlike
      // "Freigaben", which renders calm at zero.
      ...(faqOpen > 0
        ? [{ count: faqOpen, label: "Offene FAQ-Fragen", href: "/federal/faq" }]
        : []),
    ] satisfies ActionItem[]
  }
/>
```

- [ ] **Step 2: Write the failing e2e test**

Append to `test.describe("Board-Verwaltung /federal/faq", ...)` in `e2e/faq.e2e.ts`:

```ts
test("an open submission surfaces on the federal overview", async ({ page }) => {
  const question = `E2E-Zaehler ${uniqueSlug("z")}?`;

  const memberEmail = "faq-zaehler-einreicher@e2e.bdas.test";
  await deleteUserByEmail(memberEmail);
  await registerVerifyLogin(page, { email: memberEmail, firstName: "Faq", lastName: "Zaehler" });
  await page.goto("/faq");
  await page.getByRole("button", { name: "Frage einreichen" }).first().click();
  await page.getByRole("dialog").getByLabel("Deine Frage").fill(question);
  await page.getByRole("dialog").getByRole("button", { name: "Absenden" }).click();
  await expect(page.getByRole("dialog").getByText("Danke!", { exact: false })).toBeVisible();
  await logout(page);

  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, {
    email: FEDERAL_EMAIL,
    firstName: "Bundes",
    lastName: "Vorstand",
  });
  await page.goto("/federal/overview");
  await expect(page.getByRole("link", { name: /Offene FAQ-Fragen/ })).toBeVisible();
});
```

- [ ] **Step 3: Run the e2e test**

Run: `pnpm e2e e2e/faq.e2e.ts -g "federal overview"`
Expected: PASS.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm e2e e2e/faq.e2e.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(board)/federal/overview/page.tsx" e2e/faq.e2e.ts
git commit -m "feat(faq): surface open FAQ questions on the federal overview"
```

---

## Definition of done

- [ ] A signed-in member can submit a question from `/faq` — from the persistent button and from the no-results CTA with the query prefilled — and sees a confirmation.
- [ ] A signed-in member can rate any open entry 👍/👎; a second click changes the vote.
- [ ] `/federal/faq` has two tabs; "Offene Fragen" shows question, details, submitter, date and origin context, and carries a count.
- [ ] "Antwort verfassen" opens the entry form prefilled and linked; publishing it moves the submission out of the open queue and the answer appears on `/faq`.
- [ ] "Verwerfen" asks for confirmation in a modal, then removes the card.
- [ ] `/federal/overview` shows "Offene FAQ-Fragen" only while the count is above zero.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm e2e e2e/faq.e2e.ts` all pass.
- [ ] PR description raises the **Known spec limitation** (own-vote state is session-local because the module exports aggregates only).
- [ ] `/review` and `/security-review` run on the PR (Spec §9).
