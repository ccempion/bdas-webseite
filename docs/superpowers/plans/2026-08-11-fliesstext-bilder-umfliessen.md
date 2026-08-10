# Bilder im Fließtext mit Textumfluss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A board member drops, pastes or inserts an image inside a `Fließtext` block, sizes it from the shared four-step scale, and chooses whether body text flows around its left or right — with public rendering staying HTML-free.

**Architecture:** The renderer gains a typed `case "image"` in `rich-text.tsx`, reusing the width lookup shipped by the `bild-groesse` plan and adding a float lookup beside it. The editor extends Tiptap's `Image` node with three attributes and wires the existing `imageFileHandler`. No HTML is produced anywhere (ADR 0023).

**Tech Stack:** TypeScript, React, Next.js 14 App Router, Tiptap v3 (`@tiptap/react`, `@tiptap/extension-image`, `@tiptap/extension-file-handler`), Puck (`@puckeditor/core` 0.22.2), Tailwind via `core/design-system` tokens, Vitest (node + happy-dom environments).

Implements `docs/superpowers/specs/2026-08-10-fliesstext-bilder-umfliessen-design.md`. Branches from `feat/bild-groesse`, whose `bild-breite.ts` supplies the width scale.

## Global Constraints

- **Vitest defaults to `environment: "node"`** (`vitest.config.ts:5`). React is tested via `renderToStaticMarkup`. **Do not add jsdom** — but `happy-dom` is already a dependency (`apps/web/package.json:38`) and a test may opt into it per-file with a `@vitest-environment happy-dom` docblock, exactly as `app/_components/Combobox.interaction.test.tsx:2` does. Tiptap has been verified to mount under it.
- **Vitest compiles JSX with the classic runtime**, so any component rendered from a test must have `React` in scope in its own file. `RichTextField.tsx` currently does not import React — Task 2 adds the import, matching `puck-config.tsx:2` and `BlockPlatzhalter.tsx:1`. Without it the component throws `React is not defined` under test while continuing to work in the Next build, which uses the automatic runtime.
- **All user-facing copy is German.**
- **Never inline a hex, radius, shadow, or duration** (CLAUDE.md §7). Float and spacing use plain Tailwind layout utilities; the toolbar reuses the existing `ToolbarButton` styling in `RichTextField.tsx`.
- **Class strings must be literals in a lookup object, never template-interpolated.**
- **No HTML, ever (ADR 0023).** The blog reaches its rendering through `generateHTML` + `sanitizeHtml`; content pages must not. `Fliesstext` renders through the typed `renderNode` switch and nothing else.
- **`src` validation in the renderer is the load-bearing control.** An unsafe or unparseable `src` renders **nothing**, mirroring how `applyMarks` already drops unsafe link hrefs (`rich-text.tsx:24-35`).
- **Inline images store `breite` as a number** (`25 | 50 | 75 | 100`), not the blog's `"50%"` string, so both content-page surfaces read one lookup (`bild-breite.ts`) and cannot drift. The blog and events editors are explicitly out of scope and keep their strings.
- **Commit after every task**, conventional-commit style.
- Before each commit run: `pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint`

---

## File Structure

| File                                           | Responsibility                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `apps/web/app/_content/rich-text.tsx`          | **Modify.** The `case "image"` renderer and its float lookup.     |
| `apps/web/app/_content/rich-text.test.ts`      | **Modify.** Renderer tests.                                       |
| `apps/web/app/_content/RichTextField.tsx`      | **Modify.** Image node extension, file handler, toolbar controls. |
| `apps/web/app/_content/RichTextField.test.tsx` | **New.** happy-dom interaction tests for the toolbar.             |

The float lookup lives in `rich-text.tsx`, not in `bild-breite.ts`: the inline image is its only consumer — the standalone `Bild` block positions itself with `Ausrichtung`'s flex wrapper, never a float. Moving it into the shared module would be an abstraction with one caller (CLAUDE.md §6). The **width** lookup is shared because it genuinely has two callers.

**Alt text is required, not optional** (spec §1). The standalone `Bild` block has a field labelled _Alt-Text (Barrierefreiheit)_; an inline image that could not carry alt text would be an accessibility regression on the same page.

---

### Task 1: The renderer

**Files:**

- Modify: `apps/web/app/_content/rich-text.tsx`
- Test: `apps/web/app/_content/rich-text.test.ts`

**Interfaces:**

- Consumes: `bildBreiteClass`, `normalizeBildBreite` from `./bild-breite`; `safeHref` from `./href` (already imported).
- Produces: `type Umfluss = "keine" | "links" | "rechts"` and `umflussClass(u: Umfluss | undefined): string`, both exported from `./rich-text`. A new `case "image"` in `renderNode`.

The stored node shape is `{ type: "image", attrs: { src, alt, breite, umfluss } }`.

Float and the mobile rule combine per spec §5: full width and no float below `sm`, wrap above it. A floated 25 % image on a 380px phone would leave an unreadable ribbon of text beside it.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/app/_content/rich-text.test.ts`. Add `umflussClass` to the existing import from `./rich-text`, and add this helper beside the existing `doc` / `para` / `text` helpers at the top of the file:

```ts
const bild = (attrs: Record<string, unknown>) => ({ type: "image", attrs });
```

```ts
describe("umflussClass", () => {
  it("floats only from the sm breakpoint up", () => {
    expect(umflussClass("links")).toBe("sm:float-left sm:mr-4 sm:mb-2");
    expect(umflussClass("rechts")).toBe("sm:float-right sm:ml-4 sm:mb-2");
  });

  it("emits no float class when text should not wrap", () => {
    expect(umflussClass("keine")).toBe("");
    expect(umflussClass(undefined)).toBe("");
    expect(umflussClass("mittig" as never)).toBe("");
  });
});

describe("renderRichText images", () => {
  it("renders an image with its width and float classes", () => {
    const out = html(
      doc([bild({ src: "https://cdn.test/a.jpg", alt: "Ein Bild", breite: 50, umfluss: "links" })]),
    );
    expect(out).toContain('src="https://cdn.test/a.jpg"');
    expect(out).toContain('alt="Ein Bild"');
    expect(out).toMatch(/\bw-full\b/);
    expect(out).toMatch(/\bsm:w-1\/2\b/);
    expect(out).toMatch(/\bsm:float-left\b/);
  });

  it("covers every width and wrap combination", () => {
    const breiten = [25, 50, 75, 100] as const;
    const erwartet: Record<number, RegExp> = {
      25: /\bsm:w-1\/4\b/,
      50: /\bsm:w-1\/2\b/,
      75: /\bsm:w-3\/4\b/,
      100: /class="[^"]*"/,
    };
    for (const breite of breiten) {
      for (const umfluss of ["keine", "links", "rechts"] as const) {
        const out = html(doc([bild({ src: "https://cdn.test/a.jpg", alt: "x", breite, umfluss })]));
        expect(out, `breite ${breite}`).toMatch(erwartet[breite] as RegExp);
        if (umfluss === "keine") expect(out, "keine darf nicht floaten").not.toMatch(/sm:float-/);
        else
          expect(out, `umfluss ${umfluss}`).toMatch(
            new RegExp(`sm:float-${umfluss === "links" ? "left" : "right"}`),
          );
      }
    }
  });

  it("renders nothing for an unsafe src", () => {
    // The direct analogue of the existing unsafe-link test: the renderer
    // allow-lists on top of the editor, defence in depth.
    const out = html(doc([bild({ src: "javascript:alert(1)", alt: "böse", breite: 50 })]));
    expect(out).not.toContain("<img");
    expect(out).not.toContain("alert");
  });

  it("renders nothing when src is missing entirely", () => {
    expect(html(doc([bild({ alt: "ohne" })]))).not.toContain("<img");
  });

  it("emits an empty alt rather than dropping the attribute", () => {
    // A decorative image must not be announced as "image" by a screen reader.
    const out = html(doc([bild({ src: "https://cdn.test/a.jpg", breite: 100 })]));
    expect(out).toContain('alt=""');
  });

  it("falls back to full width for an unrecognised stored width", () => {
    const out = html(doc([bild({ src: "https://cdn.test/a.jpg", alt: "x", breite: "50%" })]));
    expect(out).toMatch(/\bw-full\b/);
    expect(out).not.toMatch(/\bsm:w-/);
  });

  it("renders an image sitting inside a paragraph's content", () => {
    // Tiptap's Image node is inline-capable; a dropped image commonly lands
    // inside the paragraph the cursor was in.
    const out = html(
      doc([para([text("Vorher "), bild({ src: "https://cdn.test/a.jpg", alt: "Mitte" })])]),
    );
    expect(out).toContain("Vorher");
    expect(out).toContain('alt="Mitte"');
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter @bdas/web test -- rich-text`
Expected: FAIL — `umflussClass is not a function`, and the image assertions fail because `renderNode`'s `default` branch renders an image node's (absent) children as nothing.

- [ ] **Step 3: Write the renderer**

In `apps/web/app/_content/rich-text.tsx`, add the import:

```tsx
import { bildBreiteClass, normalizeBildBreite } from "./bild-breite";
```

Add the type and lookup above `renderNode`:

```tsx
/** Whether body text flows past an inline image, and on which side.
 *  `keine` is the default: an image that does not wrap sits on its own line. */
export type Umfluss = "keine" | "links" | "rechts";

/** Float only from `sm` up, with a gutter on the text side. A floated 25 %
 *  image on a 380px phone would leave an unreadable ribbon of text beside it,
 *  so below `sm` the image is full width and in flow — the same mobile rule
 *  the `Bild` block takes. Literal strings; Tailwind never sees an
 *  interpolated class. */
const UMFLUSS_CLASS: Record<Umfluss, string> = {
  keine: "",
  links: "sm:float-left sm:mr-4 sm:mb-2",
  rechts: "sm:float-right sm:ml-4 sm:mb-2",
};

export const umflussClass = (umfluss: Umfluss | undefined): string =>
  umfluss !== undefined && Object.hasOwn(UMFLUSS_CLASS, umfluss)
    ? UMFLUSS_CLASS[umfluss]
    : UMFLUSS_CLASS.keine;
```

Add the case to `renderNode`, before `default`:

```tsx
    case "image": {
      // Render-side allow-list on top of the editor side — defence in depth,
      // the same reasoning as rich-text-config.ts. An unsafe or unparseable
      // src renders nothing at all, exactly as an unsafe link href does.
      const src = safeHref(String(node.attrs?.["src"] ?? ""));
      if (!src) return null;
      const breite = normalizeBildBreite(node.attrs?.["breite"]);
      const umfluss = umflussClass(node.attrs?.["umfluss"] as Umfluss | undefined);
      return (
        <img
          src={src}
          alt={String(node.attrs?.["alt"] ?? "")}
          className={`${bildBreiteClass(breite)} rounded-bdas${umfluss ? ` ${umfluss}` : ""}`}
        />
      );
    }
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @bdas/web test -- rich-text`
Expected: PASS, with the existing `renderRichText` and `istLeererRichText` tests untouched.

- [ ] **Step 5: Run the full gate and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/rich-text.tsx apps/web/app/_content/rich-text.test.ts
git commit -m "feat(web): render inline images with text wrap in Fließtext"
```

---

### Task 2: The editor

**Files:**

- Modify: `apps/web/app/_content/RichTextField.tsx`
- Test (new): `apps/web/app/_content/RichTextField.test.tsx`

**Interfaces:**

- Consumes: `BILD_BREITE_STUFEN` from `./bild-breite`; `imageFileHandler` from `../_upload/editor-file-handler`; `Umfluss` from `./rich-text`.
- Produces: no new exports. `RichTextField`'s stored document may now contain `image` nodes with `{ src, alt, breite, umfluss }`.

`imageFileHandler({ endpoint, onError })` is already generic and `/api/content/upload-url` is the signed-upload endpoint `FotoField` already uses (`FotoField.tsx:28`). No new route, no new intake rules.

The image node is Tiptap's `Image` extended with three attributes, following the `ImageWithWidth` idiom in `modules/blog/src/content.ts:21` — but storing `breite` as a number and adding `umfluss` and `alt`. It is **not** shared with the blog: ADR 0023 keeps content pages off the blog's HTML path, and the spec puts blog and events explicitly out of scope.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/_content/RichTextField.test.tsx`:

```tsx
/**
 * @vitest-environment happy-dom
 *
 * Drives the Fließtext editor as a browser would. What the node-environment
 * tests cannot reach is the toolbar wiring: that the image controls appear
 * only when an image is selected, and that they write the attributes the
 * renderer reads (`rich-text.tsx`'s `case "image"`).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RichTextField } from "./RichTextField";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function mount(value: unknown, onChange: (doc: unknown) => void = () => {}) {
  await act(async () => {
    root.render(<RichTextField value={value} onChange={onChange} />);
  });
}

const docMitBild = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "image", attrs: { src: "https://cdn.test/a.jpg", alt: "A", breite: 50 } }],
    },
  ],
};

function button(name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as
    | HTMLButtonElement
    | undefined;
}

describe("RichTextField", () => {
  it("offers a Bild button in the toolbar", async () => {
    await mount(undefined);
    expect(button("Bild")).toBeDefined();
  });

  it("hides the image controls while no image is selected", async () => {
    await mount(undefined);
    expect(container.textContent).not.toContain("Bildbreite");
    expect(container.textContent).not.toContain("Textumfluss");
  });

  it("shows width, wrap and alt controls once an image is selected", async () => {
    await mount(docMitBild);
    // Selecting the image is what reveals the controls; the editor selects the
    // node when the caret is placed on it.
    await act(async () => {
      const el = container.querySelector("img");
      el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Bildbreite");
    expect(container.textContent).toContain("Textumfluss");
    expect(
      container.querySelector('input[aria-label="Alt-Text (Barrierefreiheit)"]'),
    ).not.toBeNull();
    for (const stufe of ["25 %", "50 %", "75 %", "100 %"]) {
      expect(button(stufe), `Stufe ${stufe} fehlt`).toBeDefined();
    }
    for (const wahl of ["Kein Umfluss", "Text rechts", "Text links"]) {
      expect(button(wahl), `Umfluss ${wahl} fehlt`).toBeDefined();
    }
  });

  it("renders the existing formatting toolbar unchanged", async () => {
    await mount(undefined);
    for (const name of ["Fett", "Kursiv", "Liste", "Nummeriert", "Link"]) {
      expect(button(name), `${name} fehlt`).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter @bdas/web test -- RichTextField`
Expected: FAIL. The first failure is `React is not defined` — `RichTextField.tsx` has no React import and vitest compiles JSX with the classic runtime. After Step 3 adds it, the remaining failures are the missing `Bild` button and image controls.

- [ ] **Step 3: Extend the editor**

In `apps/web/app/_content/RichTextField.tsx`, add the React import at the top of the import block (this is what makes the component renderable under the classic JSX runtime):

```tsx
"use client";

import React from "react";

import Image from "@tiptap/extension-image";
import { EditorContent, useEditor, type Content } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { imageFileHandler } from "../_upload/editor-file-handler";
import { BILD_BREITE_STUFEN } from "./bild-breite";
import { RICH_TEXT_STARTERKIT_CONFIG } from "./rich-text-config";
import type { Umfluss } from "./rich-text";
```

Add the node extension and the wrap options above `EXTENSIONS`:

```tsx
/** Tiptap's Image, taught the three attributes `rich-text.tsx` renders from.
 *  `breite` is a number on the shared scale — deliberately not the blog's
 *  `"50%"` string, so both content-page surfaces read one lookup. */
const InhaltsBild = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      breite: { default: 100 },
      umfluss: { default: "keine" },
      alt: { default: "" },
    };
  },
});

const UMFLUSS_WAHL: ReadonlyArray<{ wert: Umfluss; label: string }> = [
  { wert: "keine", label: "Kein Umfluss" },
  // The label names where the *text* goes, which is what the author is
  // choosing; `links` floats the image left and the text lands on its right.
  { wert: "links", label: "Text rechts" },
  { wert: "rechts", label: "Text links" },
];
```

Replace the `EXTENSIONS` constant. It becomes a function because the file handler needs the error callback:

```tsx
const EXTENSIONS = [
  StarterKit.configure({
    ...RICH_TEXT_STARTERKIT_CONFIG,
    underline: false,
    link: { openOnClick: false, autolink: false },
  }),
  InhaltsBild,
  imageFileHandler({
    endpoint: "/api/content/upload-url",
    onError: (m) => window.alert(m),
  }),
];
```

Inside the component, after `if (!editor) return null;`, add nothing — the controls go in the toolbar JSX. Append to the toolbar `<div className="flex flex-wrap gap-1">`, after the existing Link button:

```tsx
<ToolbarButton
  active={false}
  label="Bild"
  onClick={() => {
    const url = window.prompt("Bild-URL (https://…)") ?? "";
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }}
/>;
{
  editor.isActive("image") ? (
    <>
      <span className="self-center px-1 text-xs text-bdas-ink-muted">Bildbreite:</span>
      {BILD_BREITE_STUFEN.map((stufe) => (
        <ToolbarButton
          key={stufe}
          active={editor.getAttributes("image")["breite"] === stufe}
          label={`${stufe} %`}
          onClick={() => editor.chain().focus().updateAttributes("image", { breite: stufe }).run()}
        />
      ))}
      <span className="self-center px-1 text-xs text-bdas-ink-muted">Textumfluss:</span>
      {UMFLUSS_WAHL.map(({ wert, label }) => (
        <ToolbarButton
          key={wert}
          active={editor.getAttributes("image")["umfluss"] === wert}
          label={label}
          onClick={() => editor.chain().focus().updateAttributes("image", { umfluss: wert }).run()}
        />
      ))}
      <input
        aria-label="Alt-Text (Barrierefreiheit)"
        placeholder="Alt-Text (Barrierefreiheit)"
        value={(editor.getAttributes("image")["alt"] as string | undefined) ?? ""}
        onChange={(e) =>
          editor.chain().focus().updateAttributes("image", { alt: e.target.value }).run()
        }
        className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-sm text-bdas-ink"
      />
    </>
  ) : null;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @bdas/web test -- RichTextField`
Expected: PASS.

If the selection test proves flaky — placing a node selection through a synthetic click is the one browser behaviour happy-dom is least likely to reproduce faithfully — replace the click with a direct command and keep the assertion:

```tsx
await act(async () => {
  editorRef?.chain().focus().setNodeSelection(1).run();
});
```

which requires capturing the editor via an `onChange` side effect. Prefer the click; fall back only if it does not select.

- [ ] **Step 5: Run the full gate and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content
git commit -m "feat(web): insert and wrap images inside the Fließtext editor"
```

---

### Task 3: Confirm the float is contained and does not escape the block

**Files:**

- Test: `apps/web/app/_content/puck-config.test.ts`

**Interfaces:**

- Consumes: `puckConfig` from `./puck-config`. No production change is expected in this task.

Spec §1 argues the float cannot leak into the next Puck block, because the `Fliesstext` block is itself a flex item in the root column and therefore establishes its own block formatting context. Spec §8 flags tall floats overhanging _inside_ the block as the accepted behaviour. That argument is load-bearing for the whole design, so pin it: the block's own wrapper is what contains the float, and a future refactor that drops it would silently break the page.

This task is expected to be **green without a production change**. If it is not, the containment argument is wrong and the block needs an explicit `flow-root` — make that change here rather than in Task 1.

- [ ] **Step 1: Write the test**

Append inside `describe("puckConfig", …)` in `apps/web/app/_content/puck-config.test.ts`:

```ts
it("Fließtext wraps its content in a single element that can contain a float", () => {
  const render = puckConfig.components.Fliesstext?.render;
  if (!render) throw new Error("Fliesstext render missing");
  const out = renderToStaticMarkup(
    render({
      inhalt: {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "https://cdn.test/a.jpg", alt: "x", breite: 50, umfluss: "links" },
          },
          { type: "paragraph", content: [{ type: "text", text: "Text daneben." }] },
        ],
      },
      ausrichtung: "links",
      puck: {},
    } as never) as never,
  );
  // One wrapper around both the floated image and the text it wraps: they must
  // share a formatting context for the wrap to happen at all, and that wrapper
  // is what keeps the float from reaching the next Puck block.
  expect(out).toMatch(/^<div class="text-left">/);
  expect(out).toContain("sm:float-left");
  expect(out).toContain("Text daneben.");
  expect(out.endsWith("</div>")).toBe(true);
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @bdas/web test -- puck-config`
Expected: PASS with no production change. If it fails, the wrapper is not what the spec assumed — fix the block, not the test.

- [ ] **Step 3: Run the full gate and commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/puck-config.test.ts
git commit -m "test(web): pin that a Fließtext float stays inside its block"
```

---

## Self-Review

**Spec coverage.**

| Spec section                                            | Task |
| ------------------------------------------------------- | ---- |
| §2 insert by drag, paste, or toolbar button             | 2    |
| §2 width presets and wrap choice                        | 2    |
| §2 alt text                                             | 2    |
| §2 public rendering stays HTML-free and typed           | 1    |
| §4 extend Image with width / ausrichtung / alt          | 2    |
| §4 wire `imageFileHandler` at `/api/content/upload-url` | 2    |
| §4 controls appear on `editor.isActive("image")`        | 2    |
| §5 `case "image"`, `safeHref`, `alt=""` default         | 1    |
| §5 width + float class lookup, mobile rule              | 1    |
| §6 src validation is the load-bearing control           | 1    |
| §7 every preset × wrap combination                      | 1    |
| §7 `javascript:` src renders nothing                    | 1    |
| §7 alt passthrough and empty-alt default                | 1    |
| §7 `keine` emits no float class                         | 1    |
| §8 float containment                                    | 3    |
| §9 four steps, one shared lookup                        | 1    |

**Naming deviation, recorded.** The spec calls the wrap attribute `ausrichtung` (§4). This plan names it `umfluss`. `Ausrichtung` is already a distinct, shipped concept in this codebase — the block-level left/centre/right control on six Puck blocks, with `ausrichtungText` and `ausrichtungFlex` helpers and its own field — and its values are `links | mittig | rechts`, not `keine | links | rechts`. Reusing the name for a float would make two different things share one word on the same surface. The stored attribute, the type and the helper are all `umfluss`.

**Placeholder scan.** No TBDs. Every code step carries its code, including the fallback path in Task 2 Step 4.

**Type consistency.** `Umfluss` is defined in `rich-text.tsx` (Task 1) and imported by `RichTextField.tsx` (Task 2) — same three values in both. `breite` is a number on `BildBreite`'s scale in the node attrs, the editor's `updateAttributes` call, and `normalizeBildBreite`'s input. `umflussClass` takes `Umfluss | undefined` in its definition and both call sites.

**Task 3 is a verification task, not a change task.** It is listed separately because it can fail, and if it does the fix belongs in production code — but the expected outcome is that it passes as written.
