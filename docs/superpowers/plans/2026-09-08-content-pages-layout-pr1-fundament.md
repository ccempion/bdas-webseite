# Content-Seiten Layout-Erweiterung — PR1 (Fundament) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give board editors a real, editable "volle Breite" option for content pages, richer `Spalten`-Layouts, and two new blocks (Panel/Kasten, Akkordeon), plus an in-editor preview toggle — the foundation slice of the five-PR layout expansion.

**Architecture:** All changes are additive to the single shared Puck config (`apps/web/app/_content/puck-config.tsx`) and its editor shell (`PuckEditor.tsx`). Root width becomes a genuine Puck field, gated per-slug via Puck's `resolveFields` API (verified against the installed `@puckeditor/core@0.23.0` type declarations, not assumed). One route (`ueber-uns/page.tsx`) needs a structural fix because its current layout would silently swallow the new "voll" option. No `modules/content` schema, migration, or feature-flag change — `root.props` and block `props` are already opaque passthrough JSON.

**Tech Stack:** Next.js 14 App Router, `@puckeditor/core@0.23.0` (pinned), Tailwind CSS via `core/design-system` tokens, Vitest (`renderToStaticMarkup` pattern already established in `puck-config.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-08-content-pages-layout-erweiterung-design.md` (§4 Root-Breite, §5 Spalten-Presets, §6 Panel/Akkordeon, §9 Preview-Umschalter). Reference: `docs/decisions/0034-puck-freeform-layout-and-block-expansion.md`.

## Global Constraints

- No MUI/Emotion, no raw HTML block, no free-text CSS/styling prop on any block (ADR 0023, unchanged).
- Every new class must be a **literal string** — never an interpolated/dynamic Tailwind class (Tailwind's scanner only sees literals; existing `ausrichtungText`/`ausrichtungFlex` and this plan's `SPALTEN_LAYOUT` follow this).
- Only `core/design-system` tokens (colors, radii, shadows, motion) or already-established global classes (`bdas-accordion`) — no ad-hoc hex/radius/shadow/duration values.
- `voll` width is never offered on `datenschutz`, `impressum`, `nutzungsbedingungen` — enforced in code (slug check), not editorial convention.
- Documents saved before a prop existed must keep rendering byte-identically (established pattern: every new field falls back to today's default when absent).
- `@puckeditor/core` stays pinned at `^0.23.0` — every API used below (`root.fields`, `root.resolveFields`, `usePuck()`, `dispatch({ type: "setUi", ... })`, `appState.ui.previewMode`) was confirmed against that version's shipped `.d.ts` files, not guessed.

---

## Task 1: `Breite` gains `"voll"` — type, class helper, normalization guard

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx:67-70` (`Breite` type, `breiteClass`)
- Modify: `apps/web/app/_content/puck-config.tsx:140-150` (`normalizeContent` guard)
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Produces: `export type Breite = "schmal" | "breit" | "voll";` — `breiteClass(breite: Breite): string` now returns `""` for `"voll"` (no `max-w-*` class, so the flex column stretches to the full padded width). `normalizeContent` treats a stored `"voll"` as already-valid and does not overwrite it with the route fallback.
- Consumes: nothing new from other tasks — this is the foundation every later task builds on.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/app/_content/puck-config.test.ts` (extend the existing top-level import to also pull in `breiteClass`):

```ts
import {
  ausrichtungFlex,
  ausrichtungText,
  breiteClass,
  normalizeContent,
  puckConfig,
} from "./puck-config";
```

```ts
describe("Breite: voll", () => {
  it("breiteClass has no max-width class for voll", () => {
    expect(breiteClass("voll")).toBe("");
  });

  it("breiteClass keeps existing schmal/breit behaviour", () => {
    expect(breiteClass("schmal")).toBe("max-w-3xl");
    expect(breiteClass("breit")).toBe("max-w-5xl");
  });

  it("normalizeContent keeps a voll width the document already carries", () => {
    const data: Data = { root: { props: { breite: "voll" } }, content: [] };
    const out = normalizeContent(data, "schmal");
    expect((out.root.props as { breite?: string }).breite).toBe("voll");
  });

  it("normalizeContent still seeds the fallback when no width is stored", () => {
    const data: Data = { root: { props: {} }, content: [] };
    const out = normalizeContent(data, "voll");
    expect((out.root.props as { breite?: string }).breite).toBe("voll");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- puck-config -t "Breite: voll"`
Expected: FAIL — `breiteClass("voll")` currently falls through to `"max-w-3xl"` (the ternary has no third branch), and `"voll"` is not yet in the `normalizeContent` guard so it gets overwritten by the fallback.

- [ ] **Step 3: Implement**

In `apps/web/app/_content/puck-config.tsx`, replace:

```ts
export type Breite = "schmal" | "breit";

export const breiteClass = (breite: Breite): string =>
  breite === "breit" ? "max-w-5xl" : "max-w-3xl";
```

with:

```ts
export type Breite = "schmal" | "breit" | "voll";

export const breiteClass = (breite: Breite): string =>
  breite === "breit" ? "max-w-5xl" : breite === "voll" ? "" : "max-w-3xl";
```

And in `normalizeContent`, replace:

```ts
const mitBreite =
  props.breite === "schmal" || props.breite === "breit"
    ? data
    : ({ ...data, root: { ...data.root, props: { ...props, breite: fallback } } } as Data);
```

with:

```ts
const mitBreite =
  props.breite === "schmal" || props.breite === "breit" || props.breite === "voll"
    ? data
    : ({ ...data, root: { ...data.root, props: { ...props, breite: fallback } } } as Data);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- puck-config -t "Breite: voll"`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full existing suite to confirm no regression**

Run: `pnpm --filter web test -- puck-config`
Expected: PASS — all pre-existing `puckConfig`/`normalizeContent` tests still pass unchanged (schmal/breit behaviour is untouched).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(content): add voll width to Breite type and normalizeContent"
```

---

## Task 2: `ueber-uns/page.tsx` — stop clipping the Puck content to `max-w-3xl`

**Context:** every other content route (`bdaj`, `verbandsstruktur`, `bundessprecherinnenrat`, `gruppen/[slug]`) wraps its own header chrome in one width-constrained `<div>` and renders `<Render>` in a **separate**, unconstrained `<div className="mt-6">` — so `<Render>`'s own root width (from `puckConfig.root.render`) is the only thing constraining it. `ueber-uns/page.tsx` is the one outlier: header and `<Render>` share a single `<main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">`. Once `breite` can be `"voll"`, that outer `max-w-3xl` would silently clip the content no matter what the board picks. This task brings the route in line with the other four.

**Files:**

- Modify: `apps/web/app/ueber-uns/page.tsx`

**Interfaces:**

- Consumes: `breiteClass` from `../_content/puck-config` (already used by `bdaj`/`verbandsstruktur`/`gruppen` for their header wrapper — same pattern reused here).
- Produces: nothing new — purely a structural fix so Task 3's field has visible effect on this route.

- [ ] **Step 1: Write the failing test**

There is no existing test file for this route; add a minimal one asserting the structural invariant (header wrapper is width-constrained, content wrapper is not) via a static string check, matching how this codebase tests layout classes elsewhere (`puck-config.test.ts`'s grid-class assertions).

Create `apps/web/app/ueber-uns/page.test.tsx`... — **do not create this.** This route is an async Server Component reading `getDb()`/session state; the existing test suite has no precedent for rendering App Router page components directly (every test in `puck-config.test.ts` tests the exported _helpers_, not routes). Skip a dedicated automated test for this structural fix — the risk (double `max-w-3xl` wrapping) is caught by manual verification in Step 3, and full coverage of "does the public page actually widen" belongs to the manual QA pass in Task 3, which exercises this route end-to-end.

- [ ] **Step 2: Implement**

Replace the current single-`<main>` structure:

```tsx
return (
  <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
      <h1 className="text-3xl font-semibold text-bdas-ink">Über uns</h1>
      {canEdit ? (
        <Link
          href="/ueber-uns/bearbeiten"
          className="inline-flex shrink-0 items-center rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
        >
          Seite bearbeiten
        </Link>
      ) : null}
    </div>
    {page ? (
      <Render config={puckConfig} data={normalizeContent(page.data as Data, "schmal")} />
    ) : (
      <>
        {/* Platzhaltertext — bearbeitbar durch den Bundessprecher*innenrat (Spec §8). */}
        <p className="text-bdas-ink-body">
          Der Bund der Alevitischen Studierenden in Deutschland (BDAS) ist der Zusammenschluss
          alevitischer Hochschulgruppen an deutschen Universitäten. Wir vernetzen Studierende,
          organisieren Veranstaltungen und vertreten die Interessen alevitischer Studierender.
        </p>
        <p className="text-bdas-ink-body">
          Von der Erstsemester-Begrüßung bis zur Bundeskonferenz: Unsere Hochschulgruppen leben
          alevitische Werte im Studienalltag — offen, demokratisch und solidarisch.
        </p>
      </>
    )}
  </main>
);
```

with the two-wrapper structure already used by `bdaj`/`verbandsstruktur` (header at a fixed `schmal` width, content unconstrained so `puckConfig.root.render` alone decides its width):

```tsx
return (
  <main className="py-12">
    <div
      className={`mx-auto flex w-full flex-col items-start gap-4 px-4 sm:flex-row sm:justify-between ${breiteClass("schmal")}`}
    >
      <h1 className="text-3xl font-semibold text-bdas-ink">Über uns</h1>
      {canEdit ? (
        <Link
          href="/ueber-uns/bearbeiten"
          className="inline-flex shrink-0 items-center rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
        >
          Seite bearbeiten
        </Link>
      ) : null}
    </div>
    {page ? (
      <div className="mt-6">
        <Render config={puckConfig} data={normalizeContent(page.data as Data, "schmal")} />
      </div>
    ) : (
      <div className={`mx-auto mt-6 flex w-full flex-col gap-6 px-4 ${breiteClass("schmal")}`}>
        {/* Platzhaltertext — bearbeitbar durch den Bundessprecher*innenrat (Spec §8). */}
        <p className="text-bdas-ink-body">
          Der Bund der Alevitischen Studierenden in Deutschland (BDAS) ist der Zusammenschluss
          alevitischer Hochschulgruppen an deutschen Universitäten. Wir vernetzen Studierende,
          organisieren Veranstaltungen und vertreten die Interessen alevitischer Studierender.
        </p>
        <p className="text-bdas-ink-body">
          Von der Erstsemester-Begrüßung bis zur Bundeskonferenz: Unsere Hochschulgruppen leben
          alevitische Werte im Studienalltag — offen, demokratisch und solidarisch.
        </p>
      </div>
    )}
  </main>
);
```

Update the import line from:

```tsx
import { normalizeContent, puckConfig } from "../_content/puck-config";
```

to:

```tsx
import { breiteClass, normalizeContent, puckConfig } from "../_content/puck-config";
```

- [ ] **Step 3: Manual verification**

Run: `pnpm --filter web dev`, visit `/ueber-uns` with `BDAS_FLAG_CONTENT`/`BDAS_FLAG_PUBLIC_SHELL` on and an existing page document. Confirm the page renders identically to before (header row, then content at `max-w-3xl`, no visual change yet — `breite` is still hardcoded to `"schmal"` until Task 3 adds the field). This step only proves the refactor is behaviour-preserving; the actual "voll" effect is verified in Task 3.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/ueber-uns/page.tsx
git commit -m "refactor(content): split ueber-uns header and Puck content into separate width wrappers"
```

---

## Task 3: Root `breite` becomes a real editor field, gated by slug

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (root config, new `LEGAL_SLUGS`/`breiteField` constants)
- Modify: `apps/web/app/_content/PuckEditor.tsx` (metadata gains `slug`)
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `Breite` (Task 1).
- Produces: `puckConfig.root.fields.breite` (a `select` field), `puckConfig.root.resolveFields` (filters the `"voll"` option out for legal slugs). Board members editing `ueber-uns`, `ueber-uns/bdaj`, `ueber-uns/verbandsstruktur`, `ueber-uns/bundessprecherinnenrat`, or any `gruppen/<slug>` see all three width options; `datenschutz`/`impressum`/`nutzungsbedingungen` see only `schmal`/`breit`.

**Puck API used (verified against `@puckeditor/core@0.23.0`'s shipped `.d.ts`):**

- `RootConfig` is `Partial<ComponentConfigInternal<...>>` — it supports `fields` and `resolveFields` exactly like any component config.
- `resolveFields?: (data, { metadata, ... }) => Fields | Promise<Fields>` — `metadata` is whatever object the `<Puck metadata={...}>` prop carries at runtime.
- `puckConfig: Config<Blocks>` leaves the root-props generic at its default (`any`), so `root.fields`/`root.resolveFields` do not need extra casting beyond what the file already does for `root.render`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/app/_content/puck-config.test.ts`:

```ts
describe("root breite field", () => {
  it("offers schmal/breit/voll by default (no slug in metadata)", () => {
    const resolve = puckConfig.root?.resolveFields;
    if (!resolve) throw new Error("root.resolveFields missing");
    const fields = resolve({ props: { breite: "schmal" } } as never, { metadata: {} } as never) as {
      breite: { options: { value: string }[] };
    };
    expect(fields.breite.options.map((o) => o.value)).toEqual(["schmal", "breit", "voll"]);
  });

  it("hides voll for legal-text slugs", () => {
    const resolve = puckConfig.root?.resolveFields;
    if (!resolve) throw new Error("root.resolveFields missing");
    for (const slug of ["datenschutz", "impressum", "nutzungsbedingungen"]) {
      const fields = resolve(
        { props: { breite: "schmal" } } as never,
        { metadata: { slug } } as never,
      ) as { breite: { options: { value: string }[] } };
      expect(fields.breite.options.map((o) => o.value)).toEqual(["schmal", "breit"]);
    }
  });

  it("keeps voll for content-page slugs, including dynamic group slugs", () => {
    const resolve = puckConfig.root?.resolveFields;
    if (!resolve) throw new Error("root.resolveFields missing");
    for (const slug of ["ueber-uns", "ueber-uns/bdaj", "gruppen/berlin"]) {
      const fields = resolve(
        { props: { breite: "schmal" } } as never,
        { metadata: { slug } } as never,
      ) as { breite: { options: { value: string }[] } };
      expect(fields.breite.options.map((o) => o.value)).toEqual(["schmal", "breit", "voll"]);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- puck-config -t "root breite field"`
Expected: FAIL — `puckConfig.root.resolveFields` does not exist yet.

- [ ] **Step 3: Implement**

In `apps/web/app/_content/puck-config.tsx`, add near the other shared field constants (after `ausrichtungField`, before `normalizeContent`):

```ts
/** Legal-text pages stay at reading width — "voll" is never offered there,
 *  enforced here rather than left to editorial judgement (spec §4). */
const LEGAL_SLUGS = new Set(["datenschutz", "impressum", "nutzungsbedingungen"]);

const BREITE_OPTIONS = [
  { label: "Schmal", value: "schmal" },
  { label: "Breit", value: "breit" },
  { label: "Volle Breite", value: "voll" },
] as const;

const breiteField = {
  type: "select" as const,
  label: "Breite",
  options: BREITE_OPTIONS,
};

const breiteFieldOhneVoll = {
  type: "select" as const,
  label: "Breite",
  options: BREITE_OPTIONS.filter((o) => o.value !== "voll"),
};
```

Then change the `root` entry from:

```ts
  root: {
    render: ({ children, ...props }) => {
```

to:

```ts
  root: {
    fields: {
      breite: breiteField,
    },
    resolveFields: (_data, { metadata }) => {
      const slug = (metadata as { slug?: string } | undefined)?.slug;
      return {
        breite: slug !== undefined && LEGAL_SLUGS.has(slug) ? breiteFieldOhneVoll : breiteField,
      };
    },
    render: ({ children, ...props }) => {
```

(The rest of `render` is unchanged — it already reads `breite` off `props` and calls `breiteClass(breite)`.)

In `apps/web/app/_content/PuckEditor.tsx`, extend the metadata so `resolveFields` can see the slug — change:

```tsx
const metadata = useMemo(() => ({ chrome }), [chrome]);
```

to:

```tsx
const metadata = useMemo(() => ({ chrome, slug }), [chrome, slug]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- puck-config -t "root breite field"`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full suite**

Run: `pnpm --filter web test -- puck-config`
Expected: PASS, no regressions.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS

- [ ] **Step 7: Manual verification**

Run: `pnpm --filter web dev`. As a federal-board member:

1. Open `/ueber-uns/bearbeiten` — confirm a "Breite" field appears (root/page-level settings panel, not a per-block field), offering Schmal/Breit/Volle Breite. Pick "Volle Breite", confirm the canvas widens accordingly (Task 2's fix makes this visible).
2. Open `/datenschutz/bearbeiten` — confirm the same field shows only Schmal/Breit, no "Volle Breite" option.
3. Publish the `/ueber-uns` change, reload `/ueber-uns` as a visitor — confirm the public page also renders full width.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/PuckEditor.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(content): make root width a real editor field, gated by slug"
```

---

## Task 4: `Spalten` — asymmetric and 4-column presets

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (`Blocks["Spalten"]`, `Spalten` component config)
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Produces: `Blocks["Spalten"]["anzahl"]` widens to `"2" | "3" | "4" | "1-2" | "2-1"`. A new internal `SPALTEN_LAYOUT` lookup drives both the wrapping grid class and which zones render with a column-span override — every class involved is a literal from this table, never interpolated.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/app/_content/puck-config.test.ts`:

```ts
describe("Spalten presets", () => {
  const render = () => {
    const r = puckConfig.components.Spalten?.render;
    if (!r) throw new Error("Spalten render missing");
    return r;
  };
  const puck = { renderDropZone: ({ zone }: { zone: string }) => `[${zone}]` };

  it("2 and 3 keep their existing equal-column classes", () => {
    const out2 = renderToStaticMarkup(render()({ anzahl: "2", puck } as never));
    expect(out2).toContain("sm:grid-cols-2");
    const out3 = renderToStaticMarkup(render()({ anzahl: "3", puck } as never));
    expect(out3).toContain("sm:grid-cols-3");
  });

  it("4 renders four zones on a four-column grid", () => {
    const out = renderToStaticMarkup(render()({ anzahl: "4", puck } as never));
    expect(out).toContain("lg:grid-cols-4");
    for (const zone of ["spalte-1", "spalte-2", "spalte-3", "spalte-4"]) {
      expect(out).toContain(`[${zone}]`);
    }
  });

  it("1-2 gives the second zone a double column-span", () => {
    const out = renderToStaticMarkup(render()({ anzahl: "1-2", puck } as never));
    expect(out).toContain("sm:col-span-1");
    expect(out).toContain("sm:col-span-2");
  });

  it("2-1 gives the first zone a double column-span", () => {
    const out = renderToStaticMarkup(render()({ anzahl: "2-1", puck } as never));
    const firstSpanIndex = out.indexOf("sm:col-span-2");
    const secondSpanIndex = out.indexOf("sm:col-span-1");
    expect(firstSpanIndex).toBeGreaterThan(-1);
    expect(secondSpanIndex).toBeGreaterThan(firstSpanIndex);
  });

  it("exposes all five options on the anzahl field", () => {
    const anzahl = puckConfig.components.Spalten?.fields?.anzahl;
    if (anzahl?.type !== "select") throw new Error("anzahl must be a select field");
    expect(anzahl.options.map((o) => o.value)).toEqual(["2", "3", "4", "1-2", "2-1"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- puck-config -t "Spalten presets"`
Expected: FAIL — `"4"`/`"1-2"`/`"2-1"` are not valid `anzahl` values yet and the field only has two options.

- [ ] **Step 3: Implement**

Change `Blocks["Spalten"]` from:

```ts
Spalten: {
  anzahl: "2" | "3";
}
```

to:

```ts
Spalten: {
  anzahl: "2" | "3" | "4" | "1-2" | "2-1";
}
```

Add a layout lookup above the `puckConfig` export (near `ausrichtungField`):

```ts
const SPALTEN_LAYOUT: Record<
  Blocks["Spalten"]["anzahl"],
  { grid: string; zonen: { zone: string; span?: string }[] }
> = {
  "2": {
    grid: "grid gap-6 sm:grid-cols-2",
    zonen: [{ zone: "spalte-1" }, { zone: "spalte-2" }],
  },
  "3": {
    grid: "grid gap-6 sm:grid-cols-3",
    zonen: [{ zone: "spalte-1" }, { zone: "spalte-2" }, { zone: "spalte-3" }],
  },
  "4": {
    grid: "grid gap-6 sm:grid-cols-2 lg:grid-cols-4",
    zonen: [{ zone: "spalte-1" }, { zone: "spalte-2" }, { zone: "spalte-3" }, { zone: "spalte-4" }],
  },
  "1-2": {
    grid: "grid gap-6 sm:grid-cols-3",
    zonen: [
      { zone: "spalte-1", span: "sm:col-span-1" },
      { zone: "spalte-2", span: "sm:col-span-2" },
    ],
  },
  "2-1": {
    grid: "grid gap-6 sm:grid-cols-3",
    zonen: [
      { zone: "spalte-1", span: "sm:col-span-2" },
      { zone: "spalte-2", span: "sm:col-span-1" },
    ],
  },
};
```

Replace the `Spalten` component config's `fields.anzahl.options` and `render` — from:

```ts
    Spalten: {
      label: "Spalten",
      fields: {
        anzahl: {
          type: "select",
          label: "Anzahl",
          options: [
            { label: "2 Spalten", value: "2" },
            { label: "3 Spalten", value: "3" },
          ],
        },
      },
      defaultProps: { anzahl: "2" },
      render: ({ anzahl, puck }) => (
        <div className={anzahl === "3" ? "grid gap-6 sm:grid-cols-3" : "grid gap-6 sm:grid-cols-2"}>
          {puck.renderDropZone({ zone: "spalte-1" })}
          {puck.renderDropZone({ zone: "spalte-2" })}
          {anzahl === "3" ? puck.renderDropZone({ zone: "spalte-3" }) : null}
        </div>
      ),
    },
```

to:

```ts
    Spalten: {
      label: "Spalten",
      fields: {
        anzahl: {
          type: "select",
          label: "Anzahl",
          options: [
            { label: "2 Spalten", value: "2" },
            { label: "3 Spalten", value: "3" },
            { label: "4 Spalten", value: "4" },
            { label: "1/3 + 2/3", value: "1-2" },
            { label: "2/3 + 1/3", value: "2-1" },
          ],
        },
      },
      defaultProps: { anzahl: "2" },
      render: ({ anzahl, puck }) => {
        const layout = SPALTEN_LAYOUT[anzahl];
        return (
          <div className={layout.grid}>
            {layout.zonen.map(({ zone, span }) =>
              span ? (
                <div key={zone} className={span}>
                  {puck.renderDropZone({ zone })}
                </div>
              ) : (
                <React.Fragment key={zone}>{puck.renderDropZone({ zone })}</React.Fragment>
              ),
            )}
          </div>
        );
      },
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- puck-config -t "Spalten presets"`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full suite**

Run: `pnpm --filter web test -- puck-config`
Expected: PASS, no regressions — existing 2/3-column pages render identically (same grid classes, same zone names).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter web typecheck`

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(content): add asymmetric and four-column Spalten presets"
```

---

## Task 5: New block — Panel/Kasten

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (`Blocks["Panel"]`, new `Panel` component config)
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Produces: `Blocks["Panel"] = { titel: string; variante: "standard" | "hervorgehoben" }`. Renders a `Card` (from `@bdas/design-system`, already imported) wrapping a single nested `DropZone` named `"inhalt"`. `"hervorgehoben"` adds the same left-accent-border treatment the existing `Zitat` block already uses (`border-l-4 border-bdas-red`) — no new token, reuse of an established pattern.

- [ ] **Step 1: Write the failing tests**

```ts
describe("Panel block", () => {
  it("wraps its DropZone in the design-system Card", () => {
    const render = puckConfig.components.Panel?.render;
    if (!render) throw new Error("Panel render missing");
    const puck = { renderDropZone: ({ zone }: { zone: string }) => `[${zone}]` };
    const out = renderToStaticMarkup(render({ titel: "", variante: "standard", puck } as never));
    expect(out).toContain("[inhalt]");
    expect(out).toMatch(/class="[^"]*rounded-bdas[^"]*"/);
  });

  it("shows the title when set", () => {
    const render = puckConfig.components.Panel?.render;
    if (!render) throw new Error("Panel render missing");
    const puck = { renderDropZone: () => null };
    const out = renderToStaticMarkup(
      render({ titel: "Kontakt", variante: "standard", puck } as never),
    );
    expect(out).toContain("Kontakt");
  });

  it("hervorgehoben adds the accent left-border", () => {
    const render = puckConfig.components.Panel?.render;
    if (!render) throw new Error("Panel render missing");
    const puck = { renderDropZone: () => null };
    const out = renderToStaticMarkup(
      render({ titel: "", variante: "hervorgehoben", puck } as never),
    );
    expect(out).toContain("border-l-4");
    expect(out).toContain("border-bdas-red");
  });

  it("standard variant has no accent border", () => {
    const render = puckConfig.components.Panel?.render;
    if (!render) throw new Error("Panel render missing");
    const puck = { renderDropZone: () => null };
    const out = renderToStaticMarkup(render({ titel: "", variante: "standard", puck } as never));
    expect(out).not.toContain("border-l-4");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- puck-config -t "Panel block"`
Expected: FAIL — `puckConfig.components.Panel` does not exist.

- [ ] **Step 3: Implement**

Add to `Blocks` (after `Organigramm`):

```ts
Panel: {
  titel: string;
  variante: "standard" | "hervorgehoben";
}
```

Add a new component entry to `puckConfig.components` (after `Organigramm`, before the closing `},` of `components`):

```ts
    Panel: {
      label: "Panel / Kasten",
      fields: {
        titel: { type: "text", label: "Titel (optional)" },
        variante: {
          type: "select",
          label: "Variante",
          options: [
            { label: "Standard", value: "standard" },
            { label: "Hervorgehoben", value: "hervorgehoben" },
          ],
        },
      },
      defaultProps: { titel: "", variante: "standard" },
      render: ({ titel, variante, puck }) => (
        <Card
          className={
            variante === "hervorgehoben"
              ? "border-l-4 border-bdas-red p-6"
              : "p-6"
          }
        >
          {titel ? <p className="mb-3 font-semibold text-bdas-ink">{titel}</p> : null}
          {puck.renderDropZone({ zone: "inhalt" })}
        </Card>
      ),
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- puck-config -t "Panel block"`
Expected: PASS (4 tests)

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm --filter web test -- puck-config && pnpm --filter web typecheck`
Expected: PASS

- [ ] **Step 6: Manual verification**

In the editor, drop a Panel block, drop a Fließtext block inside it, toggle Standard/Hervorgehoben, confirm the visual matches Card styling (rounded-bdas, shadow, hover lift) and the accent border only shows on "Hervorgehoben".

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(content): add Panel/Kasten block"
```

---

## Task 6: New block — Akkordeon

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx` (`Blocks["Akkordeon"]`, new `Akkordeon` component config)
- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Produces: `Blocks["Akkordeon"] = { eintraege: { frage: string; antwort: string }[] }`. Renders one `<details className="bdas-accordion">` per entry — the exact global class `apps/web/app/faq/FaqAccordion.tsx` already uses, so this gets the `<details>` idiom from CLAUDE.md §7 (left border + halo on `[open]`, `+`→`×`) for free, with zero new CSS.

- [ ] **Step 1: Write the failing tests**

```ts
describe("Akkordeon block", () => {
  it("shows a placeholder in the editor when empty", () => {
    const render = puckConfig.components.Akkordeon?.render;
    if (!render) throw new Error("Akkordeon render missing");
    const out = renderToStaticMarkup(render({ eintraege: [], puck: { isEditing: true } } as never));
    expect(out).toContain("Noch keine Einträge");
  });

  it("renders one details element per entry using the shared accordion class", () => {
    const render = puckConfig.components.Akkordeon?.render;
    if (!render) throw new Error("Akkordeon render missing");
    const out = renderToStaticMarkup(
      render({
        eintraege: [
          { frage: "Wie trete ich bei?", antwort: "Über das Anmeldeformular." },
          { frage: "Wo treffen wir uns?", antwort: "Immer donnerstags." },
        ],
        puck: { isEditing: false },
      } as never),
    );
    expect((out.match(/class="bdas-accordion"/g) ?? []).length).toBe(2);
    expect(out).toContain("Wie trete ich bei?");
    expect(out).toContain("Über das Anmeldeformular.");
  });

  it("summarises an entry by its question", () => {
    const eintraege = puckConfig.components.Akkordeon?.fields?.eintraege;
    if (eintraege?.type !== "array" || !eintraege.getItemSummary) {
      throw new Error("array field with getItemSummary expected");
    }
    expect(eintraege.getItemSummary({ frage: "Wie trete ich bei?", antwort: "" }, 0)).toBe(
      "Wie trete ich bei?",
    );
    expect(eintraege.getItemSummary({ frage: "", antwort: "" }, 0)).toBe("Neuer Eintrag");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- puck-config -t "Akkordeon block"`
Expected: FAIL — `puckConfig.components.Akkordeon` does not exist.

- [ ] **Step 3: Implement**

Add to `Blocks`:

```ts
Akkordeon: {
  eintraege: {
    frage: string;
    antwort: string;
  }
  [];
}
```

Add a new component entry to `puckConfig.components`:

```ts
    Akkordeon: {
      label: "Akkordeon",
      fields: {
        eintraege: {
          type: "array",
          label: "Einträge",
          arrayFields: {
            frage: { type: "text", label: "Frage" },
            antwort: { type: "textarea", label: "Antwort" },
          },
          defaultItemProps: { frage: "", antwort: "" },
          getItemSummary: (e) => e.frage || "Neuer Eintrag",
        },
      },
      defaultProps: { eintraege: [] },
      render: ({ eintraege, puck }) =>
        (eintraege ?? []).length === 0 && puck?.isEditing ? (
          <BlockPlatzhalter titel="Akkordeon" hinweis="Noch keine Einträge hinzugefügt." />
        ) : (
          <div className="flex flex-col gap-3">
            {(eintraege ?? []).map((e, i) => (
              <details key={i} className="bdas-accordion">
                <summary>{e.frage}</summary>
                <div>
                  <p className="whitespace-pre-line text-bdas-ink-body">{e.antwort}</p>
                </div>
              </details>
            ))}
          </div>
        ),
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- puck-config -t "Akkordeon block"`
Expected: PASS (3 tests)

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm --filter web test -- puck-config && pnpm --filter web typecheck`
Expected: PASS

- [ ] **Step 6: Manual verification**

In the editor, add an Akkordeon block with two entries, confirm it visually matches the FAQ page's accordion (left border + halo on open, `+`→`×` rotation) and that opening one doesn't affect the others (native `<details>` behaviour, no shared state needed).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(content): add Akkordeon block"
```

---

## Task 7: In-editor preview toggle

**Files:**

- Create: `apps/web/app/_content/PreviewToggle.tsx`
- Modify: `apps/web/app/_content/PuckEditor.tsx`
- Test: `apps/web/app/_content/PreviewToggle.test.tsx`

**Interfaces:**

- Produces: `export function PreviewToggle(): JSX.Element` — a header-bar button that reads `usePuck().appState.ui.previewMode` and dispatches `{ type: "setUi", ui: { previewMode: "interactive" | "edit" } }` to flip it. Wired into `<Puck overrides={{ headerActions: ... }}>` in `PuckEditor.tsx`.
- Puck API used (verified against the installed `.d.ts`): `usePuck()` (no selector — the exported `usePuck`, not `createUsePuck()`) returns `{ appState, dispatch, ... }`; `AppState = { data, ui: UiState }`; `UiState.previewMode: "interactive" | "edit"`; `SetUiAction = { type: "setUi"; ui: Partial<UiState> | ((previous: UiState) => Partial<UiState>) }`. `"interactive"` is Puck's own built-in mode that hides editing chrome and renders the canvas as the public page would.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_content/PreviewToggle.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const dispatch = vi.fn();
let previewMode: "interactive" | "edit" = "edit";

vi.mock("@puckeditor/core", () => ({
  usePuck: () => ({ appState: { ui: { previewMode } }, dispatch }),
}));

import { PreviewToggle } from "./PreviewToggle";

describe("PreviewToggle", () => {
  it("labels itself 'Vorschau' while editing", () => {
    previewMode = "edit";
    const out = renderToStaticMarkup(<PreviewToggle />);
    expect(out).toContain("Vorschau");
  });

  it("labels itself 'Bearbeiten' while in preview", () => {
    previewMode = "interactive";
    const out = renderToStaticMarkup(<PreviewToggle />);
    expect(out).toContain("Bearbeiten");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- PreviewToggle`
Expected: FAIL — `./PreviewToggle` does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/app/_content/PreviewToggle.tsx`:

```tsx
"use client";

import { usePuck } from "@puckeditor/core";

/** Header-bar toggle for Puck's built-in preview mode. "interactive" hides
 *  every editing affordance (selection outlines, drag handles, drop-zone
 *  placeholders) and renders the canvas exactly as the public `<Render>`
 *  would — the board can see the real page without publishing first.
 *  Editing stays disabled in that mode; the button switches back to "edit"
 *  to resume. */
export function PreviewToggle() {
  const { appState, dispatch } = usePuck();
  const isPreview = appState.ui.previewMode === "interactive";

  return (
    <button
      type="button"
      onClick={() =>
        dispatch({ type: "setUi", ui: { previewMode: isPreview ? "edit" : "interactive" } })
      }
      className="inline-flex items-center rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
    >
      {isPreview ? "Bearbeiten" : "Vorschau"}
    </button>
  );
}
```

In `apps/web/app/_content/PuckEditor.tsx`, add the import:

```tsx
import { PreviewToggle } from "./PreviewToggle";
```

and wire it into `<Puck>` — change:

```tsx
        <Puck
          config={puckConfig}
          data={data}
          metadata={metadata}
          headerTitle="BDAS Editor"
          headerPath={`/${slug}`}
          onPublish={async (data: Data) => {
```

to:

```tsx
        <Puck
          config={puckConfig}
          data={data}
          metadata={metadata}
          headerTitle="BDAS Editor"
          headerPath={`/${slug}`}
          overrides={{
            headerActions: ({ children }) => (
              <>
                <PreviewToggle />
                {children}
              </>
            ),
          }}
          onPublish={async (data: Data) => {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- PreviewToggle`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS

- [ ] **Step 6: Manual verification**

Open any `bearbeiten` route. Confirm a "Vorschau" button appears in the header actions. Click it: selection outlines/drag handles disappear, the canvas looks like the public page, the button now reads "Bearbeiten". Click again to return to normal editing. Confirm `save = live` behaviour is untouched — the toggle never calls `onPublish`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_content/PreviewToggle.tsx apps/web/app/_content/PreviewToggle.test.tsx apps/web/app/_content/PuckEditor.tsx
git commit -m "feat(content): add in-editor preview toggle"
```

---

## Self-Review Notes

**Spec coverage:** §4 Root-Breite → Tasks 1–3. §5 Spalten-Presets → Task 4. §6 Panel + Akkordeon → Tasks 5–6. §9 Preview-Umschalter → Task 7. §12's open question ("exact preview mechanism") is resolved by Task 7's verified `usePuck`/`setUi`/`previewMode` API — no longer open.

**Placeholder scan:** no TBD/TODO; every step carries real code or a concrete manual-verification script. Task 2 explicitly explains and justifies skipping an automated test (Server Component route, no existing precedent for testing routes directly in this suite) rather than leaving a vague "add tests" step.

**Type consistency:** `Breite`, `breiteClass`, `normalizeContent` (Task 1) are reused unchanged by Tasks 2–3. `SPALTEN_LAYOUT` keys (Task 4) match `Blocks["Spalten"]["anzahl"]` exactly via the `Record<Blocks["Spalten"]["anzahl"], ...>` type, so a mismatched key is a compile error, not a runtime surprise. `LEGAL_SLUGS`/`breiteField`/`breiteFieldOhneVoll` (Task 3) are only introduced once and consumed once.

**Not in this plan (deferred to later PRs per the spec's §10 sequencing):** Hero/Header-Section (PR2), Feature-/Karten-Grid + Stats (PR3), CTA-Banner (PR4), Karussell + `embla-carousel-react` (PR5).

---

Plan complete and saved to `docs/superpowers/plans/2026-09-08-content-pages-layout-pr1-fundament.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
