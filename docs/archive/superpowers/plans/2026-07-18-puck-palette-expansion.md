# Puck Editor Palette Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the one shared Puck block palette (used by all four board-editable content pages) with rich text, image, button, callout, divider/spacer, and column-layout blocks — keeping ADR 0023's "no raw HTML" safety property.

**Architecture:** Everything lives in `apps/web/app/_content/` (Puck is an `apps/web`-only concern per ADR 0023). Rich text = a Tiptap WYSIWYG custom field that stores ProseMirror JSON, rendered by a small typed allow-list renderer (`renderRichText`) — no HTML string, no `dangerouslySetInnerHTML`, no `sanitize-html`. New blocks are added to the single `puckConfig.components`, so they appear in every colleague's editor on every page and render identically. No `content` module, schema, migration, or feature-flag change.

**Tech Stack:** TypeScript, Next.js 14 App Router, `@puckeditor/core` 0.22.2 (`Config`, `Render`, `DropZone`), `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-link` (already repo deps), React, vitest (node env), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-18-puck-palette-expansion-design.md`

## Global Constraints

- All new code lives under `apps/web/app/_content/`. Do not touch the `content` module, its schema, the `[...slug]` API route, or the upload route.
- **No raw HTML, ever.** Rich text is structured JSON → an allow-list of React elements. No `dangerouslySetInnerHTML`; no `sanitize-html`; no `@tiptap/html`.
- **Design tokens only** (CLAUDE.md §7) — no inline hex/radius/shadow/duration. Use the `bdas-*` Tailwind classes already used in the codebase (e.g. `text-bdas-ink-body`, `text-bdas-ink-muted`, `rounded-bdas`, `rounded-bdas-sm`, `border-bdas-soft`, `border-bdas-strong`, `bg-bdas-surface-hover`, `bg-bdas-overlay-hover`, `bg-bdas-red`, `text-bdas-red`, `duration-bdas-quick`, `ease-bdas`).
- **Every anchor** (Button + rich-text link mark) goes through `safeHref` (accept `http(s)`/relative/`#` only); external links get `rel="noopener noreferrer" target="_blank"`.
- German UI labels; Puck chrome stays English (ADR 0023).
- Component keys are ASCII (`Fliesstext`, not `Fließtext`); the German label carries the `ß`/`ü`.
- Backward compatibility: the existing `Absatz` and `PersonenRaster` blocks and their stored documents keep working unchanged.
- Test env is **node** (vitest, no jsdom) — unit-test render output with `renderToStaticMarkup` from `react-dom/server`.
- Run a single test file with: `npx vitest run <path>`. Typecheck with: `pnpm --filter @bdas/web run typecheck`.
- Commits end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- `apps/web/app/_content/href.ts` _(new)_ — `safeHref` / `isExternalHref` URL guard. Consumed by the renderer and the Button block.
- `apps/web/app/_content/href.test.ts` _(new)_.
- `apps/web/app/_content/rich-text.tsx` _(new)_ — `renderRichText(doc)` typed ProseMirror-JSON → React renderer.
- `apps/web/app/_content/rich-text.test.ts` _(new)_.
- `apps/web/app/_content/rich-text-config.ts` _(new)_ — `RICH_TEXT_STARTERKIT_CONFIG` (editor-side disabled-nodes allow-set; kept dependency-free so it is unit-testable in node).
- `apps/web/app/_content/rich-text-config.test.ts` _(new)_.
- `apps/web/app/_content/RichTextField.tsx` _(new)_ — client Tiptap editor custom field + toolbar.
- `apps/web/app/_content/puck-config.tsx` _(modify)_ — add `Fliesstext`, `Bild`, `Button`, `Zitat`, `Trenner`, `Abstand`, `Spalten` components (+ optional `categories`).
- `apps/web/app/_content/puck-config.test.ts` _(modify)_ — replace the exhaustive-keys assertion; add per-block structural + render tests.
- `apps/web/app/_content/FotoField.tsx` _(reuse as-is)_ — already generic `{value,onChange}` URL field; consumed by both `Bild` and `PersonenRaster`. No change.
- `e2e/content-pages.e2e.ts` _(modify)_ — one author→publish→visitor round-trip for a new block.
- `docs/decisions/0025-puck-palette-expansion.md` _(new)_ — ADR.

---

### Task 1: `safeHref` URL guard

**Files:**

- Create: `apps/web/app/_content/href.ts`
- Test: `apps/web/app/_content/href.test.ts`

**Interfaces:**

- Produces: `safeHref(raw: string): string | null` — trims; returns the original string for `http:`/`https:` absolute URLs, site-relative (`/…`, not `//…`), and in-page (`#…`) hrefs; returns `null` for everything else (`javascript:`, `data:`, `mailto:`, protocol-relative `//…`, empty, malformed). `isExternalHref(href: string): boolean` — true for absolute `http(s)://` URLs.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/_content/href.test.ts
import { describe, expect, it } from "vitest";

import { isExternalHref, safeHref } from "./href";

describe("safeHref", () => {
  it("accepts http, https, relative and anchor hrefs unchanged", () => {
    expect(safeHref("https://bdaj.de")).toBe("https://bdaj.de");
    expect(safeHref("http://example.org/x")).toBe("http://example.org/x");
    expect(safeHref("/impressum")).toBe("/impressum");
    expect(safeHref("#kontakt")).toBe("#kontakt");
    expect(safeHref("  https://bdaj.de  ")).toBe("https://bdaj.de");
  });

  it("rejects unsafe or malformed hrefs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("mailto:a@b.de")).toBeNull();
    expect(safeHref("//evil.com")).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref("   ")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });
});

describe("isExternalHref", () => {
  it("is true only for absolute http(s) URLs", () => {
    expect(isExternalHref("https://bdaj.de")).toBe(true);
    expect(isExternalHref("http://x.de")).toBe(true);
    expect(isExternalHref("/impressum")).toBe(false);
    expect(isExternalHref("#kontakt")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/app/_content/href.test.ts`
Expected: FAIL — cannot resolve `./href`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/app/_content/href.ts
/**
 * URL guard for board-authored links. Accepts only http(s), site-relative
 * ("/…") and in-page ("#…") hrefs; everything else (javascript:, data:,
 * mailto:, protocol-relative, malformed) is rejected. Returns the original
 * (trimmed) string so authored URLs are preserved verbatim.
 */
export function safeHref(raw: string): string | null {
  const v = raw.trim();
  if (v === "") return null;
  if (v.startsWith("//")) return null;
  if (v.startsWith("/") || v.startsWith("#")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

/** True for absolute http(s) URLs — these get rel/target on render. */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/app/_content/href.test.ts`
Expected: PASS (2 files? no — 1 file, all assertions green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/href.ts apps/web/app/_content/href.test.ts
git commit -m "feat(web): safeHref guard for board-authored links

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `renderRichText` typed renderer

**Files:**

- Create: `apps/web/app/_content/rich-text.tsx`
- Test: `apps/web/app/_content/rich-text.test.ts`

**Interfaces:**

- Consumes: `safeHref`, `isExternalHref` from `./href`.
- Produces: `renderRichText(doc: unknown): ReactNode`. Renders only: `doc` root, `paragraph`, `text` (+ marks `bold`→`<strong>`, `italic`→`<em>`, `link`→validated `<a>`), `bulletList`/`orderedList`/`listItem`, `hardBreak`. Unknown nodes render their children (text survives) with no wrapper; unknown marks are ignored; invalid link hrefs degrade to plain text. Returns `null` when `doc` is not a `{ type: "doc", content: [...] }` object.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/_content/rich-text.test.ts
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderRichText } from "./rich-text";

const doc = (content: unknown[]) => ({ type: "doc", content });
const para = (content: unknown[]) => ({ type: "paragraph", content });
const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, marks });
const html = (d: unknown) => renderToStaticMarkup(renderRichText(d) as never);

describe("renderRichText", () => {
  it("renders bold and italic marks", () => {
    const out = html(
      doc([
        para([
          text("Hallo "),
          text("Welt", [{ type: "bold" }]),
          text(" "),
          text("!", [{ type: "italic" }]),
        ]),
      ]),
    );
    expect(out).toContain("<strong>Welt</strong>");
    expect(out).toContain("<em>!</em>");
  });

  it("keeps an unsafe link as plain text (no anchor)", () => {
    const out = html(
      doc([para([text("klick", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])])]),
    );
    expect(out).not.toContain("<a");
    expect(out).toContain("klick");
  });

  it("adds rel and target to external links", () => {
    const out = html(
      doc([para([text("bdaj", [{ type: "link", attrs: { href: "https://bdaj.de" } }])])]),
    );
    expect(out).toContain('href="https://bdaj.de"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it("renders internal links without a target", () => {
    const out = html(
      doc([para([text("intern", [{ type: "link", attrs: { href: "/impressum" } }])])]),
    );
    expect(out).toContain('href="/impressum"');
    expect(out).not.toContain("target=");
  });

  it("renders bullet lists", () => {
    const out = html(
      doc([
        { type: "bulletList", content: [{ type: "listItem", content: [para([text("eins")])] }] },
      ]),
    );
    expect(out).toContain("<ul");
    expect(out).toContain("<li>");
    expect(out).toContain("eins");
  });

  it("drops unknown nodes but keeps their text", () => {
    const out = html(doc([{ type: "codeBlock", content: [text("x = 1")] }]));
    expect(out).toContain("x = 1");
    expect(out).not.toContain("<code");
  });

  it("returns null for non-doc input", () => {
    expect(renderRichText(null)).toBeNull();
    expect(renderRichText({ foo: 1 })).toBeNull();
    expect(renderRichText("string")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/app/_content/rich-text.test.ts`
Expected: FAIL — cannot resolve `./rich-text`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/app/_content/rich-text.tsx
import { Fragment, type ReactNode } from "react";

import { isExternalHref, safeHref } from "./href";

type Mark = { type?: string; attrs?: Record<string, unknown> };
type Node = {
  type?: string;
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
  content?: Node[];
};

function renderChildren(nodes: Node[] | undefined): ReactNode[] {
  return (nodes ?? []).map((n, i) => <Fragment key={i}>{renderNode(n)}</Fragment>);
}

function applyMarks(value: string, marks: Mark[] | undefined): ReactNode {
  let node: ReactNode = value;
  for (const mark of marks ?? []) {
    if (mark.type === "bold") node = <strong>{node}</strong>;
    else if (mark.type === "italic") node = <em>{node}</em>;
    else if (mark.type === "link") {
      const href = safeHref(String(mark.attrs?.["href"] ?? ""));
      if (href) {
        node = isExternalHref(href) ? (
          <a href={href} rel="noopener noreferrer" target="_blank">
            {node}
          </a>
        ) : (
          <a href={href}>{node}</a>
        );
      }
      // invalid href → leave text unwrapped
    }
    // unknown marks ignored
  }
  return node;
}

function renderNode(node: Node): ReactNode {
  switch (node.type) {
    case "text":
      return applyMarks(node.text ?? "", node.marks);
    case "paragraph":
      return <p className="text-bdas-ink-body">{renderChildren(node.content)}</p>;
    case "bulletList":
      return <ul className="list-disc pl-6 text-bdas-ink-body">{renderChildren(node.content)}</ul>;
    case "orderedList":
      return (
        <ol className="list-decimal pl-6 text-bdas-ink-body">{renderChildren(node.content)}</ol>
      );
    case "listItem":
      return <li>{renderChildren(node.content)}</li>;
    case "hardBreak":
      return <br />;
    default:
      return <>{renderChildren(node.content)}</>;
  }
}

/** ProseMirror/Tiptap JSON → React. Allow-list only; no raw HTML (ADR 0023). */
export function renderRichText(doc: unknown): ReactNode {
  if (!doc || typeof doc !== "object") return null;
  const root = doc as Node;
  if (root.type !== "doc" || !Array.isArray(root.content)) return null;
  return <>{renderChildren(root.content)}</>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/app/_content/rich-text.test.ts`
Expected: PASS (all 7 assertions green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/rich-text.tsx apps/web/app/_content/rich-text.test.ts
git commit -m "feat(web): typed rich-text renderer (no raw HTML)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Tiptap editor field + allow-set config

**Files:**

- Create: `apps/web/app/_content/rich-text-config.ts`
- Test: `apps/web/app/_content/rich-text-config.test.ts`
- Create: `apps/web/app/_content/RichTextField.tsx`

**Interfaces:**

- Produces: `RICH_TEXT_STARTERKIT_CONFIG` (const object of StarterKit nodes disabled for Fließtext). `RichTextField({ value, onChange }: { value: unknown; onChange: (doc: unknown) => void })` — client component; `onChange` receives Tiptap JSON (`editor.getJSON()`).
- Consumes (RichTextField): `RICH_TEXT_STARTERKIT_CONFIG`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/_content/rich-text-config.test.ts
import { describe, expect, it } from "vitest";

import { RICH_TEXT_STARTERKIT_CONFIG } from "./rich-text-config";

describe("RICH_TEXT_STARTERKIT_CONFIG", () => {
  it("disables exactly the block-level nodes that are their own Puck blocks", () => {
    expect(RICH_TEXT_STARTERKIT_CONFIG).toEqual({
      heading: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/app/_content/rich-text-config.test.ts`
Expected: FAIL — cannot resolve `./rich-text-config`.

- [ ] **Step 3: Write the config + the editor field**

```ts
// apps/web/app/_content/rich-text-config.ts
/**
 * Editor-side allow-set: StarterKit nodes/marks disabled for Fließtext because
 * headings, quotes and dividers are their own Puck blocks. Kept dependency-free
 * so it is unit-testable in the node test env. The render side (rich-text.tsx)
 * allow-lists on top of this — defence in depth.
 */
export const RICH_TEXT_STARTERKIT_CONFIG = {
  heading: false,
  blockquote: false,
  code: false,
  codeBlock: false,
  horizontalRule: false,
  strike: false,
} as const;
```

```tsx
// apps/web/app/_content/RichTextField.tsx
"use client";

import Link from "@tiptap/extension-link";
import { EditorContent, useEditor, type Content } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { RICH_TEXT_STARTERKIT_CONFIG } from "./rich-text-config";

const EXTENSIONS = [
  StarterKit.configure(RICH_TEXT_STARTERKIT_CONFIG),
  Link.configure({ openOnClick: false, autolink: false }),
];

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

function ToolbarButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-bdas-sm border px-2 py-1 text-sm text-bdas-ink " +
        (active ? "border-bdas-strong bg-bdas-surface-hover" : "border-bdas-soft")
      }
    >
      {label}
    </button>
  );
}

/** Puck custom field: Tiptap WYSIWYG storing ProseMirror JSON (rendered by
 *  renderRichText). No HTML is ever produced. */
export function RichTextField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (doc: unknown) => void;
}) {
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: (value as Content) ?? EMPTY_DOC,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      attributes: {
        class:
          "prose max-w-none min-h-[6rem] rounded-bdas border border-bdas-soft bg-bdas-surface p-3 focus:outline-none",
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <ToolbarButton
          active={editor.isActive("bold")}
          label="Fett"
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          active={editor.isActive("italic")}
          label="Kursiv"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          active={editor.isActive("bulletList")}
          label="Liste"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          active={editor.isActive("orderedList")}
          label="Nummeriert"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          active={editor.isActive("link")}
          label="Link"
          onClick={() => {
            const prev = (editor.getAttributes("link")["href"] as string | undefined) ?? "";
            const url = window.prompt("Link-URL (https://… oder /pfad)", prev);
            if (url === null) return;
            if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 4: Run the config test + typecheck**

Run: `npx vitest run apps/web/app/_content/rich-text-config.test.ts`
Expected: PASS.
Run: `pnpm --filter @bdas/web run typecheck`
Expected: no errors (RichTextField compiles; the Tiptap editor itself is exercised by the E2E in Task 8).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/rich-text-config.ts apps/web/app/_content/rich-text-config.test.ts apps/web/app/_content/RichTextField.tsx
git commit -m "feat(web): Tiptap rich-text editor field for content pages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `Fließtext` block (wire field + renderer into the palette)

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx`
- Modify: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `RichTextField` (Task 3), `renderRichText` (Task 2).
- Produces: `puckConfig.components.Fliesstext` (label "Fließtext"; custom field `inhalt`; renders `renderRichText(inhalt)`).

- [ ] **Step 1: Replace the exhaustive-keys test and add the Fließtext test**

In `apps/web/app/_content/puck-config.test.ts`, **delete** the existing test block:

```ts
it("offers exactly the three approved blocks", () => {
  expect(Object.keys(puckConfig.components).sort()).toEqual([
    "Absatz",
    "PersonenRaster",
    "Ueberschrift",
  ]);
});
```

and add, at the top of the `describe("puckConfig", …)` body:

```ts
it("keeps the legacy Absatz and PersonenRaster blocks", () => {
  expect(puckConfig.components.Absatz).toBeDefined();
  expect(puckConfig.components.PersonenRaster).toBeDefined();
});

it("exposes the Fließtext rich-text block", () => {
  const inhalt = puckConfig.components.Fliesstext?.fields?.inhalt;
  expect(inhalt?.type).toBe("custom");
});
```

- [ ] **Step 2: Run to verify the new test fails**

Run: `npx vitest run apps/web/app/_content/puck-config.test.ts`
Expected: FAIL — `puckConfig.components.Fliesstext` is undefined.

- [ ] **Step 3: Add the Fließtext component to `puck-config.tsx`**

Add imports at the top of `puck-config.tsx`:

```tsx
import { RichTextField } from "./RichTextField";
import { renderRichText } from "./rich-text";
```

Add `Fliesstext` to the `Blocks` type:

```tsx
Fliesstext: {
  inhalt: unknown;
}
```

Add this entry inside `components` (after `Absatz`):

```tsx
    Fliesstext: {
      label: "Fließtext",
      fields: {
        inhalt: {
          type: "custom",
          label: "Text",
          render: ({ value, onChange }) => <RichTextField value={value} onChange={onChange} />,
        },
      },
      defaultProps: { inhalt: { type: "doc", content: [{ type: "paragraph" }] } },
      render: ({ inhalt }) => <>{renderRichText(inhalt)}</>,
    },
```

- [ ] **Step 4: Add a render test and run all `_content` tests**

Append to `puck-config.test.ts`:

```ts
import { renderToStaticMarkup } from "react-dom/server";

// … inside describe("puckConfig", …):
it("Fließtext renders stored rich text", () => {
  const render = puckConfig.components.Fliesstext?.render;
  if (!render) throw new Error("Fliesstext render missing");
  const out = renderToStaticMarkup(
    render({
      inhalt: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Hi", marks: [{ type: "bold" }] }] },
        ],
      },
      puck: { renderDropZone: () => null, isEditing: false, dragRef: null, metadata: {} },
    } as never) as never,
  );
  expect(out).toContain("<strong>Hi</strong>");
});
```

Run: `npx vitest run apps/web/app/_content/puck-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(web): Fließtext rich-text block in the shared palette

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `Bild` and `Button` blocks

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx`
- Modify: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `FotoField` (existing), `safeHref`/`isExternalHref` (Task 1).
- Produces: `puckConfig.components.Bild` (`bild`, `altText`, `bildunterschrift`, `breite`) and `.Button` (`label`, `href`, `variante`).

- [ ] **Step 1: Write failing structural + render tests**

Append to `puck-config.test.ts`:

```ts
it("Bild renders an accessible image and hides when empty", () => {
  const render = puckConfig.components.Bild?.render;
  if (!render) throw new Error("Bild render missing");
  const withImg = renderToStaticMarkup(
    render({
      bild: "https://cdn.test/x.jpg",
      altText: "Gruppenfoto",
      bildunterschrift: "",
      breite: "voll",
      puck: {},
    } as never) as never,
  );
  expect(withImg).toContain('alt="Gruppenfoto"');
  const empty = renderToStaticMarkup(
    render({
      bild: "",
      altText: "",
      bildunterschrift: "",
      breite: "voll",
      puck: {},
    } as never) as never,
  );
  expect(empty).toBe("");
});

it("Button applies safeHref and rel/target for external links", () => {
  const render = puckConfig.components.Button?.render;
  if (!render) throw new Error("Button render missing");
  const ext = renderToStaticMarkup(
    render({
      label: "BDAJ",
      href: "https://bdaj.de",
      variante: "primaer",
      puck: {},
    } as never) as never,
  );
  expect(ext).toContain('href="https://bdaj.de"');
  expect(ext).toContain('rel="noopener noreferrer"');
  const bad = renderToStaticMarkup(
    render({
      label: "x",
      href: "javascript:alert(1)",
      variante: "primaer",
      puck: {},
    } as never) as never,
  );
  expect(bad).toBe("");
  const internal = renderToStaticMarkup(
    render({
      label: "Impressum",
      href: "/impressum",
      variante: "sekundaer",
      puck: {},
    } as never) as never,
  );
  expect(internal).toContain('href="/impressum"');
  expect(internal).not.toContain("target=");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run apps/web/app/_content/puck-config.test.ts`
Expected: FAIL — `Bild`/`Button` render missing.

- [ ] **Step 3: Implement the blocks**

Add imports:

```tsx
import { isExternalHref, safeHref } from "./href";
```

(`FotoField` is already imported.) Extend the `Blocks` type:

```tsx
Bild: {
  bild: string;
  altText: string;
  bildunterschrift: string;
  breite: "voll" | "halb";
}
Button: {
  label: string;
  href: string;
  variante: "primaer" | "sekundaer";
}
```

Add to `components`:

```tsx
    Bild: {
      label: "Bild",
      fields: {
        bild: {
          type: "custom",
          label: "Bild",
          render: ({ value, onChange }) => <FotoField value={value} onChange={onChange} />,
        },
        altText: { type: "text", label: "Alt-Text (Barrierefreiheit)" },
        bildunterschrift: { type: "text", label: "Bildunterschrift (optional)" },
        breite: {
          type: "select",
          label: "Breite",
          options: [
            { label: "Volle Breite", value: "voll" },
            { label: "Halbe Breite", value: "halb" },
          ],
        },
      },
      defaultProps: { bild: "", altText: "", bildunterschrift: "", breite: "voll" },
      render: ({ bild, altText, bildunterschrift, breite }) =>
        bild ? (
          <figure className={breite === "halb" ? "sm:max-w-md" : "w-full"}>
            <img src={bild} alt={altText} className="w-full rounded-bdas" />
            {bildunterschrift ? (
              <figcaption className="mt-2 text-sm text-bdas-ink-muted">{bildunterschrift}</figcaption>
            ) : null}
          </figure>
        ) : null,
    },
    Button: {
      label: "Button",
      fields: {
        label: { type: "text", label: "Beschriftung" },
        href: { type: "text", label: "Link (https://… oder /pfad)" },
        variante: {
          type: "select",
          label: "Variante",
          options: [
            { label: "Primär", value: "primaer" },
            { label: "Sekundär", value: "sekundaer" },
          ],
        },
      },
      defaultProps: { label: "Mehr erfahren", href: "", variante: "primaer" },
      render: ({ label, href, variante }) => {
        const safe = safeHref(href);
        if (!safe) return null;
        const cls =
          variante === "sekundaer"
            ? "inline-flex items-center rounded-bdas-sm border border-bdas-strong px-4 py-2 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
            : "inline-flex items-center rounded-bdas-sm bg-bdas-red px-4 py-2 text-sm font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:opacity-90";
        return isExternalHref(safe) ? (
          <a href={safe} rel="noopener noreferrer" target="_blank" className={cls}>
            {label}
          </a>
        ) : (
          <a href={safe} className={cls}>
            {label}
          </a>
        );
      },
    },
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/web/app/_content/puck-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(web): Bild and Button blocks (validated hrefs, a11y alt)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `Zitat`, `Trenner`, `Abstand` blocks

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx`
- Modify: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Produces: `puckConfig.components.Zitat` (`text`, `quelle`), `.Trenner` (no fields), `.Abstand` (`hoehe`).

- [ ] **Step 1: Write failing tests**

Append to `puck-config.test.ts`:

```ts
it("Zitat renders text and an optional source", () => {
  const render = puckConfig.components.Zitat?.render;
  if (!render) throw new Error("Zitat render missing");
  const out = renderToStaticMarkup(
    render({ text: "Ein Zitat", quelle: "BSR", puck: {} } as never) as never,
  );
  expect(out).toContain("Ein Zitat");
  expect(out).toContain("BSR");
  expect(out).toContain("<blockquote");
});

it("Trenner renders a horizontal rule", () => {
  const render = puckConfig.components.Trenner?.render;
  if (!render) throw new Error("Trenner render missing");
  expect(renderToStaticMarkup(render({ puck: {} } as never) as never)).toContain("<hr");
});

it("Abstand renders a spacer sized by hoehe", () => {
  const render = puckConfig.components.Abstand?.render;
  if (!render) throw new Error("Abstand render missing");
  expect(renderToStaticMarkup(render({ hoehe: "gross", puck: {} } as never) as never)).toContain(
    "h-16",
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run apps/web/app/_content/puck-config.test.ts`
Expected: FAIL — the three renders are missing.

- [ ] **Step 3: Implement the blocks**

Extend the `Blocks` type:

```tsx
Zitat: {
  text: string;
  quelle: string;
}
Trenner: Record<string, never>;
Abstand: {
  hoehe: "klein" | "mittel" | "gross";
}
```

Add to `components`:

```tsx
    Zitat: {
      label: "Zitat / Hinweis",
      fields: {
        text: { type: "textarea", label: "Text" },
        quelle: { type: "text", label: "Quelle (optional)" },
      },
      defaultProps: { text: "", quelle: "" },
      render: ({ text, quelle }) => (
        <blockquote className="rounded-bdas border-l-4 border-bdas-red bg-bdas-overlay-hover px-4 py-3">
          <p className="whitespace-pre-line text-bdas-ink-body">{text}</p>
          {quelle ? <footer className="mt-2 text-sm text-bdas-ink-muted">— {quelle}</footer> : null}
        </blockquote>
      ),
    },
    Trenner: {
      label: "Trenner",
      fields: {},
      defaultProps: {},
      render: () => <hr className="border-t border-bdas-soft" />,
    },
    Abstand: {
      label: "Abstand",
      fields: {
        hoehe: {
          type: "select",
          label: "Höhe",
          options: [
            { label: "Klein", value: "klein" },
            { label: "Mittel", value: "mittel" },
            { label: "Groß", value: "gross" },
          ],
        },
      },
      defaultProps: { hoehe: "mittel" },
      render: ({ hoehe }) => (
        <div aria-hidden className={hoehe === "klein" ? "h-4" : hoehe === "gross" ? "h-16" : "h-8"} />
      ),
    },
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/web/app/_content/puck-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(web): Zitat, Trenner and Abstand blocks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `Spalten` column layout (DropZones)

**Files:**

- Modify: `apps/web/app/_content/puck-config.tsx`
- Modify: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `DropZone` from `@puckeditor/core`.
- Produces: `puckConfig.components.Spalten` (`anzahl: "2" | "3"`) rendering a responsive grid of `DropZone`s (`spalte-1`, `spalte-2`, and `spalte-3` when `anzahl === "3"`).

- [ ] **Step 1: Write a failing structural test**

Append to `puck-config.test.ts`:

```ts
it("Spalten offers a 2/3 column select", () => {
  const anzahl = puckConfig.components.Spalten?.fields?.anzahl;
  if (anzahl?.type !== "select") throw new Error("Spalten needs an anzahl select");
  expect(anzahl.options?.map((o) => o.value)).toEqual(["2", "3"]);
});
```

(Do **not** render-test `Spalten` with `renderToStaticMarkup` — `DropZone` requires Puck context and will not render standalone.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run apps/web/app/_content/puck-config.test.ts`
Expected: FAIL — `Spalten` undefined.

- [ ] **Step 3: Implement `Spalten`**

Extend the top import from `@puckeditor/core` in `puck-config.tsx` to include `DropZone`:

```tsx
import { DropZone, type Config } from "@puckeditor/core";
```

Extend the `Blocks` type:

```tsx
Spalten: {
  anzahl: "2" | "3";
}
```

Add to `components`:

```tsx
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
      render: ({ anzahl }) => (
        <div className={anzahl === "3" ? "grid gap-6 sm:grid-cols-3" : "grid gap-6 sm:grid-cols-2"}>
          <DropZone zone="spalte-1" />
          <DropZone zone="spalte-2" />
          {anzahl === "3" ? <DropZone zone="spalte-3" /> : null}
        </div>
      ),
    },
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run apps/web/app/_content/puck-config.test.ts`
Expected: PASS.
Run: `pnpm --filter @bdas/web run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_content/puck-config.tsx apps/web/app/_content/puck-config.test.ts
git commit -m "feat(web): Spalten column-layout block via Puck DropZones

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: E2E round-trip, ADR, and final verification

**Files:**

- Modify: `e2e/content-pages.e2e.ts`
- Create: `docs/decisions/0025-puck-palette-expansion.md`

**Interfaces:**

- Consumes: existing `deleteUserByEmail`, `registerVerifyLogin` helpers; federal `federal@e2e.bdas.test`.

- [ ] **Step 1: Add an author→publish→visitor E2E for a new block**

Add this test inside the `test.describe("content pages", …)` block in `e2e/content-pages.e2e.ts`:

```ts
test("federal board adds a Button block and the visitor sees the link", async ({ page }) => {
  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, { email: FEDERAL_EMAIL, firstName: "Fed", lastName: "Eral" });

  await page.goto("/ueber-uns/bdaj/bearbeiten");
  // Add the Button block from the Puck component list, then fill its fields.
  await page.getByText("Button", { exact: true }).click();
  await page.getByLabel("Beschriftung").fill("Zur BDAJ-Website");
  await page.getByLabel(/^Link/).fill("https://bdaj.de");
  // Publish (open the collapsed menu bar on mobile chrome — see BSR test note).
  await page.getByRole("button", { name: "Toggle menu bar" }).click();
  await page.getByText("Publish", { exact: true }).click();

  await page.goto("/ueber-uns/bdaj");
  const link = page.getByRole("link", { name: "Zur BDAJ-Website" });
  await expect(link).toHaveAttribute("href", "https://bdaj.de");
  await expect(link).toHaveAttribute("rel", /noopener/);
});
```

Note: this test depends on Puck's DnD-free "click to add" behaviour. If the installed Puck build requires a drag to add a component, fall back to dragging the "Button" item onto the canvas with `page.dragAndDrop` — but try the click first; Puck 0.22 adds a component to the root on click.

- [ ] **Step 2: Run the E2E locally (needs Docker Postgres + flags)**

Run:

```bash
pnpm db:up
BDAS_FLAG_CONTENT=true BDAS_FLAG_PUBLIC_SHELL=true \
  BDAS_FEDERAL_BOARD_EMAILS=federal@e2e.bdas.test \
  pnpm e2e content-pages
```

Expected: the new test passes (plus the existing content-page tests). If the local env cannot run Playwright, rely on CI — the `E2E acceptance (Playwright, §23)` job has these env vars set.

- [ ] **Step 3: Write ADR 0025**

```markdown
# ADR 0025 — Puck editor palette expansion

- **Status:** Accepted
- **Date:** 2026-07-18
- **Supersedes:** —
- **Superseded by:** —

## Context

ADR 0023 shipped a deliberately small three-block palette (Überschrift, Absatz,
Personen-Raster) and explicitly excluded rich text ("no raw-HTML block, ever;
text renders React-escaped"). In use the board found it too weak: no inline
formatting, no images/buttons/callouts, no multi-column layout.

## Decision

- Expand the single shared `puckConfig` (apps/web) with Fließtext (rich text),
  Bild, Button, Zitat, Trenner, Abstand and Spalten blocks. Because the config
  is shared by the editor and the renderer across all four content pages, the
  expansion applies everywhere with no per-page wiring.
- **Rich text keeps ADR 0023's no-raw-HTML guarantee.** The editor is a Tiptap
  WYSIWYG restricted to an allow-set (bold, italic, link, bullet/numbered
  lists); its ProseMirror JSON is stored in the Puck document and rendered by a
  small typed renderer that emits an allow-list of React elements. No HTML
  string is stored or injected; no `dangerouslySetInnerHTML`, no `sanitize-html`
  (the events module's approach — deliberately not reused, to avoid loosening
  the promise). Links are validated (`safeHref`) and get `rel="noopener
noreferrer"` when external.
- No `content` module, schema, migration, or feature-flag change (the stored-doc
  schema already validates props opaquely and permits column zones).
- The legacy Absatz block is retained unchanged for backward compatibility.

## Consequences

- The palette is no longer "deliberately small"; every block is maintenance, but
  each is small, token-styled, and independently tested.
- The content and events modules keep separate rich-text pipelines (content:
  JSON→React allow-list; events: JSON→sanitized HTML). Consolidating into a
  shared `core/` package is deferred until a third consumer appears (YAGNI).
```

- [ ] **Step 4: Full verification**

Run:

```bash
npx vitest run apps/web/app/_content
pnpm --filter @bdas/web run typecheck
pnpm --filter @bdas/web run lint
pnpm --filter @bdas/web run build
npx prettier --check "apps/web/app/_content/**" "e2e/content-pages.e2e.ts" "docs/decisions/0025-puck-palette-expansion.md"
```

Expected: all green. Fix prettier with `--write` if it flags files, then re-run.

- [ ] **Step 5: Commit**

```bash
git add e2e/content-pages.e2e.ts docs/decisions/0025-puck-palette-expansion.md
git commit -m "test(web): E2E for authored Button block + ADR 0025

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- Rich text Approach A (§3) → Tasks 2 (renderer), 3 (editor field), 4 (wired as Fließtext). ✔
- Block palette (§4): Fließtext → T4; Bild, Button → T5; Zitat, Trenner, Abstand → T6; Spalten → T7; Überschrift, Absatz, PersonenRaster unchanged → retained (T4 test asserts Absatz/PersonenRaster survive). ✔
- Shared-kit guarantee (§1) → single `puckConfig`, unchanged import wiring. ✔
- Schema unchanged (§1) → no module/schema task. ✔
- Security (§6): no raw HTML (T2 allow-list + T2 tests), href validation (T1 + T5), rel/target (T2, T5), alt text field (T5), upload/authz/size unchanged. ✔
- Testing (§7): renderer + href units (T1, T2), config unit (T3), palette structural/render (T4–T7), E2E round-trip (T8). ✔
- Rollout (§8): behind existing `content` flag, ADR 0025 (T8). ✔

**Deviations from spec (intentional, safe):**

- Legacy `Absatz` stays visible in the palette rather than being hidden via `categories.visible` — the Puck 0.22 `Category.visible` flag could not be verified in the installed types, so the plan avoids depending on it. Absatz remains fully backward-compatible. `categories` sidebar grouping is therefore dropped from scope (organizational only; not a spec requirement).
- `Bild` gains an optional `bildunterschrift` (caption) field in addition to `altText`, matching the "image + caption" description.

**Placeholder scan:** none — every code step shows complete code.

**Type consistency:** component keys (`Fliesstext`, `Bild`, `Button`, `Zitat`, `Trenner`, `Abstand`, `Spalten`) and prop names are identical across the `Blocks` type, the `components` entries, and the tests. `safeHref`/`isExternalHref` signatures match between Task 1 and their consumers (Tasks 2, 5).
