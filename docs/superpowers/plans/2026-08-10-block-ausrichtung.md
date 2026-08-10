# Block-Ausrichtung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A board member can set left / centre / right alignment on the six Puck blocks where alignment is visible, with every existing page rendering byte-identically until someone changes the control.

**Architecture:** One shared `select` field definition and two class-lookup helpers in `puck-config.tsx`. Text blocks take `text-align` on their existing element; `Bild` and `Button` get a `flex justify-*` wrapper. No schema change, no migration, no new file.

**Tech Stack:** TypeScript, React, Next.js 14 App Router, Puck (`@puckeditor/core`), Tailwind via `core/design-system` tokens, Vitest (node environment).

Implements `docs/superpowers/specs/2026-08-10-block-ausrichtung-design.md`. Branches from `feat/block-platzhalter` (PR #165), whose placeholder work restructured the same render functions.

## Global Constraints

- **Vitest runs in `environment: "node"`** (`vitest.config.ts:5`). No jsdom, no testing-library. React is tested via `renderToStaticMarkup`. **Do not add jsdom.**
- **All user-facing copy is German.**
- **Never inline a hex, radius, shadow, or duration** (CLAUDE.md §7). Alignment uses plain Tailwind layout utilities (`text-left`, `text-center`, `text-right`, `flex`, `justify-start`, `justify-center`, `justify-end`) — these are not design tokens and carry no design values.
- **Class strings must be literals in a lookup object, never template-interpolated.** Tailwind's scanner only sees literals; an interpolated class silently fails to generate.
- **Both helpers must be total over `undefined`.** The structural sweep added in PR #165 (`puck-config.test.ts`, `"no block renders a placeholder outside the editor"`) renders every block with a prop bag that does **not** contain `ausrichtung`. If a helper returns `undefined` or throws for an unknown value, that test breaks. Unknown input must fall back to the `links` classes.
- **The default is `"links"`, which is what every block renders today.** No existing page may change appearance. The existing render tests in `puck-config.test.ts` must keep passing **unedited**.
- **Alignment applies to real content only, never to `BlockPlatzhalter`.** The placeholder is editor chrome; it stays centred as it is. Do not thread `ausrichtung` into it.
- **Commit after every task**, conventional-commit style.
- Before each commit run: `pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint`

---

## File Structure

| File                                        | Responsibility                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/web/app/_content/puck-config.tsx`     | **Modify.** Type, shared field constant, two helpers, six render changes. |
| `apps/web/app/_content/puck-config.test.ts` | **Modify.** New assertions; existing tests untouched.                     |

No new files. The helpers live beside the existing `breiteClass` export, which is the established home for this kind of lookup.

**Blocks that get alignment:** `Ueberschrift`, `Absatz`, `Zitat`, `Fliesstext`, `Bild`, `Button`.
**Blocks that deliberately do not:** `Trenner` (full-width `hr`), `Abstand` (invisible spacer), `Spalten` (grid container), `PersonenRaster` and `Organigramm` (own grid layouts).

---

### Task 1: Type, field constant, and the two class helpers

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx`
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces, all exported from `./puck-config`:
  - `type Ausrichtung = "links" | "mittig" | "rechts"`
  - `ausrichtungText(a: Ausrichtung | undefined): string` → `"text-left" | "text-center" | "text-right"`
  - `ausrichtungFlex(a: Ausrichtung | undefined): string` → `"justify-start" | "justify-center" | "justify-end"`
  - a module-local `ausrichtungField` select definition (not exported)

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("puckConfig", …)` block in `apps/web/app/_content/puck-config.test.ts`:

```ts
it("maps each Ausrichtung to its text class", () => {
  expect(ausrichtungText("links")).toBe("text-left");
  expect(ausrichtungText("mittig")).toBe("text-center");
  expect(ausrichtungText("rechts")).toBe("text-right");
});

it("maps each Ausrichtung to its flex-justify class", () => {
  expect(ausrichtungFlex("links")).toBe("justify-start");
  expect(ausrichtungFlex("mittig")).toBe("justify-center");
  expect(ausrichtungFlex("rechts")).toBe("justify-end");
});

it("falls back to left for a missing or unknown Ausrichtung", () => {
  expect(ausrichtungText(undefined)).toBe("text-left");
  expect(ausrichtungFlex(undefined)).toBe("justify-start");
  expect(ausrichtungText("quatsch" as never)).toBe("text-left");
  expect(ausrichtungFlex("quatsch" as never)).toBe("justify-start");
});
```

Add `ausrichtungText` and `ausrichtungFlex` to the existing `import { puckConfig } from "./puck-config";` line rather than writing a second import.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/web test`
Expected: FAIL — `ausrichtungText is not a function`.

Note: the `-- <name>` filter does NOT narrow the run in this package; the whole suite runs. That is expected.

- [ ] **Step 3: Implement**

In `apps/web/app/_content/puck-config.tsx`, add directly below the existing `breiteClass` export:

```tsx
/** Per-block horizontal alignment (ADR 0023 palette). `links` is the default
 *  and is what every block rendered before the control existed. */
export type Ausrichtung = "links" | "mittig" | "rechts";

const AUSRICHTUNG_TEXT: Record<Ausrichtung, string> = {
  links: "text-left",
  mittig: "text-center",
  rechts: "text-right",
};

const AUSRICHTUNG_FLEX: Record<Ausrichtung, string> = {
  links: "justify-start",
  mittig: "justify-center",
  rechts: "justify-end",
};

/** Both lookups fall back to the `links` classes for a missing or unrecognised
 *  value: documents saved before this field existed carry no `ausrichtung`,
 *  and they must keep rendering exactly as they did. Class strings are
 *  literals — Tailwind's scanner never sees an interpolated class. */
export const ausrichtungText = (a: Ausrichtung | undefined): string =>
  AUSRICHTUNG_TEXT[a as Ausrichtung] ?? AUSRICHTUNG_TEXT.links;

export const ausrichtungFlex = (a: Ausrichtung | undefined): string =>
  AUSRICHTUNG_FLEX[a as Ausrichtung] ?? AUSRICHTUNG_FLEX.links;

const ausrichtungField = {
  type: "select" as const,
  label: "Ausrichtung",
  options: [
    { label: "Linksbündig", value: "links" },
    { label: "Mittig", value: "mittig" },
    { label: "Rechtsbündig", value: "rechts" },
  ],
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/web test`
Expected: PASS. All pre-existing tests still green.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(web): add the Ausrichtung type, field and class helpers"
```

---

### Task 2: The three plain text blocks — Ueberschrift, Absatz, Zitat

These take `text-align` on their existing element. No new DOM.

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (`Ueberschrift` at ~94–114, `Absatz` at ~115–125, `Zitat` at ~271–284)
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `ausrichtungText`, `ausrichtungField`, `type Ausrichtung` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("puckConfig", …)`:

```ts
it("Ueberschrift aligns its heading", () => {
  const render = puckConfig.components.Ueberschrift?.render;
  if (!render) throw new Error("Ueberschrift render missing");
  const out = renderToStaticMarkup(
    render({ text: "Titel", ebene: "h2", ausrichtung: "mittig", puck: {} } as never) as never,
  );
  expect(out).toContain("text-center");
  expect(out).toContain("Titel");
});

it("Ueberschrift renders left-aligned when the prop is absent", () => {
  const render = puckConfig.components.Ueberschrift?.render;
  if (!render) throw new Error("Ueberschrift render missing");
  const out = renderToStaticMarkup(
    render({ text: "Titel", ebene: "h3", puck: {} } as never) as never,
  );
  expect(out).toContain("text-left");
});

it("Absatz aligns its paragraph", () => {
  const render = puckConfig.components.Absatz?.render;
  if (!render) throw new Error("Absatz render missing");
  const out = renderToStaticMarkup(
    render({ text: "Ein Satz.", ausrichtung: "rechts", puck: {} } as never) as never,
  );
  expect(out).toContain("text-right");
});

it("Zitat aligns its text", () => {
  const render = puckConfig.components.Zitat?.render;
  if (!render) throw new Error("Zitat render missing");
  const out = renderToStaticMarkup(
    render({ text: "Ein Zitat", quelle: "BSR", ausrichtung: "mittig", puck: {} } as never) as never,
  );
  expect(out).toContain("text-center");
  expect(out).toContain("<blockquote");
});

it("the three text blocks expose an Ausrichtung select", () => {
  for (const name of ["Ueberschrift", "Absatz", "Zitat"] as const) {
    const field = puckConfig.components[name]?.fields?.ausrichtung;
    if (field?.type !== "select") throw new Error(`${name} needs an ausrichtung select`);
    expect(field.options?.map((o) => o.value)).toEqual(["links", "mittig", "rechts"]);
    expect(puckConfig.components[name]?.defaultProps?.ausrichtung).toBe("links");
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/web test`
Expected: FAIL on the five new tests.

- [ ] **Step 3: Implement**

Add `ausrichtung: Ausrichtung;` to the `Ueberschrift`, `Absatz` and `Zitat` entries in the `Blocks` type at the top of the file.

**`Ueberschrift`** — add `ausrichtung: ausrichtungField,` to its `fields`, add `ausrichtung: "links"` to its `defaultProps`, and replace its render with:

```tsx
      render: ({ text, ebene, ausrichtung }) =>
        ebene === "h3" ? (
          <h3 className={`text-xl font-semibold text-bdas-ink ${ausrichtungText(ausrichtung)}`}>
            {text}
          </h3>
        ) : (
          <h2 className={`text-2xl font-semibold text-bdas-ink ${ausrichtungText(ausrichtung)}`}>
            {text}
          </h2>
        ),
```

**`Absatz`** — add `ausrichtung: ausrichtungField,` to its `fields` (it currently has a single-line `fields:` object; expand it), add `ausrichtung: "links"` to `defaultProps`, and replace the paragraph in its render's else-branch:

```tsx
      render: ({ text, ausrichtung, puck }) =>
        (text ?? "").trim() === "" && puck?.isEditing ? (
          <BlockPlatzhalter titel="Absatz" hinweis="Noch kein Text erfasst." />
        ) : (
          <p className={`whitespace-pre-line text-bdas-ink-body ${ausrichtungText(ausrichtung)}`}>
            {text}
          </p>
        ),
```

**`Zitat`** — add `ausrichtung: ausrichtungField,` to its `fields`, add `ausrichtung: "links"` to `defaultProps`, and replace its render with:

```tsx
      render: ({ text, quelle, ausrichtung }) => (
        <blockquote
          className={`rounded-bdas border-l-4 border-bdas-red bg-bdas-overlay-hover px-4 py-3 ${ausrichtungText(ausrichtung)}`}
        >
          <p className="whitespace-pre-line text-bdas-ink-body">{text}</p>
          {quelle ? <footer className="mt-2 text-sm text-bdas-ink-muted">— {quelle}</footer> : null}
        </blockquote>
      ),
```

The interpolation here is of a **helper's return value**, not of a class name — the class strings themselves are literals inside the lookup objects, which is what Tailwind's scanner needs.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/web test`
Expected: PASS. The pre-existing `"Zitat renders text and an optional source"` test must still pass unedited.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(web): align the Ueberschrift, Absatz and Zitat blocks"
```

---

### Task 3: Fließtext

Rich text renders as a sequence of `<p>` elements, so alignment goes on a wrapper that cascades to all of them.

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (`Fliesstext` at ~126–142)
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `ausrichtungText`, `ausrichtungField`, `type Ausrichtung` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("puckConfig", …)`:

```ts
it("Fließtext wraps its rich text in an aligned container", () => {
  const render = puckConfig.components.Fliesstext?.render;
  if (!render) throw new Error("Fliesstext render missing");
  const inhalt = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hallo" }] }],
  };
  const out = renderToStaticMarkup(
    render({ inhalt, ausrichtung: "mittig", puck: { isEditing: false } } as never) as never,
  );
  expect(out).toContain("text-center");
  expect(out).toContain("Hallo");
});

it("Fließtext does not align the placeholder", () => {
  const render = puckConfig.components.Fliesstext?.render;
  if (!render) throw new Error("Fliesstext render missing");
  const leer = { type: "doc", content: [{ type: "paragraph" }] };
  const out = renderToStaticMarkup(
    render({ inhalt: leer, ausrichtung: "rechts", puck: { isEditing: true } } as never) as never,
  );
  expect(out).toContain("data-block-platzhalter");
  expect(out).not.toContain("text-right");
});

it("Fließtext exposes an Ausrichtung select defaulting to links", () => {
  const field = puckConfig.components.Fliesstext?.fields?.ausrichtung;
  if (field?.type !== "select") throw new Error("Fliesstext needs an ausrichtung select");
  expect(field.options?.map((o) => o.value)).toEqual(["links", "mittig", "rechts"]);
  expect(puckConfig.components.Fliesstext?.defaultProps?.ausrichtung).toBe("links");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/web test`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Implement**

Add `ausrichtung: Ausrichtung;` to the `Fliesstext` entry in the `Blocks` type. Add `ausrichtung: ausrichtungField,` to its `fields` and `ausrichtung: "links"` to its `defaultProps` (keep the existing `inhalt` default exactly as it is). Replace its render with:

```tsx
      render: ({ inhalt, ausrichtung, puck }) =>
        istLeererRichText(inhalt) && puck?.isEditing ? (
          <BlockPlatzhalter titel="Fließtext" hinweis="Noch kein Text erfasst." />
        ) : (
          <div className={ausrichtungText(ausrichtung)}>{renderRichText(inhalt)}</div>
        ),
```

Note the fragment `<>…</>` becomes a `<div>`. That is the intended change — the wrapper is what carries the alignment.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/web test`
Expected: PASS. The pre-existing `"Fließtext renders stored rich text"` test must still pass unedited — it asserts `toContain("<strong>Hi</strong>")`, which a wrapper div does not disturb.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(web): align the Fließtext block"
```

---

### Task 4: Bild and Button

These two move the element itself rather than its text, so they get a `flex justify-*` wrapper. A wrapper is used instead of `mx-auto`/`text-align` on the element because it behaves identically whether the block sits in a flex container or a block container — `<figure>` is block-level and ignores `text-align`, while `<a class="inline-flex">` ignores `mx-auto`. One mechanism covers both.

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (`Bild` at ~191–230, `Button` at ~231–270)
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `ausrichtungFlex`, `ausrichtungText`, `ausrichtungField`, `type Ausrichtung` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("puckConfig", …)`:

```ts
it("Bild centres the figure and its caption", () => {
  const render = puckConfig.components.Bild?.render;
  if (!render) throw new Error("Bild render missing");
  const out = renderToStaticMarkup(
    render({
      bild: "https://cdn.test/x.jpg",
      altText: "Gruppenfoto",
      bildunterschrift: "Unterschrift",
      breite: "halb",
      ausrichtung: "mittig",
      puck: {},
    } as never) as never,
  );
  expect(out).toContain("justify-center");
  expect(out).toContain("text-center");
  expect(out).toContain('alt="Gruppenfoto"');
});

it("Bild does not align its placeholder", () => {
  const render = puckConfig.components.Bild?.render;
  if (!render) throw new Error("Bild render missing");
  const out = renderToStaticMarkup(
    render({
      bild: "",
      altText: "",
      bildunterschrift: "",
      breite: "voll",
      ausrichtung: "rechts",
      puck: { isEditing: true },
    } as never) as never,
  );
  expect(out).toContain("data-block-platzhalter");
  expect(out).not.toContain("justify-end");
});

it("Button aligns without disturbing its href or rel", () => {
  const render = puckConfig.components.Button?.render;
  if (!render) throw new Error("Button render missing");
  const out = renderToStaticMarkup(
    render({
      label: "BDAJ",
      href: "https://bdaj.de",
      variante: "primaer",
      ausrichtung: "rechts",
      puck: {},
    } as never) as never,
  );
  expect(out).toContain("justify-end");
  expect(out).toContain('href="https://bdaj.de"');
  expect(out).toContain('rel="noopener noreferrer"');
});

it("Button still renders nothing publicly for an unsafe href, aligned or not", () => {
  const render = puckConfig.components.Button?.render;
  if (!render) throw new Error("Button render missing");
  const out = renderToStaticMarkup(
    render({
      label: "x",
      href: "javascript:alert(1)",
      variante: "primaer",
      ausrichtung: "mittig",
      puck: { isEditing: false },
    } as never) as never,
  );
  expect(out).toBe("");
});

it("Bild and Button expose an Ausrichtung select defaulting to links", () => {
  for (const name of ["Bild", "Button"] as const) {
    const field = puckConfig.components[name]?.fields?.ausrichtung;
    if (field?.type !== "select") throw new Error(`${name} needs an ausrichtung select`);
    expect(field.options?.map((o) => o.value)).toEqual(["links", "mittig", "rechts"]);
    expect(puckConfig.components[name]?.defaultProps?.ausrichtung).toBe("links");
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bdas/web test`
Expected: FAIL on the five new tests.

- [ ] **Step 3: Implement**

Add `ausrichtung: Ausrichtung;` to the `Bild` and `Button` entries in the `Blocks` type. Add `ausrichtung: ausrichtungField,` to each block's `fields` and `ausrichtung: "links"` to each `defaultProps`.

**`Bild`** — replace its render with:

```tsx
      render: ({ bild, altText, bildunterschrift, breite, ausrichtung, puck }) => {
        if (!bild) {
          return puck?.isEditing ? (
            <BlockPlatzhalter titel="Bild" hinweis="Noch kein Bild ausgewählt." />
          ) : (
            <></>
          );
        }
        return (
          <div className={`flex ${ausrichtungFlex(ausrichtung)}`}>
            <figure className={breite === "halb" ? "sm:max-w-md" : "w-full"}>
              <img src={bild} alt={altText} className="w-full rounded-bdas" />
              {bildunterschrift ? (
                <figcaption
                  className={`mt-2 text-sm text-bdas-ink-muted ${ausrichtungText(ausrichtung)}`}
                >
                  {bildunterschrift}
                </figcaption>
              ) : null}
            </figure>
          </div>
        );
      },
```

**`Button`** — keep the guard clause and the `cls` computation exactly as they are; wrap only the returned anchors:

```tsx
return (
  <div className={`flex ${ausrichtungFlex(ausrichtung)}`}>
    {isExternalHref(safe) ? (
      <a href={safe} rel="noopener noreferrer" target="_blank" className={cls}>
        {label}
      </a>
    ) : (
      <a href={safe} className={cls}>
        {label}
      </a>
    )}
  </div>
);
```

and widen its parameter list to `({ label, href, variante, ausrichtung, puck })`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bdas/web test`
Expected: PASS. Both pre-existing tests — `"Bild renders an accessible image and hides when empty"` and `"Button applies safeHref and rel/target for external links"` — must still pass unedited. They assert with `toContain`, which a wrapper div does not disturb, and the empty/unsafe cases still produce `""`.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(web): align the Bild and Button blocks"
```

---

### Task 5: Lock the block set and verify end to end

Two properties are worth pinning structurally: exactly six blocks carry the field, and adding the field changed nothing for a document that predates it.

**Files:**

- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: every block's config.
- Produces: nothing.

- [ ] **Step 1: Write the test**

Append inside `describe("puckConfig", …)`:

```ts
it("exactly the six intended blocks carry an Ausrichtung field", () => {
  const mit = Object.entries(puckConfig.components)
    .filter(([, c]) => c?.fields && "ausrichtung" in c.fields)
    .map(([name]) => name)
    .sort();
  expect(mit).toEqual(["Absatz", "Bild", "Button", "Fliesstext", "Ueberschrift", "Zitat"]);
});

it("a document saved before Ausrichtung existed still renders left-aligned", () => {
  const puck = { isEditing: false, renderDropZone: () => null, dragRef: null, metadata: {} };
  const faelle: Array<[string, Record<string, unknown>]> = [
    ["Ueberschrift", { text: "Titel", ebene: "h2" }],
    ["Absatz", { text: "Ein Satz." }],
    ["Zitat", { text: "Ein Zitat", quelle: "" }],
    [
      "Fliesstext",
      {
        inhalt: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
        },
      },
    ],
    [
      "Bild",
      { bild: "https://cdn.test/x.jpg", altText: "a", bildunterschrift: "", breite: "voll" },
    ],
    ["Button", { label: "x", href: "/impressum", variante: "primaer" }],
  ];

  for (const [name, props] of faelle) {
    const render = puckConfig.components[name as keyof typeof puckConfig.components]?.render;
    if (!render) throw new Error(`${name} render missing`);
    const out = renderToStaticMarkup(render({ ...props, puck } as never) as never);
    expect(out, `${name} must not centre or right-align a legacy document`).not.toMatch(
      /text-center|text-right|justify-center|justify-end/,
    );
  }
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm --filter @bdas/web test`
Expected: PASS immediately — Tasks 1–4 already default correctly. This is a regression net, not a red-green cycle. If the legacy-document test fails, a helper is not falling back to `links`; fix the helper rather than the test.

- [ ] **Step 3: Prove the net can fail**

Temporarily change `ausrichtungText`'s fallback from `AUSRICHTUNG_TEXT.links` to `AUSRICHTUNG_TEXT.mittig`, run `pnpm --filter @bdas/web test`, and confirm the legacy-document test fails naming the first block. Then restore the fallback and confirm the suite is green again. Record both outputs in your report. Do not commit the temporary change.

- [ ] **Step 4: Full verification**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
```

Then the acceptance specs, which need a served app and a migrated Postgres. Check Docker is running first, and **make sure nothing is already bound to port 3000** (`lsof -ti:3000`) — a stale server there will silently serve old code and produce confusing failures.

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

Poll `curl -sf http://localhost:3000/` in a loop until it answers, then:

```bash
DATABASE_URL=postgres://bdas:bdas@localhost:5432/bdas \
SSO_JWT_SECRET=e2e-test-secret-e2e-test-secret-0123456789 \
BDAS_FEDERAL_BOARD_EMAILS=federal@e2e.bdas.test PUBLIC_SITE_URL=http://localhost:3000 \
pnpm e2e e2e/content-pages.e2e.ts e2e/group-pages.e2e.ts
```

Expected: 12 passed and 5 passed, with neither spec edited. Then clean up:

```bash
pkill -f "next start"; pkill -f "next-server"; pnpm db:down
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/puck-config.test.ts
git commit -m "test(web): pin the Ausrichtung block set and legacy-document rendering"
```

---

## Out of scope

- Alignment on `Trenner`, `Abstand`, `Spalten`, `PersonenRaster`, `Organigramm`.
- Vertical alignment.
- Per-paragraph alignment inside Fließtext — the Tiptap config has no `TextAlign` extension and the renderer has no alignment support. Block-level only.
- Aligning `BlockPlatzhalter`.
- Any change to what visitors see for a document that predates this field.
