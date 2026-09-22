# Content-Seiten Layout-Erweiterung — PR4 (CTA-Banner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `CtaBanner` block to the Puck palette — a highlighted call to action (headline, text, one button) on either the brand accent or a neutral token surface.

**Architecture:** The smallest of the seven new blocks and a pure recombination of parts that already exist: the `Hero` shape (presentational component file + block wrapper that owns the editor placeholder), `buttonKlasse` for the button, `safeHref`/`isExternalHref` for the link. It gets its own `CtaBanner.tsx` so it stays directly testable, mirroring `Hero.tsx`; `puck-config.tsx` only wires fields to props. No `modules/content` schema, migration, or feature-flag change — block `props` are already opaque passthrough JSON.

**Tech Stack:** Next.js 14 App Router, `@puckeditor/core@0.23.0` (pinned), Tailwind CSS 3.4 via `core/design-system` tokens, Vitest (`renderToStaticMarkup`, node environment).

**Spec:** `docs/superpowers/specs/2026-09-08-content-pages-layout-erweiterung-design.md` (§6 CTA-Banner, §10 PR-Sequenzierung Nr. 4, §11 Tests). Reference: `docs/decisions/0036-puck-freeform-layout-and-block-expansion.md` (accent colour is granted to this block) and `docs/decisions/0038-page-titles-live-in-the-document.md` (heading levels in the document). Predecessors: PR1 (#203), PR2 (#206 + #210), PR3 (#212 + #214).

## Global Constraints

- No MUI/Emotion, no raw HTML block, no free-text CSS/styling prop (ADR 0023, unchanged). No `dangerouslySetInnerHTML`.
- Every class is a **literal string** — never an interpolated Tailwind class. The two surfaces are a record of complete class strings.
- Only `core/design-system` tokens (`bdas-*` utilities) — no ad-hoc hex, radius, shadow, or duration.
- **This is where brand red is legitimate.** ADR 0036 scopes the accent to this block: it is an active/CTA surface, not body text (CLAUDE.md §7). On the accent surface the text is `text-bdas-ink-on-brand` and the button uses `buttonKlasse("hell")`, exactly as `Hero` does for `hintergrund: "akzent"`.
- Documents saved before a prop existed must keep rendering byte-identically. The surface lookup is **total** over `undefined` and over unrecognised values (`Object.hasOwn` guard plus default), as in `heroFlaeche`.
- `BlockPlatzhalter` is editor-only — gate it on `puck?.isEditing`. `puck-config.test.ts` renders every registered block with `isEditing: false` and asserts nothing reaches a reader.
- **Do not touch the `exactly the seven intended blocks carry an Ausrichtung field` guard test.** The spec lists no alignment field for the CTA banner; it is centred by definition. If you find yourself editing that list, you have added a field the spec does not call for.
- The headline is an `<h2>`. Per ADR 0038 the page `<h1>` is a Hero or an `Überschrift (h1)`; a call to action is never the title of the page.
- `@puckeditor/core` stays pinned at `^0.23.0`. **No new runtime dependency** — `embla-carousel-react` belongs to PR5 alone (spec §8).
- Branch `feat/content-layout-pr4` off `origin/main`. Never branch off another feature's worktree (see the doubled ADR 0034 on `worktree-faq-suite-pr3`). Overlap with the open PR #215 is confined to the import block and the `Blocks` type in `puck-config.tsx`; rebase rather than merge if it lands first.

---

## Task 1: The `CtaBanner` presentational component

**Files:**

- Create: `apps/web/app/_content/CtaBanner.tsx`
- Create: `apps/web/app/_content/CtaBanner.test.tsx`

**Interfaces:**

- Consumes: `buttonKlasse` from `./button-klasse`, `isExternalHref`/`safeHref` from `./href`.
- Produces:

```ts
export type CtaFlaeche = "akzent" | "neutral";
export type CtaBannerProps = {
  ueberschrift: string;
  text: string;
  buttonLabel: string;
  buttonHref: string;
  flaeche: CtaFlaeche;
};
export function CtaBanner(props: CtaBannerProps): JSX.Element;
```

**Design decisions this task locks in** (spec §6 names the fields, not the layout):

- **Centred, one column, at every width.** A banner is a single statement; the two-column split a Hero can do would make it a second Hero.
- **`rounded-bdas` + `shadow-bdas-card-low`**, the same card-level lift `Hero` uses. No hover lift: the banner is not a card and the button inside it is the interactive element.
- **The button is optional but load-bearing.** A banner without a safe href renders its text and no button — never a dead button, matching `Hero`'s `href && label` rule.
- **`akzent` is the default surface.** A CTA that needs to be neutral is the exception; the default should look like the thing the spec asked for.
- Padding `p-8 sm:p-12`, matching `Hero`, so a banner directly under a hero reads as the same family.

- [ ] **Step 1: Write the failing tests**

`CtaBanner.test.tsx`, in the shape of `Hero.test.tsx` (`renderToStaticMarkup`, a `basis` props object, a `render(partial)` helper):

1. renders headline, text and button label on the accent surface: contains `bg-bdas-red`, `text-bdas-ink-on-brand`, the label, `<h2`.
2. neutral surface: contains `bg-bdas-overlay-soft` and `text-bdas-ink`, and **not** `text-bdas-ink-on-brand`.
3. unknown/absent `flaeche` falls back to the accent surface (total lookup).
4. a label without a safe href renders no `<a` at all; `javascript:` and `data:` hrefs are dropped (assert via `safeHref`'s behaviour, same cases as `Hero.test.tsx`).
5. an external href gets `target="_blank"` and `rel` containing `noopener`; an internal `/pfad` gets neither.
6. no `style=` attribute anywhere in the output (no CSS injection surface).

- [ ] **Step 2: Run them to verify they fail**

`pnpm --filter web vitest run app/_content/CtaBanner.test.tsx` — expect module-not-found, then real assertion failures once the file exists.

- [ ] **Step 3: Write the component**

`CtaBanner.tsx`. Start from `Hero.tsx`'s structure and strip what does not apply (no background image, no height presets, no alignment). `import React from "react"` — the Vitest config uses the classic JSX transform and the file will otherwise fail with "React is not defined".

- [ ] **Step 4: Run the tests to verify they pass**

`pnpm --filter web vitest run app/_content/CtaBanner.test.tsx` — all green.

- [ ] **Step 5: Commit**

`feat(content): CtaBanner block component`

---

## Task 2: Register the `CtaBanner` block

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx`
- Modify: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:** adds `CtaBanner` to the `Blocks` type and to `puckConfig.components`; passes props straight through.

- [ ] **Step 1: Write the failing tests**

In `puck-config.test.ts`:

1. default props render the accent banner through the component (contains `bg-bdas-red`).
2. a document with no `flaeche` (older save) still renders — the fallback surface, no crash.
3. empty block (no headline, no text, no usable button) renders `BlockPlatzhalter` when `isEditing: true` and **nothing** when `isEditing: false` — the rule #214 established for `Hero`, `Kennzahlen` and empty card bodies.
4. the block carries no `ausrichtung` field (the existing guard test already enumerates the seven that do — it must stay untouched and stay green).

- [ ] **Step 2: Run them to verify they fail**

`pnpm --filter web vitest run app/_content/puck-config.test.ts`

- [ ] **Step 3: Add the block to the `Blocks` type**

```ts
CtaBanner: {
  ueberschrift: string;
  text: string;
  buttonLabel: string;
  buttonHref: string;
  flaeche: CtaFlaeche;
}
```

- [ ] **Step 4: Register the component**

Label `CTA-Banner`. Fields: `ueberschrift` (text), `text` (textarea), `buttonLabel` (text), `buttonHref` (text, label `Button-Link (https://… oder /pfad)` — reuse `Hero`'s wording verbatim), `flaeche` (select: `Akzentfarbe` / `Neutrale Fläche`). `defaultProps`: headline `"Jetzt Mitglied werden"`, empty text, empty button, `flaeche: "akzent"`. Emptiness gate identical to `Hero`'s: a label without a safe href does not count as content.

- [ ] **Step 5: Run the tests to verify they pass**

`pnpm --filter web vitest run app/_content/puck-config.test.ts`

- [ ] **Step 6: Typecheck**

`pnpm typecheck` — note `exactOptionalPropertyTypes` is on; an optional prop needs `| undefined` in its type.

- [ ] **Step 7: Commit**

`feat(content): register the CtaBanner block`

---

## Task 3: Full gate, manual check, PR

**Files:** none changed unless a gate fails.

- [ ] **Step 1: Run the whole repo gate**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

All four PASS. If `format:check` flags this plan file, run `pnpm format` and commit the result.

- [ ] **Step 2: Production build**

`pnpm --filter web build` — PASS. This catches build errors, not a Tailwind class missing from the CSS; Step 3 is what confirms the surfaces actually paint.

- [ ] **Step 3: Manual check in the editor**

Confirm nothing else owns port 3000 first (`lsof -i :3000`) — another worktree's stale server serves an old build and any result is meaningless.

```bash
pnpm --filter web dev
```

In the `ueber-uns` editor: a banner on both surfaces; with and without a button; with a nonsense href (button must disappear, no dead link); the empty state (placeholder in the editor, nothing on the public page); the PR1 preview toggle; then save and compare the public page.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/content-layout-pr4
gh pr create --base main \
  --title "feat(content): freies Layout & neue Puck-Blöcke — PR4 (CTA-Banner)" \
  --body "…"
```

Body: what the block is, that the accent colour is used here by ADR 0036's explicit grant, the h2 heading level per ADR 0038, the emptiness gate, and that there is no new dependency, schema, migration or flag change.

- [ ] **Step 5: Review**

`/review` on the PR (CLAUDE.md §4). No `/security-review` — no auth, payments or files surface. Point the reviewer at the accent-surface contrast and the emptiness gate. **Do not merge while the review is still running** — the fix commit would land on a branch GitHub has already deleted (the trap from #212).

---

## Out of scope for this PR

Karussell plus `embla-carousel-react` and the carousel design-system recipe (PR5) — and the recipe must be agreed and merged into `core/design-system` before PR5 starts (spec §12). No new slug, route or E2E flow (spec §11). No alignment field, no second button, no background image on the banner: each would make this a Hero with extra steps.
