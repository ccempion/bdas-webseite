# Block-Platzhalter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Puck block is visibly present in the editor immediately after it is dropped, even when empty — while the public page keeps rendering exactly as it does today.

**Architecture:** One shared presentational component, `BlockPlatzhalter`, rendered by the six blocks that can otherwise render nothing. Every call site is gated on `puck.isEditing`, which Puck sets true only inside `<Puck>` and never inside `<Render>`. No feature flag, no config split, no schema change.

**Tech Stack:** TypeScript, React, Next.js 14 App Router, Puck (`@puckeditor/core`), Tailwind via `core/design-system` tokens, Vitest (node environment).

Implements §3 of `docs/superpowers/specs/2026-08-10-editor-realismus-design.md`. This is PR 1 of the three described in that spec's §5; PRs 2 and 3 (the shell view-split and the canvas chrome) are **out of scope here**.

## Global Constraints

- **Vitest runs in `environment: "node"`** (`vitest.config.ts:5`). No jsdom, no testing-library. React is tested via `renderToStaticMarkup` — see `apps/web/app/_content/Organigramm.test.tsx`. **Do not add jsdom**; that is a stack change requiring an ADR.
- **All user-facing copy is German.**
- **Never inline a hex, radius, shadow, or duration** (CLAUDE.md §7). Use only classes already in use in `apps/web/app/_files/FileUploader.tsx:109`: `rounded-bdas`, `border-dashed`, `border-bdas-soft`, `bg-bdas-surface`, `text-bdas-ink`, `text-bdas-ink-muted`.
- **Public rendering must not change.** Three existing tests pin this (`puck-config.test.ts:89`, `:114`, `:242`); they pass `puck: {}`, so `isEditing` is falsy and they must keep passing **unedited**. If one needs changing, the implementation is wrong.
- **Use `puck?.isEditing`, never `puck.isEditing`.** The existing `PersonenRaster` render test (`puck-config.test.ts:53`) calls `render({ personen: [...] })` with no `puck` key, so a bare property access throws a TypeError. Optional chaining also fails safe: a missing context means no placeholder, which is the public-page behaviour.
- **Commit after every task**, conventional-commit style (`feat(web): …`).
- Before each commit run: `pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint`

---

## File Structure

| File                                              | Responsibility                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/web/app/_content/BlockPlatzhalter.tsx`      | **New.** The shared editor-only placeholder. Pure presentational, no hooks.       |
| `apps/web/app/_content/BlockPlatzhalter.test.tsx` | **New.** Its unit tests.                                                          |
| `apps/web/app/_content/rich-text.tsx`             | **Modify.** Add `istLeererRichText` — it already owns knowledge of the doc shape. |
| `apps/web/app/_content/rich-text.test.ts`         | **Modify.** Tests for that predicate.                                             |
| `apps/web/app/_content/puck-config.tsx`           | **Modify.** Wire the placeholder into six blocks.                                 |
| `apps/web/app/_content/puck-config.test.ts`       | **Modify.** Add `isEditing: true` assertions; leave existing tests untouched.     |

Emptiness predicates stay inline in each `render` — they are one-liners, and every other block behaviour in `puck-config.test.ts` is already tested through its render function. Extracting them into a module would be a speculative abstraction (CLAUDE.md §6). The one exception is `istLeererRichText`, which carries real logic about Tiptap's document shape and belongs beside the renderer that already parses it.

---

### Task 1: The shared placeholder component

**Files:**

- Create: `apps/web/app/_content/BlockPlatzhalter.tsx`
- Test: `apps/web/app/_content/BlockPlatzhalter.test.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: `BlockPlatzhalter({ titel: string; hinweis: string }): JSX.Element` — renders a container carrying the attribute `data-block-platzhalter`, which every later task asserts against and Task 5 uses for its structural sweep.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_content/BlockPlatzhalter.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { BlockPlatzhalter } from "./BlockPlatzhalter";

const html = (titel: string, hinweis: string) =>
  renderToStaticMarkup(<BlockPlatzhalter titel={titel} hinweis={hinweis} />);

describe("BlockPlatzhalter", () => {
  it("names the block and explains what is missing", () => {
    const out = html("Bild", "Noch kein Bild ausgewählt.");
    expect(out).toContain("Bild");
    expect(out).toContain("Noch kein Bild ausgewählt.");
  });

  it("carries a stable hook for tests and E2E", () => {
    expect(html("Button", "x")).toContain("data-block-platzhalter");
  });

  it("uses the repo's dashed empty-state idiom, not ad-hoc styling", () => {
    const out = html("Bild", "x");
    expect(out).toContain("border-dashed");
    expect(out).toContain("border-bdas-soft");
    expect(out).toContain("rounded-bdas");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web test -- BlockPlatzhalter`
Expected: FAIL — `Failed to resolve import "./BlockPlatzhalter"`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/app/_content/BlockPlatzhalter.tsx`:

```tsx
import React from "react";

/**
 * Editor-only stand-in for a block that would otherwise render nothing.
 *
 * Never reaches the public page: every caller gates it on `puck.isEditing`,
 * which Puck sets true inside `<Puck>` and false inside `<Render>`. Without
 * it a freshly dropped Button or Bild renders as literally nothing and the
 * board cannot tell the drop worked.
 *
 * Styling mirrors the empty-state idiom already used by the file uploader
 * (`app/_files/FileUploader.tsx`) so the editor speaks one visual language.
 */
export function BlockPlatzhalter({ titel, hinweis }: { titel: string; hinweis: string }) {
  return (
    <div
      data-block-platzhalter
      className="flex flex-col items-center justify-center gap-1 rounded-bdas border border-dashed border-bdas-soft bg-bdas-surface p-8 text-center"
    >
      <p className="text-bdas-ink">{titel}</p>
      <p className="text-sm text-bdas-ink-muted">{hinweis}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/web test -- BlockPlatzhalter`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/BlockPlatzhalter.tsx apps/web/app/_content/BlockPlatzhalter.test.tsx
git commit -m "feat(web): add the shared editor-only block placeholder"
```

---

### Task 2: Bild and Button — the two blocks that render nothing today

These are the actual bug: `Bild` returns `<></>` with no image, and `Button` returns `<></>` when `href` is empty — and `Button`'s `defaultProps.href` is `""`, so a freshly dropped Button is invisible.

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (the `Bild` render, currently lines 197–209; the `Button` render, currently lines 226–243)
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `BlockPlatzhalter({ titel, hinweis })` from Task 1.
- Produces: nothing new. The `Blocks` type needs no change — Puck injects `puck` into every render via `WithPuckProps`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("puckConfig", …)` block in `apps/web/app/_content/puck-config.test.ts`:

```ts
it("Bild shows a placeholder in the editor when no image is chosen", () => {
  const render = puckConfig.components.Bild?.render;
  if (!render) throw new Error("Bild render missing");
  const out = renderToStaticMarkup(
    render({
      bild: "",
      altText: "",
      bildunterschrift: "",
      breite: "voll",
      puck: { isEditing: true },
    } as never) as never,
  );
  expect(out).toContain("data-block-platzhalter");
  expect(out).toContain("Bild");
});

it("Button shows a placeholder in the editor when the link is still empty", () => {
  const render = puckConfig.components.Button?.render;
  if (!render) throw new Error("Button render missing");
  const out = renderToStaticMarkup(
    render({
      label: "Mehr erfahren",
      href: "",
      variante: "primaer",
      puck: { isEditing: true },
    } as never) as never,
  );
  expect(out).toContain("data-block-platzhalter");
  expect(out).toContain("Button");
});

it("Button shows a placeholder in the editor for an unsafe link, and nothing publicly", () => {
  const render = puckConfig.components.Button?.render;
  if (!render) throw new Error("Button render missing");
  const props = { label: "x", href: "javascript:alert(1)", variante: "primaer" };
  const editing = renderToStaticMarkup(
    render({ ...props, puck: { isEditing: true } } as never) as never,
  );
  expect(editing).toContain("data-block-platzhalter");
  expect(editing).not.toContain("javascript:");
  const publicOut = renderToStaticMarkup(
    render({ ...props, puck: { isEditing: false } } as never) as never,
  );
  expect(publicOut).toBe("");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: FAIL — the three new tests report `expected '' to contain 'data-block-platzhalter'`. The pre-existing tests still pass.

- [ ] **Step 3: Implement**

In `apps/web/app/_content/puck-config.tsx`, add the import beside the other local imports:

```tsx
import { BlockPlatzhalter } from "./BlockPlatzhalter";
```

Replace the `Bild` render with:

```tsx
      render: ({ bild, altText, bildunterschrift, breite, puck }) => {
        if (!bild) {
          return puck?.isEditing ? (
            <BlockPlatzhalter titel="Bild" hinweis="Noch kein Bild ausgewählt." />
          ) : (
            <></>
          );
        }
        return (
          <figure className={breite === "halb" ? "sm:max-w-md" : "w-full"}>
            <img src={bild} alt={altText} className="w-full rounded-bdas" />
            {bildunterschrift ? (
              <figcaption className="mt-2 text-sm text-bdas-ink-muted">
                {bildunterschrift}
              </figcaption>
            ) : null}
          </figure>
        );
      },
```

Replace the `Button` render's guard clause — the three lines

```tsx
const safe = safeHref(href);
if (!safe) return <></>;
```

with:

```tsx
const safe = safeHref(href);
if (!safe) {
  return puck?.isEditing ? (
    <BlockPlatzhalter titel="Button" hinweis="Noch kein gültiger Link hinterlegt." />
  ) : (
    <></>
  );
}
```

and widen that render's parameter list from `({ label, href, variante })` to `({ label, href, variante, puck })`. Leave the rest of the Button body untouched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: PASS. Confirm specifically that the pre-existing `"Bild renders an accessible image and hides when empty"` and `"Button applies safeHref and rel/target for external links"` tests still pass **without edits** — they are the guard proving the public page is unchanged.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "fix(web): show a placeholder for an empty Bild or Button in the editor"
```

---

### Task 3: Absatz and Fließtext — the text blocks

**Files:**

- Modify: `apps/web/app/_content/rich-text.tsx` (add `istLeererRichText`)
- Modify: `apps/web/app/_content/rich-text.test.ts`
- Modify: `apps/web/app/_content/puck-config.tsx` (the `Absatz` render, currently line 118; the `Fliesstext` render, currently line 130)
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `BlockPlatzhalter({ titel, hinweis })` from Task 1.
- Produces: `istLeererRichText(doc: unknown): boolean` — exported from `./rich-text`, true for `null`, for a doc with no `content`, and for a doc whose every node has no `content` (which is the shape of `Fliesstext`'s `defaultProps`).

- [ ] **Step 1: Write the failing test for the predicate**

Append to `apps/web/app/_content/rich-text.test.ts`:

```ts
describe("istLeererRichText", () => {
  it("treats the Fließtext default document as empty", () => {
    expect(istLeererRichText({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
  });

  it("treats a missing or contentless document as empty", () => {
    expect(istLeererRichText(null)).toBe(true);
    expect(istLeererRichText({ type: "doc" })).toBe(true);
    expect(istLeererRichText({ type: "doc", content: [] })).toBe(true);
  });

  it("treats a document with text as non-empty", () => {
    expect(istLeererRichText(doc([para([text("Hallo")])]))).toBe(false);
  });
});
```

Add `istLeererRichText` to the existing import from `./rich-text` at the top of that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web test -- rich-text`
Expected: FAIL — `istLeererRichText is not a function`.

- [ ] **Step 3: Implement the predicate**

Append to `apps/web/app/_content/rich-text.tsx`:

```tsx
/** True when a stored Tiptap document would render to nothing visible.
 *  `{ type: "doc", content: [{ type: "paragraph" }] }` — Fließtext's own
 *  defaultProps — counts as empty: it is one paragraph with no children. */
export function istLeererRichText(doc: unknown): boolean {
  const content = (doc as { content?: unknown[] } | null | undefined)?.content;
  if (!Array.isArray(content) || content.length === 0) return true;
  return content.every((node) => {
    const kinder = (node as { content?: unknown[] }).content;
    return !Array.isArray(kinder) || kinder.length === 0;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/web test -- rich-text`
Expected: PASS.

- [ ] **Step 5: Write the failing block tests**

Append inside `describe("puckConfig", …)` in `apps/web/app/_content/puck-config.test.ts`:

```ts
it("Absatz shows a placeholder in the editor while its text is empty", () => {
  const render = puckConfig.components.Absatz?.render;
  if (!render) throw new Error("Absatz render missing");
  const editing = renderToStaticMarkup(
    render({ text: "   ", puck: { isEditing: true } } as never) as never,
  );
  expect(editing).toContain("data-block-platzhalter");
  const publicOut = renderToStaticMarkup(
    render({ text: "", puck: { isEditing: false } } as never) as never,
  );
  expect(publicOut).not.toContain("data-block-platzhalter");
});

it("Absatz renders its text once written", () => {
  const render = puckConfig.components.Absatz?.render;
  if (!render) throw new Error("Absatz render missing");
  const out = renderToStaticMarkup(
    render({ text: "Ein Satz.", puck: { isEditing: true } } as never) as never,
  );
  expect(out).toContain("Ein Satz.");
  expect(out).not.toContain("data-block-platzhalter");
});

it("Fließtext shows a placeholder in the editor while its document is empty", () => {
  const render = puckConfig.components.Fliesstext?.render;
  if (!render) throw new Error("Fliesstext render missing");
  const leer = { type: "doc", content: [{ type: "paragraph" }] };
  const editing = renderToStaticMarkup(
    render({ inhalt: leer, puck: { isEditing: true } } as never) as never,
  );
  expect(editing).toContain("data-block-platzhalter");
  const publicOut = renderToStaticMarkup(
    render({ inhalt: leer, puck: { isEditing: false } } as never) as never,
  );
  expect(publicOut).not.toContain("data-block-platzhalter");
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: FAIL on the three new tests.

- [ ] **Step 7: Implement the block changes**

In `apps/web/app/_content/puck-config.tsx`, add `istLeererRichText` to the existing import from `./rich-text`:

```tsx
import { istLeererRichText, renderRichText } from "./rich-text";
```

Replace the `Absatz` render with:

```tsx
      render: ({ text, puck }) =>
        (text ?? "").trim() === "" && puck?.isEditing ? (
          <BlockPlatzhalter titel="Absatz" hinweis="Noch kein Text erfasst." />
        ) : (
          <p className="whitespace-pre-line text-bdas-ink-body">{text}</p>
        ),
```

Replace the `Fliesstext` render with:

```tsx
      render: ({ inhalt, puck }) =>
        istLeererRichText(inhalt) && puck?.isEditing ? (
          <BlockPlatzhalter titel="Fließtext" hinweis="Noch kein Text erfasst." />
        ) : (
          <>{renderRichText(inhalt)}</>
        ),
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: PASS. The pre-existing `"Fließtext renders stored rich text"` test must still pass unedited.

- [ ] **Step 9: Verify and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/rich-text.tsx apps/web/app/_content/rich-text.test.ts apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(web): show a placeholder for empty Absatz and Fließtext blocks"
```

---

### Task 4: PersonenRaster and Organigramm — the collection blocks

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (the `PersonenRaster` render, currently lines 157–175; the `Organigramm` render, currently line 354)
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `BlockPlatzhalter({ titel, hinweis })` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("puckConfig", …)` in `apps/web/app/_content/puck-config.test.ts`:

```ts
it("PersonenRaster shows a placeholder in the editor while it holds nobody", () => {
  const render = puckConfig.components.PersonenRaster?.render;
  if (!render) throw new Error("PersonenRaster render missing");
  const editing = renderToStaticMarkup(
    render({ personen: [], puck: { isEditing: true } } as never) as never,
  );
  expect(editing).toContain("data-block-platzhalter");
  const publicOut = renderToStaticMarkup(
    render({ personen: [], puck: { isEditing: false } } as never) as never,
  );
  expect(publicOut).not.toContain("data-block-platzhalter");
});

it("Organigramm shows a placeholder in the editor while it holds no boxes", () => {
  const render = puckConfig.components.Organigramm?.render;
  if (!render) throw new Error("Organigramm render missing");
  const editing = renderToStaticMarkup(
    render({ kaesten: [], puck: { isEditing: true } } as never) as never,
  );
  expect(editing).toContain("data-block-platzhalter");
  const publicOut = renderToStaticMarkup(
    render({ kaesten: [], puck: { isEditing: false } } as never) as never,
  );
  expect(publicOut).not.toContain("data-block-platzhalter");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: FAIL on the two new tests.

- [ ] **Step 3: Implement**

In `apps/web/app/_content/puck-config.tsx`, change the `PersonenRaster` render's first line from

```tsx
      render: ({ personen }) => (
```

to a guarded form, keeping the existing grid body exactly as it is:

```tsx
      render: ({ personen, puck }) =>
        (personen ?? []).length === 0 && puck?.isEditing ? (
          <BlockPlatzhalter titel="Personen-Raster" hinweis="Noch keine Personen hinzugefügt." />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
            {personen.map((p, i) => (
              <Card key={i} className="overflow-hidden">
                {p.foto ? (
                  <img src={p.foto} alt={p.name} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="aspect-square w-full bg-bdas-surface-hover" aria-hidden />
                )}
                <div className="flex flex-col gap-1 p-4">
                  <p className="font-semibold text-bdas-ink">{p.name}</p>
                  <p className="text-bdas-ink-body">{p.rolle}</p>
                  <p className="text-sm text-bdas-ink-muted">{p.uni}</p>
                  <p className="text-sm text-bdas-ink-muted">{p.studiengang}</p>
                </div>
              </Card>
            ))}
          </div>
        ),
```

Keep the two-column explanatory comment that sits directly above this render.

Replace the `Organigramm` render with:

```tsx
      render: ({ kaesten, puck }) =>
        (kaesten ?? []).length === 0 && puck?.isEditing ? (
          <BlockPlatzhalter titel="Organigramm" hinweis="Noch keine Kästen angelegt." />
        ) : (
          <Organigramm kaesten={kaesten} />
        ),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: PASS. The pre-existing `"PersonenRaster shows two people per row on the narrowest viewport"` test — which passes **no** `puck` key at all — must still pass unedited; this is exactly what `puck?.isEditing` protects.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(web): show a placeholder for empty PersonenRaster and Organigramm blocks"
```

---

### Task 5: Prove the public page is untouched

The whole safety argument of this PR is "placeholders never reach visitors." Task 2–4 assert it per block. This task asserts it once, structurally, so a future block added without the `isEditing` gate is caught.

**Files:**

- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: every block render.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Append inside `describe("puckConfig", …)`:

```ts
it("no block renders a placeholder outside the editor", () => {
  const leereProps: Record<string, unknown> = {
    bild: "",
    altText: "",
    bildunterschrift: "",
    breite: "voll",
    label: "",
    href: "",
    variante: "primaer",
    text: "",
    quelle: "",
    inhalt: { type: "doc", content: [{ type: "paragraph" }] },
    personen: [],
    kaesten: [],
    ebene: "h2",
    hoehe: "mittel",
    anzahl: "2",
  };
  const puck = { isEditing: false, renderDropZone: () => null, dragRef: null, metadata: {} };

  for (const [name, component] of Object.entries(puckConfig.components)) {
    const render = component?.render;
    if (!render) throw new Error(`${name} render missing`);
    const out = renderToStaticMarkup(render({ ...leereProps, puck } as never) as never);
    expect(out, `${name} leaked a placeholder to the public page`).not.toContain(
      "data-block-platzhalter",
    );
  }
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: PASS immediately — Tasks 2–4 already gate correctly. This test is a regression net, not a red-green cycle. If it fails, a block is missing its `puck?.isEditing` gate; fix that block rather than weakening the test.

- [ ] **Step 3: Run the full suite and both Puck E2E specs**

Unit and static checks:

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
```

Then the acceptance specs that drive the editor and assert public output. These need a served app and a migrated Postgres:

```bash
pnpm db:up && pnpm db:migrate && pnpm --filter @bdas/web build
BDAS_FLAG_AUTH=true BDAS_FLAG_MEMBERS=true BDAS_FLAG_GROUPS=true BDAS_FLAG_EVENTS=true \
BDAS_FLAG_DASHBOARD=true BDAS_FLAG_PUBLIC_SHELL=true BDAS_FLAG_GROUP_MAP=true \
BDAS_FLAG_CONTENT=true BDAS_FLAG_BLOG=true BDAS_FLAG_PROFILE=true \
DATABASE_URL=postgres://bdas:bdas@localhost:5432/bdas \
SSO_JWT_SECRET=e2e-test-secret-e2e-test-secret-0123456789 \
BDAS_FEDERAL_BOARD_EMAILS=federal@e2e.bdas.test PUBLIC_SITE_URL=http://localhost:3000 \
pnpm --filter @bdas/web start &
```

Wait for `http://localhost:3000` to answer, then:

```bash
DATABASE_URL=postgres://bdas:bdas@localhost:5432/bdas \
SSO_JWT_SECRET=e2e-test-secret-e2e-test-secret-0123456789 \
BDAS_FEDERAL_BOARD_EMAILS=federal@e2e.bdas.test PUBLIC_SITE_URL=http://localhost:3000 \
pnpm e2e e2e/content-pages.e2e.ts e2e/group-pages.e2e.ts
```

Expected: 12 passed and 5 passed. Both suites must pass **without editing either spec** — they publish through the editor and assert what the visitor sees, so a placeholder leaking into public output fails them.

Then stop the app and the database:

```bash
pkill -f "next start"; pnpm db:down
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_content/puck-config.test.ts
git commit -m "test(web): assert no block leaks a placeholder to the public page"
```

---

## Out of scope

- PRs 2 and 3 of the spec — the `PublicHeaderView` / `PublicFooterView` split and the canvas header/footer.
- `Zitat`, `Trenner`, `Abstand` and `Spalten` get no placeholder: they render visibly when empty already (a bordered card, a rule, a sized spacer, and drop zones respectively).
- Any change to what visitors see.
