# Image Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every surface that accepts a picture also accepts it by drag-and-drop (and, in the rich-text editors, by paste), instead of forcing a trip through the OS file picker — and a *future* surface gets the same for two imports and one wrapper.

**Architecture:** One shared layer under `apps/web/app/_upload/`, split by concern: `accept.ts` (what may be uploaded — the single source of truth, imported by both the client and the four API routes), `upload-image.ts` (the sign→PUT protocol, once, replacing five copies), `DropZone.tsx` (drag mechanics), `WindowDropGuard.tsx` (stray drops). The Tiptap editors do not get hand-written ProseMirror glue — they get Tiptap's own `FileHandler` extension.

**Tech Stack:** TypeScript, Next.js 14 App Router, React client components, Tailwind via `core/design-system` tokens, Tiptap 3.27.4 (+ `@tiptap/extension-file-handler@3.27.4`), Puck 0.22.2, Vitest (node environment), Playwright.

---

## Library findings that shaped this plan

Both were verified against what is actually installed, not from memory.

**1. Tiptap ships the drop/paste handler already — use it.** `@tiptap/extension-file-handler@3.27.4` is MIT, published at the *exact* version of the installed Tiptap (3.27.4), and has **zero runtime dependencies**; its peers (`@tiptap/core`, `@tiptap/pm`, `@tiptap/extension-text-style`, all `3.27.4`) are already satisfied. Its API is precisely the surface this plan needs:

```ts
FileHandler.configure({
  allowedMimeTypes?: string[],
  onDrop?: (editor: Editor, files: File[], pos: number) => void,
  onPaste?: (editor: Editor, files: File[], pasteContent?: string) => void,
  consumePasteEvent?: boolean,
})
```

This deletes the entire hand-rolled `handleDrop`/`handlePaste`/`posAtCoords`/`view.dispatch(tr.insert(…))` layer, the `DragEvent`/`ClipboardEvent` casts, and the `@tiptap/pm/view` type import. `onDrop` hands over the insertion position already computed. **Task 8 is roughly a third of what it was.**

Two notes on using it: pass `consumePasteEvent: true`, or pasting a screenshot copied from a web page inserts both the upload *and* the clipboard's HTML `<img>`. And **do not** pass `allowedMimeTypes` — it filters silently, so a dropped PDF would vanish with no explanation. Filter with `intakeFiles` instead so the editors report the same German messages as every other surface, and so the size cap is enforced too (`allowedMimeTypes` does not do size).

*Adding this package is not a stack substitution under CLAUDE.md §2 — same vendor, same pinned version, no new transitive dependencies, an extension within the existing Tiptap pin rather than a replacement for it. Flagging it anyway; say the word if you want an ADR.*

**2. Puck cannot conflict with a file drop — the two use disjoint event systems.** Puck 0.22.2 drags blocks with `@dnd-kit` 0.4.0, which activates on `pointerdown`/`pointermove`. Across `@dnd-kit/dom` there are **zero** native `dragenter`, `dragleave` or `drop` listeners; the only native `dragstart` listener is registered with the comment *"Cancel activation if there is a competing Drag and Drop interaction"* — dnd-kit deliberately **yields** to HTML5 drag rather than competing with it. A file dragged in from the OS never fires `pointerdown` in the page at all.

So the "Puck block moves instead of accepting the image" failure mode is ruled out by construction. Task 7 keeps a 2-minute empirical confirmation (cheap, and the evidence is static analysis, not a run), but its bail-out is now a remote contingency rather than an expected outcome.

**3. Puck has no built-in file or image field.** Its field union is `text | number | textarea | select | radio | richtext | array | object | external | custom`. `FotoField` stays a `custom` field — there is nothing to adopt. (Unrelated but worth knowing: Puck 0.22's `richtext` field is Tiptap-backed and accepts `tiptap.extensions`, so if a Puck rich-text field is ever introduced it can take the same `FileHandler` built in Task 8.)

---

## Global Constraints

- **Vitest runs in `environment: "node"`** (`vitest.config.ts:6`). No jsdom, no testing-library. Unit tests cover framework-free `.ts` modules; React components are tested via `renderToStaticMarkup` (see `apps/web/app/_content/Organigramm.test.tsx`) or Playwright. **Do not add jsdom** — that is a stack change requiring an ADR.
- **Never inline a hex, radius, shadow, or duration** (CLAUDE.md §7). Use only tokens already in use in `apps/web/app/_files/FileUploader.tsx`: `rounded-bdas`, `border-bdas-red`, `border-bdas-soft`, `bg-bdas-overlay-hover`, `bg-bdas-surface`, `text-bdas-ink`, `text-bdas-ink-muted`, `text-bdas-red`, `duration-bdas-quick`, `ease-bdas`.
- **All user-facing copy is German.**
- **Keep every hidden `<input type="file">`.** Click and keyboard paths must survive: drop is an enhancement, and `e2e/files.e2e.ts:41` drives uploads through `setInputFiles`.
- **Commit after every task**, conventional-commit style (`feat(web): …`, `fix(web): …`).
- Before each commit: `pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint`.

---

## File Structure

**New — `apps/web/app/_upload/`:**

| File | Responsibility |
|---|---|
| `accept.ts` | What may be uploaded: MIME lists, size caps, German rejection messages, "does this drag carry files". Framework-free. **Imported by the four API routes too** — one source of truth. |
| `accept.test.ts` | Unit tests. |
| `upload-image.ts` | The sign→PUT protocol, once. Injectable `fetch`. |
| `upload-image.test.ts` | Unit tests. |
| `DropZone.tsx` | Drag mechanics: enter/leave counter, token-driven highlight, accept/reject split. |
| `WindowDropGuard.tsx` | Swallows drops that miss a zone. |
| `editor-file-handler.ts` | Builds a configured Tiptap `FileHandler` for an endpoint — a third editor is then one line. |

**Modified:** `apps/web/app/layout.tsx`, the four `app/api/**/upload-url/route.ts`, `profil/PhotoField.tsx`, `account/AccountAvatar.tsx`, `_content/FotoField.tsx`, `admin/events/_editor/EventFields.tsx`, `admin/events/_editor/RichTextEditor.tsx`, `_blog/PostEditor.tsx`, `_files/FileUploader.tsx`, `e2e/blog.e2e.ts`.

---

## Redundancies this plan removes

Folding in the four amendments, plus the Tiptap finding, the shared layer now absorbs work rather than sitting beside it:

| Duplicated today | After |
|---|---|
| The sign→PUT→error dance, **5 near-identical copies** (`PhotoField`, `AccountAvatar`, `FotoField`, `EventFields`, and both editors' `addImage`) | One `uploadImage(endpoint, file, extra?)`. Each caller keeps only what differs: its payload shape and what it does with the result. |
| MIME allowlist + size cap, **4 route files + would-have-been client constants** | One `accept.ts`, imported by client *and* routes. A cap can no longer drift out of sync with the client that mirrors it. |
| `const file = files[0]; if (file) …`, **5 copies** | `onFile` prop on `DropZone`; `onFile`/`onFiles` are a mutually exclusive union, so passing both is a compile error. |
| `allowAnyType` boolean escape hatch | Gone. `accept={{ mime, maxBytes, maxLabel }}` — one concept. `FileUploader` passes its own folder MIME set through the same prop. |
| ~35 lines of ProseMirror drop/paste glue, **would have been 2 copies** | `imageFileHandler({ endpoint, onError })`, one line per editor. |
| `accept="image/*"` on 3 surfaces, contradicting the server's 4-type allowlist | `IMAGE_ACCEPT` derived from the same list the routes enforce. |

Net: the plan deletes more lines from the five existing surfaces than it adds to them.

---

## The three scope items

1. **Stray drops navigate the browser away**, discarding an unsaved event or blog draft. → **Task 3**.
2. **Client-side validation** — the routes allow only `jpeg|png|webp|avif`, but `EventFields` and both editors advertise `accept="image/*"`, so a GIF costs a round trip and returns a 422. → **Task 1**, applied everywhere.
3. **Puck** → **Task 7**, now de-risked by finding 2 above but still empirically confirmed.

---

## Task 1: One source of truth for what may be uploaded

**Files:**
- Create: `apps/web/app/_upload/accept.ts`
- Test: `apps/web/app/_upload/accept.test.ts`
- Modify: `apps/web/app/api/profile/upload-url/route.ts:10-11`, `apps/web/app/api/content/upload-url/route.ts:12-13`, `apps/web/app/api/blog/upload-url/route.ts:10-11`, `apps/web/app/api/events/[id]/upload-url/route.ts:12-13`

**Interfaces:**
- Consumes: nothing.
- Produces: `type AcceptSpec = { mime: readonly string[]; maxBytes: number; maxLabel: string }`, `PROFILE_IMAGE: AcceptSpec`, `CONTENT_IMAGE: AcceptSpec`, `IMAGE_ACCEPT: string`, `type Candidate = { name: string; type: string; size: number }`, `dragHasFiles(types: readonly string[]): boolean`, `rejectReason(file: Candidate, spec: AcceptSpec): string | null`, `intakeFiles<T extends Candidate>(files, spec, opts?: { firstOnly?: boolean }): { accepted: readonly T[]; rejected: readonly string[] }`, `tooLargeMessage(spec: AcceptSpec): string`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_upload/accept.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  CONTENT_IMAGE,
  PROFILE_IMAGE,
  dragHasFiles,
  intakeFiles,
  rejectReason,
  tooLargeMessage,
} from "./accept";

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "foto.png",
  type: "image/png",
  size: 1024,
  ...over,
});

describe("dragHasFiles", () => {
  it("is true when the drag advertises the Files kind", () => {
    expect(dragHasFiles(["Files"])).toBe(true);
  });

  it("is false for a text or link drag", () => {
    expect(dragHasFiles(["text/plain"])).toBe(false);
    expect(dragHasFiles([])).toBe(false);
  });
});

describe("rejectReason", () => {
  it("accepts the four allowed image types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
      expect(rejectReason(file({ type }), CONTENT_IMAGE)).toBeNull();
    }
  });

  it("names the file when the type is not allowed", () => {
    expect(rejectReason(file({ name: "clip.gif", type: "image/gif" }), CONTENT_IMAGE)).toBe(
      "clip.gif: nur JPEG, PNG, WebP oder AVIF.",
    );
  });

  it("rejects a dropped folder, which arrives as an empty typeless entry", () => {
    expect(rejectReason(file({ name: "Bilder", type: "", size: 0 }), CONTENT_IMAGE)).toBe(
      "Bilder: nur JPEG, PNG, WebP oder AVIF.",
    );
  });

  it("reports the surface's own cap", () => {
    expect(rejectReason(file({ size: 8 * 1024 * 1024 }), PROFILE_IMAGE)).toBe(
      "foto.png: größer als 5 MB.",
    );
    expect(rejectReason(file({ size: 8 * 1024 * 1024 }), CONTENT_IMAGE)).toBeNull();
  });

  it("accepts any listed type for a non-image spec", () => {
    const docs = { mime: ["application/pdf"], maxBytes: 1000, maxLabel: "1 KB" };
    expect(rejectReason(file({ name: "s.pdf", type: "application/pdf", size: 500 }), docs)).toBeNull();
    expect(rejectReason(file({ type: "image/png" }), docs)).toBe(
      "foto.png: Dateityp nicht erlaubt.",
    );
  });
});

describe("tooLargeMessage", () => {
  it("matches the wording the API routes return", () => {
    expect(tooLargeMessage(PROFILE_IMAGE)).toBe("Datei zu groß (max. 5 MB).");
    expect(tooLargeMessage(CONTENT_IMAGE)).toBe("Datei zu groß (max. 10 MB).");
  });
});

describe("intakeFiles", () => {
  it("splits accepted files from German rejection messages", () => {
    const out = intakeFiles(
      [file({ name: "a.png" }), file({ name: "b.gif", type: "image/gif" })],
      CONTENT_IMAGE,
    );
    expect(out.accepted.map((f) => f.name)).toEqual(["a.png"]);
    expect(out.rejected).toEqual(["b.gif: nur JPEG, PNG, WebP oder AVIF."]);
  });

  it("takes only the first acceptable file when the surface holds one image", () => {
    const out = intakeFiles([file({ name: "a.png" }), file({ name: "b.png" })], CONTENT_IMAGE, {
      firstOnly: true,
    });
    expect(out.accepted.map((f) => f.name)).toEqual(["a.png"]);
    expect(out.rejected).toEqual([]);
  });

  it("skips past a rejected first file to the next acceptable one", () => {
    const out = intakeFiles(
      [file({ name: "a.gif", type: "image/gif" }), file({ name: "b.png" })],
      CONTENT_IMAGE,
      { firstOnly: true },
    );
    expect(out.accepted.map((f) => f.name)).toEqual(["b.png"]);
    expect(out.rejected).toEqual(["a.gif: nur JPEG, PNG, WebP oder AVIF."]);
  });

  it("returns nothing for an empty drop", () => {
    expect(intakeFiles([], CONTENT_IMAGE)).toEqual({ accepted: [], rejected: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web test accept`
Expected: FAIL — `Failed to resolve import "./accept"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/_upload/accept.ts`:

```ts
/**
 * What may be uploaded, in one place. Both the client (before a drop leaves the
 * browser) and the `/api/**​/upload-url` routes (authoritatively) read these
 * specs, so a cap can no longer drift between the two.
 *
 * Framework-free and free of server-only imports: safe on both sides.
 */

export type AcceptSpec = {
  readonly mime: readonly string[];
  readonly maxBytes: number;
  readonly maxLabel: string;
};

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

/** A profile photo. */
export const PROFILE_IMAGE: AcceptSpec = {
  mime: IMAGE_MIME,
  maxBytes: 5 * 1024 * 1024,
  maxLabel: "5 MB",
};

/** Page, blog and event imagery all share one cap. */
export const CONTENT_IMAGE: AcceptSpec = {
  mime: IMAGE_MIME,
  maxBytes: 10 * 1024 * 1024,
  maxLabel: "10 MB",
};

/** For the `accept` attribute of a file input. */
export const IMAGE_ACCEPT = IMAGE_MIME.join(",");

export type Candidate = { readonly name: string; readonly type: string; readonly size: number };

/**
 * A drag carries files only when the DataTransfer advertises the "Files" kind,
 * so a zone does not light up for a drag it could never accept.
 */
export function dragHasFiles(types: readonly string[]): boolean {
  return types.includes("Files");
}

const isImageSpec = (spec: AcceptSpec): boolean =>
  IMAGE_MIME.every((m) => spec.mime.includes(m)) && spec.mime.length === IMAGE_MIME.length;

/** German reason this file may not be uploaded, or null when it is acceptable. */
export function rejectReason(file: Candidate, spec: AcceptSpec): string | null {
  if (!spec.mime.includes(file.type)) {
    return isImageSpec(spec)
      ? `${file.name}: nur JPEG, PNG, WebP oder AVIF.`
      : `${file.name}: Dateityp nicht erlaubt.`;
  }
  if (file.size <= 0 || file.size > spec.maxBytes) {
    return `${file.name}: größer als ${spec.maxLabel}.`;
  }
  return null;
}

/** The server-side wording, kept here so the cap and its message cannot drift. */
export function tooLargeMessage(spec: AcceptSpec): string {
  return `Datei zu groß (max. ${spec.maxLabel}).`;
}

/**
 * Split a drop into what may be uploaded and German messages for the rest.
 * With `firstOnly`, files past the first acceptable one are ignored silently:
 * dropping three photos on an avatar means "use one of these", not "you made
 * two mistakes".
 */
export function intakeFiles<T extends Candidate>(
  files: readonly T[],
  spec: AcceptSpec,
  opts: { readonly firstOnly?: boolean } = {},
): { readonly accepted: readonly T[]; readonly rejected: readonly string[] } {
  const accepted: T[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (opts.firstOnly && accepted.length === 1) break;
    const reason = rejectReason(file, spec);
    if (reason) {
      rejected.push(reason);
      continue;
    }
    accepted.push(file);
  }
  return { accepted, rejected };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/web test accept`
Expected: PASS, 13 tests.

- [ ] **Step 5: Point the four API routes at the shared spec**

In each route, delete its local `MAX_BYTES` and `ALLOWED` and import the spec instead. For `apps/web/app/api/profile/upload-url/route.ts`, replace lines 10–11 with:

```ts
import { PROFILE_IMAGE, tooLargeMessage } from "../../../_upload/accept";
```

and rewrite the two guards (lines 26–31) to read from it:

```ts
  if (!body?.mimeType || !PROFILE_IMAGE.mime.includes(body.mimeType)) {
    return Response.json({ error: "Dateityp nicht erlaubt." }, { status: 422 });
  }
  if (!body.sizeBytes || body.sizeBytes <= 0 || body.sizeBytes > PROFILE_IMAGE.maxBytes) {
    return Response.json({ error: tooLargeMessage(PROFILE_IMAGE) }, { status: 422 });
  }
```

Preserve each route's existing "Dateityp nicht erlaubt." wording verbatim — read it from the file rather than assuming; only the *source of the numbers* changes, not the responses. Repeat for `content`, `blog` and `events/[id]`, all three using `CONTENT_IMAGE`. Verify the relative import depth per file.

- [ ] **Step 6: Confirm the route tests still pass**

`apps/web/app/api/profile/upload-url/route.test.ts` and `.../content/upload-url/route.test.ts` already assert these guards.

Run: `pnpm --filter @bdas/web test upload-url`
Expected: PASS, unchanged. Any diff in an error string means Step 5 altered a response — revert that string.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/_upload/accept.ts apps/web/app/_upload/accept.test.ts apps/web/app/api
git commit -m "refactor(web): read upload limits from one shared spec on client and server"
```

---

## Task 2: The upload protocol, once

Five surfaces currently repeat the same POST-for-a-signed-URL, PUT-the-bytes, map-the-error sequence. Only the request payload and the response shape differ, so those stay with the caller and everything else moves here.

**Files:**
- Create: `apps/web/app/_upload/upload-image.ts`
- Test: `apps/web/app/_upload/upload-image.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `uploadImage<R extends { uploadUrl: string }>(endpoint: string, file: File, extra?: Record<string, unknown>, fetchImpl?: typeof fetch): Promise<{ ok: R } | { error: string }>`.

The generic `R` is how callers keep their own response shape: `/api/profile` returns `{ uploadUrl, storageKey }`, `/api/content` and `/api/blog` return `{ uploadUrl, publicUrl }`, `/api/events/[id]` returns all three. `extra` carries `/api/content`'s additional `slug`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_upload/upload-image.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { uploadImage } from "./upload-image";

const png = { name: "foto.png", type: "image/png", size: 2048 } as unknown as File;

/** Minimal stand-in for the two fetch calls; records what was asked for. */
function fakeFetch(
  responses: Record<string, { ok: boolean; body?: unknown }>,
  calls: string[] = [],
) {
  const impl = async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const r = responses[url] ?? { ok: false, body: {} };
    return { ok: r.ok, json: async () => r.body ?? {} };
  };
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("uploadImage", () => {
  it("signs, puts, and returns the route's own payload", async () => {
    const { impl, calls } = fakeFetch({
      "/api/blog/upload-url": {
        ok: true,
        body: { uploadUrl: "https://signed.example/put", publicUrl: "https://cdn/x.png" },
      },
      "https://signed.example/put": { ok: true },
    });
    const out = await uploadImage<{ uploadUrl: string; publicUrl: string }>(
      "/api/blog/upload-url",
      png,
      undefined,
      impl,
    );
    expect(out).toEqual({
      ok: { uploadUrl: "https://signed.example/put", publicUrl: "https://cdn/x.png" },
    });
    expect(calls).toEqual(["POST /api/blog/upload-url", "PUT https://signed.example/put"]);
  });

  it("sends the file's own metadata to the signing route", async () => {
    let sent: unknown = null;
    const impl = (async (input: unknown, init?: { body?: string }) => {
      if (String(input).startsWith("/api")) {
        sent = JSON.parse(init?.body ?? "{}");
        return { ok: true, json: async () => ({ uploadUrl: "https://s/put" }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;

    await uploadImage("/api/content/upload-url", png, { slug: "ueber-uns" }, impl);
    expect(sent).toEqual({
      filename: "foto.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      slug: "ueber-uns",
    });
  });

  it("surfaces the server's German error when signing is refused", async () => {
    const { impl } = fakeFetch({
      "/api/blog/upload-url": { ok: false, body: { error: "Nicht berechtigt." } },
    });
    expect(await uploadImage("/api/blog/upload-url", png, undefined, impl)).toEqual({
      error: "Nicht berechtigt.",
    });
  });

  it("falls back to a generic message when the route gives no reason", async () => {
    const { impl } = fakeFetch({ "/api/blog/upload-url": { ok: false, body: {} } });
    expect(await uploadImage("/api/blog/upload-url", png, undefined, impl)).toEqual({
      error: "Upload fehlgeschlagen.",
    });
  });

  it("reports a failed PUT rather than a false success", async () => {
    const { impl } = fakeFetch({
      "/api/blog/upload-url": { ok: true, body: { uploadUrl: "https://signed.example/put" } },
      "https://signed.example/put": { ok: false },
    });
    expect(await uploadImage("/api/blog/upload-url", png, undefined, impl)).toEqual({
      error: "Upload fehlgeschlagen.",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web test upload-image`
Expected: FAIL — `Failed to resolve import "./upload-image"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/_upload/upload-image.ts`:

```ts
/**
 * The two-step upload every picture surface performs: ask the route to sign a
 * URL, then PUT the bytes to it. Five surfaces had their own copy of this and
 * differed only in the payload they send and the fields they read back — so the
 * response type is the caller's, and everything else lives here.
 *
 * `fetch` is injected so the request sequence is unit-testable without a
 * browser or a server.
 */
export async function uploadImage<R extends { uploadUrl: string }>(
  endpoint: string,
  file: File,
  extra?: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: R } | { error: string }> {
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      ...extra,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Upload fehlgeschlagen." };
  }

  const signed = (await res.json()) as R;
  const put = await fetchImpl(signed.uploadUrl, { method: "PUT", body: file });
  if (!put.ok) return { error: "Upload fehlgeschlagen." };
  return { ok: signed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/web test upload-image`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_upload/upload-image.ts apps/web/app/_upload/upload-image.test.ts
git commit -m "feat(web): extract the signed-upload protocol into one helper"
```

---

## Task 3: DropZone

**Files:**
- Create: `apps/web/app/_upload/DropZone.tsx`

**Interfaces:**
- Consumes: `dragHasFiles`, `intakeFiles`, `type AcceptSpec` (Task 1).
- Produces: `<DropZone accept={AcceptSpec} label={string} onReject={(messages: readonly string[]) => void} {...onFile | onFiles} disabled?={boolean} className?={string}>{children}</DropZone>`.

`onFile` and `onFiles` are a mutually exclusive union — passing both, or neither, is a type error. `onFile` implies `firstOnly`, which is what the five single-image surfaces want.

No unit test: the Vitest environment is `node`, so drag events cannot be dispatched. Every decision it makes is already tested in Task 1 — that is the point of the split — and the wiring is covered by Playwright in Task 10.

- [ ] **Step 1: Write the component**

Create `apps/web/app/_upload/DropZone.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { dragHasFiles, intakeFiles, type AcceptSpec } from "./accept";

/** Exactly one sink: a surface holds one image, or it holds many. */
type Sink =
  | { onFile: (file: File) => void; onFiles?: never }
  | { onFiles: (files: readonly File[]) => void; onFile?: never };

/**
 * Wraps an existing upload control in a drop target. Drop is an enhancement:
 * the wrapped control keeps its own click and keyboard path, which is also what
 * the Playwright specs drive via `setInputFiles`.
 *
 * Drag state is an enter/leave *counter*, not a boolean — moving the pointer
 * over a child element fires `dragleave` on the parent, and a boolean flickers.
 */
export function DropZone(
  props: {
    accept: AcceptSpec;
    label: string;
    onReject: (messages: readonly string[]) => void;
    disabled?: boolean;
    className?: string;
    children: ReactNode;
  } & Sink,
) {
  // Read the sink off `props` rather than destructuring it: TypeScript does not
  // preserve the union's discrimination through a rest element, so `props.onFile`
  // must stay attached to `props` for the narrowing below to hold.
  const { accept, label, onReject, disabled = false, className = "", children } = props;
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  const reset = useCallback(() => {
    depth.current = 0;
    setOver(false);
  }, []);

  if (disabled) return <div className={className}>{children}</div>;

  return (
    <div
      data-dropzone
      className={`rounded-bdas border border-dashed p-2 transition-colors duration-bdas-quick ease-bdas ${
        over ? "border-bdas-red bg-bdas-overlay-hover" : "border-transparent"
      } ${className}`}
      onDragEnter={(e) => {
        if (!dragHasFiles(Array.from(e.dataTransfer.types))) return;
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!dragHasFiles(Array.from(e.dataTransfer.types))) return;
        // preventDefault on dragover is what makes an element a valid drop target.
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current -= 1;
        if (depth.current <= 0) reset();
      }}
      onDrop={(e) => {
        if (!dragHasFiles(Array.from(e.dataTransfer.types))) return;
        e.preventDefault();
        // Keep the drop from also reaching the window guard.
        e.stopPropagation();
        reset();
        const { accepted, rejected } = intakeFiles(Array.from(e.dataTransfer.files), accept, {
          firstOnly: props.onFile !== undefined,
        });
        if (rejected.length > 0) onReject(rejected);
        if (accepted.length === 0) return;
        if (props.onFile) props.onFile(accepted[0]!);
        else props.onFiles(accepted);
      }}
    >
      {children}
      {over ? <p className="mt-1 text-sm text-bdas-red">{label}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/_upload/DropZone.tsx
git commit -m "feat(web): add DropZone wrapper for upload controls"
```

---

## Task 4: Window drop guard — scope item 1

Without this, a file dropped anywhere that is not a drop target makes the browser navigate to `file:///…`, throwing away an unsaved event or blog draft. Independent of every surface, and the highest-value single step here.

**Files:**
- Create: `apps/web/app/_upload/WindowDropGuard.tsx`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Consumes: nothing. Produces: `<WindowDropGuard />` — renders `null`.

- [ ] **Step 1: Write the component**

Create `apps/web/app/_upload/WindowDropGuard.tsx`:

```tsx
"use client";

import { useEffect } from "react";

/**
 * Swallows file drops that miss a drop zone. Without this the browser treats a
 * stray drop as "navigate to that file" and the current page — including an
 * unsaved event or blog draft — is gone.
 *
 * `dragover` must also be prevented: that is what marks the window as a valid
 * drop target, and only a valid target fires a cancellable `drop`. Real drops
 * are stopped by DropZone before they bubble this far.
 */
export function WindowDropGuard() {
  useEffect(() => {
    const swallow = (e: DragEvent) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
    };
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  return null;
}
```

- [ ] **Step 2: Mount it in the root layout**

In `apps/web/app/layout.tsx`, add the import after the `PublicFooter` import on line 10:

```tsx
import { WindowDropGuard } from "./_upload/WindowDropGuard";
```

and render it as the first child inside `<body>` (line 34), ahead of the skip link:

```tsx
      <body className="flex min-h-screen flex-col antialiased">
        <WindowDropGuard />
        <a
          href="#inhalt"
```

Nothing else changes. `export const dynamic = "force-dynamic"` on line 18 stays — the guard is a client component and does not affect rendering mode.

- [ ] **Step 3: Verify manually**

Run: `pnpm --filter @bdas/web dev`, open `http://localhost:3000`, drag any file onto blank page background and release.
Expected: nothing happens. Before this task the browser opened the file.

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_upload/WindowDropGuard.tsx apps/web/app/layout.tsx
git commit -m "fix(web): stop stray file drops from navigating away from the page"
```

---

## Task 5: Profile photo and account avatar

Both call `/api/profile/upload-url` (5 MB) and both already have a `setError` channel. Each loses its bespoke `upload`/`handle` body to `uploadImage`.

**Files:**
- Modify: `apps/web/app/profil/PhotoField.tsx:32-96`
- Modify: `apps/web/app/account/AccountAvatar.tsx:38-107`

**Interfaces:**
- Consumes: `DropZone`, `PROFILE_IMAGE`, `IMAGE_ACCEPT`, `uploadImage`.

- [ ] **Step 1: Rewrite `PhotoField`'s upload and control**

Add imports:

```tsx
import { DropZone } from "../_upload/DropZone";
import { IMAGE_ACCEPT, PROFILE_IMAGE } from "../_upload/accept";
import { uploadImage } from "../_upload/upload-image";
```

Replace the whole `upload` function (lines 32–59) with:

```tsx
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      setLocalPreview(URL.createObjectURL(file));
      const out = await uploadImage<{ uploadUrl: string; storageKey: string }>(
        "/api/profile/upload-url",
        file,
      );
      if ("error" in out) {
        setError(out.error);
        return;
      }
      onChange(out.ok.storageKey);
    } finally {
      setBusy(false);
    }
  }
```

Note the preview now moves *into* `upload`, so drop and click no longer each have to remember to set it.

Replace the outer `<div className="flex flex-col gap-2">` of the returned JSX with:

```tsx
    <DropZone
      accept={PROFILE_IMAGE}
      onFile={(file) => void upload(file)}
      onReject={(messages) => setError(messages[0] ?? null)}
      label="Foto hier ablegen"
      disabled={busy}
      className="flex flex-col gap-2"
    >
```

and its closing `</div>` with `</DropZone>`. In the `<input>`, set `accept={IMAGE_ACCEPT}` and simplify `onChange` to:

```tsx
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void upload(file);
        }}
```

- [ ] **Step 2: Rewrite `AccountAvatar` the same way**

Same three imports (paths `../_upload/…`). Replace the `handle` function body (lines 38–66) with the `uploadImage` form above, keeping its trailing `savePhotoAction` call:

```tsx
  async function handle(file: File) {
    setBusy(true);
    setError(null);
    try {
      setLocalPreview(URL.createObjectURL(file));
      const out = await uploadImage<{ uploadUrl: string; storageKey: string }>(
        "/api/profile/upload-url",
        file,
      );
      if ("error" in out) {
        setError(out.error);
        return;
      }
      const saved = await savePhotoAction(out.ok.storageKey);
      if (saved.error) setError(saved.error);
    } finally {
      setBusy(false);
    }
  }
```

Wrap the returned tree in the same `DropZone` (`onFile={(file) => void handle(file)}`, `label="Bild hier ablegen"`), and set the input's `accept={IMAGE_ACCEPT}` with the simplified `onChange`.

- [ ] **Step 3: Verify manually**

Run: `pnpm --filter @bdas/web dev`. Sign in, open `/account`, drag a PNG onto the avatar circle.
Expected: dashed red border with "Bild hier ablegen"; the photo uploads on release and the circle updates. Then drag a PDF onto it: expected "…: nur JPEG, PNG, WebP oder AVIF." in red, and **no** `/api/profile/upload-url` request in the Network tab.

- [ ] **Step 4: Test, typecheck, lint**

Run: `pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/profil/PhotoField.tsx apps/web/app/account/AccountAvatar.tsx
git commit -m "feat(web): accept dropped images for profile photo and account avatar"
```

---

## Task 6: Event cover image

`EventFields` renders a *visible* input with `accept="image/*"`, promising more than the route accepts. This task adds drop and closes that gap. Errors here go through `alert()` — keep that; do not introduce a second error idiom in this file.

**Files:**
- Modify: `apps/web/app/admin/events/_editor/EventFields.tsx:45-102`

**Interfaces:**
- Consumes: `DropZone`, `CONTENT_IMAGE`, `IMAGE_ACCEPT`, `uploadImage`.

- [ ] **Step 1: Rewrite `uploadCover`**

Add imports (verify depth — `_editor/` is three levels below `app/`):

```tsx
import { DropZone } from "../../../_upload/DropZone";
import { CONTENT_IMAGE, IMAGE_ACCEPT } from "../../../_upload/accept";
import { uploadImage } from "../../../_upload/upload-image";
```

Replace lines 45–68 with:

```tsx
  async function uploadCover(file: File) {
    setCoverBusy(true);
    try {
      const out = await uploadImage<{ uploadUrl: string; publicUrl: string; storageKey: string }>(
        `/api/events/${d.eventId}/upload-url`,
        file,
      );
      if ("error" in out) {
        alert(out.error);
        return;
      }
      setCoverKey(out.ok.storageKey);
      setCoverUrl(out.ok.publicUrl);
    } finally {
      setCoverBusy(false);
    }
  }
```

- [ ] **Step 2: Wrap the cover field**

Replace lines 84–102 with:

```tsx
      {d.eventId !== "" && (
        <Field label="Titelbild (optional)" htmlFor="cover">
          <DropZone
            accept={CONTENT_IMAGE}
            onFile={(file) => void uploadCover(file)}
            onReject={(messages) => alert(messages[0])}
            label="Titelbild hier ablegen"
            disabled={coverBusy}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                className="mb-2 max-h-48 w-full rounded-bdas object-cover"
              />
            ) : null}
            <input
              id="cover"
              type="file"
              accept={IMAGE_ACCEPT}
              disabled={coverBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadCover(f);
              }}
            />
            <input type="hidden" name="coverImageKey" value={coverKey} />
            {coverBusy ? <p className="mt-1 text-sm text-bdas-ink-muted">Lädt hoch…</p> : null}
          </DropZone>
        </Field>
      )}
```

- [ ] **Step 3: Verify manually**

Run: `pnpm --filter @bdas/web dev`. As a federal admin or group lead, open an event's edit page and drop a JPEG on the Titelbild field.
Expected: it uploads and previews. Then drop a 12 MB PNG: alert "…: größer als 10 MB.", no request.

- [ ] **Step 4: Guard the events acceptance spec**

`e2e/events.e2e.ts` is not branch-protected but catches create-flow redirect regressions in exactly this editor.

Run: `pnpm e2e events`
Expected: PASS. A failure means the `Field` subtree change broke the form — fix before committing.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/admin/events/_editor/EventFields.tsx
git commit -m "feat(web): accept a dropped event cover image and match the server allowlist"
```

---

## Task 7: Puck content image — scope item 3

Static analysis says this is safe (see finding 2 above): Puck 0.22.2 drags via `@dnd-kit` 0.4.0, which activates on `pointerdown`/`pointermove` and registers no native `dragenter`/`dragover`/`drop` listeners at all; its one native `dragstart` listener exists to *yield* to a competing HTML5 drag. An OS file drag and a Puck block drag cannot collide. Step 1 confirms that empirically because it costs two minutes.

**Files:**
- Modify: `apps/web/app/_content/FotoField.tsx:22-79`

**Interfaces:**
- Consumes: `DropZone`, `CONTENT_IMAGE`, `IMAGE_ACCEPT`, `uploadImage`. Note this surface sends an extra `slug` in the signing payload — that is what `uploadImage`'s `extra` argument is for.

- [ ] **Step 1: Confirm the drop reaches the field**

Run: `pnpm --filter @bdas/web dev`, open a Puck-edited page's editor route, select a block with a Foto field. In the DevTools console:

```js
document.querySelectorAll("[data-dropzone], input[type=file]").forEach((el) => {
  el.addEventListener("dragenter", () => console.log("[spike] dragenter", el));
  el.addEventListener("drop", (e) => console.log("[spike] drop", e.dataTransfer.files.length, el));
});
```

Drag an image over the Foto field and release.
Expected: `[spike] dragenter` and `[spike] drop 1`, and the Puck block does not move.

**If no `drop` is logged:** stop, revert this file, and record the finding — the other five surfaces are unaffected. Given the dnd-kit evidence this should not happen; if it does, the cause is something other than a drag-system conflict and deserves its own investigation rather than a workaround here.

- [ ] **Step 2: Rewrite the upload and wrap the field**

Add imports:

```tsx
import { DropZone } from "../_upload/DropZone";
import { CONTENT_IMAGE, IMAGE_ACCEPT } from "../_upload/accept";
import { uploadImage } from "../_upload/upload-image";
```

Replace `upload` (lines 22–54) with:

```tsx
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const out = await uploadImage<{ uploadUrl: string; publicUrl: string }>(
        "/api/content/upload-url",
        file,
        { slug },
      );
      if ("error" in out) {
        setError(out.error);
        return;
      }
      onChange(out.ok.publicUrl);
    } finally {
      setBusy(false);
    }
  }
```

Replace the outer `<div className="flex flex-col gap-2">` with:

```tsx
    <DropZone
      accept={CONTENT_IMAGE}
      onFile={(file) => void upload(file)}
      onReject={(messages) => setError(messages[0] ?? null)}
      label="Foto hier ablegen"
      disabled={busy}
      className="flex flex-col gap-2"
    >
```

and its closing `</div>` with `</DropZone>`. Set the input's `accept={IMAGE_ACCEPT}`.

- [ ] **Step 3: Verify manually**

Drop an image onto the Foto field in the Puck editor.
Expected: it uploads and previews, and the surrounding Puck block does not move.

- [ ] **Step 4: Verify the content acceptance spec**

Run: `pnpm e2e content-pages`
Expected: PASS. This spec already exercises Puck block dragging (`e2e/content-pages.e2e.ts:118`), so it is the guard that block DnD still works.

- [ ] **Step 5: Test, typecheck, lint, commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_content/FotoField.tsx
git commit -m "feat(web): accept a dropped image in the Puck Foto field"
```

---

## Task 8: Tiptap drop and paste, via Tiptap's own FileHandler

Do **not** hand-write ProseMirror handlers. `@tiptap/extension-file-handler` provides `onDrop(editor, files, pos)` and `onPaste(editor, files)` directly. Paste is the bigger everyday win: screenshot → Ctrl+V.

**Files:**
- Create: `apps/web/app/_upload/editor-file-handler.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/app/_blog/PostEditor.tsx:44-88`
- Modify: `apps/web/app/admin/events/_editor/RichTextEditor.tsx` (the matching `extensions` array and `addImage`)

**Interfaces:**
- Consumes: `CONTENT_IMAGE`, `intakeFiles`, `IMAGE_ACCEPT` (Task 1), `uploadImage` (Task 2).
- Produces: `imageFileHandler(opts: { endpoint: string; onError: (message: string) => void }): Extension` — a configured `FileHandler`, so a third editor is one line.

- [ ] **Step 1: Install the extension**

Run: `pnpm --filter @bdas/web add @tiptap/extension-file-handler@3.27.4`

Confirm the pin matches the other Tiptap packages exactly:
Run: `node -e "const d=require('./apps/web/package.json').dependencies; console.log(Object.entries(d).filter(([k])=>k.startsWith('@tiptap')))"`
Expected: every `@tiptap/*` entry reads `3.27.4`. It has no runtime dependencies; its peers are already satisfied.

- [ ] **Step 2: Write the shared factory**

Create `apps/web/app/_upload/editor-file-handler.ts`:

```ts
/**
 * Drop and paste images into a Tiptap document. The drop/paste plumbing —
 * intercepting the event, resolving the drop position — is Tiptap's own
 * `FileHandler` extension; this only decides what is acceptable and what to do
 * with the bytes.
 *
 * `allowedMimeTypes` is deliberately not passed: it filters silently, so a
 * dropped PDF would vanish with no explanation. `intakeFiles` gives the same
 * German messages every other upload surface gives, and enforces the size cap,
 * which `allowedMimeTypes` does not.
 */
import FileHandler from "@tiptap/extension-file-handler";
import type { Editor, Extension } from "@tiptap/core";

import { CONTENT_IMAGE, intakeFiles } from "./accept";
import { uploadImage } from "./upload-image";

async function insert(
  editor: Editor,
  endpoint: string,
  files: readonly File[],
  onError: (message: string) => void,
  pos: number | null,
): Promise<void> {
  let at = pos;
  for (const file of files) {
    const out = await uploadImage<{ uploadUrl: string; publicUrl: string }>(endpoint, file);
    if ("error" in out) {
      onError(out.error);
      continue;
    }
    const image = { type: "image", attrs: { src: out.ok.publicUrl } };
    if (at === null) editor.chain().focus().insertContent(image).run();
    else editor.chain().focus().insertContentAt(at, image).run();
    // Subsequent images in the same drop go after the one just inserted.
    if (at !== null) at = editor.state.selection.to;
  }
}

export function imageFileHandler(opts: {
  endpoint: string;
  onError: (message: string) => void;
}): Extension {
  const take = (files: File[]) => {
    const { accepted, rejected } = intakeFiles(files, CONTENT_IMAGE);
    if (rejected.length > 0) opts.onError(rejected.join("\n"));
    return accepted;
  };

  return FileHandler.configure({
    // Without this, pasting a screenshot copied from a web page inserts both
    // the upload and the clipboard's own HTML <img>.
    consumePasteEvent: true,
    onDrop: (editor, files, pos) => {
      const accepted = take(files);
      if (accepted.length > 0) void insert(editor, opts.endpoint, accepted, opts.onError, pos);
    },
    onPaste: (editor, files) => {
      const accepted = take(files);
      if (accepted.length > 0) void insert(editor, opts.endpoint, accepted, opts.onError, null);
    },
  });
}
```

- [ ] **Step 3: Wire it into `PostEditor`**

Add imports:

```tsx
import { IMAGE_ACCEPT } from "../_upload/accept";
import { imageFileHandler } from "../_upload/editor-file-handler";
import { uploadImage } from "../_upload/upload-image";
```

Add one entry to the `extensions` array (currently lines 44–48), after `Youtube.configure(…)`:

```tsx
      imageFileHandler({ endpoint: "/api/blog/upload-url", onError: (m) => alert(m) }),
```

`editorProps` is **unchanged** — `attributes` stays exactly as it is. Then collapse `addImage`'s body (lines 66–86) so the toolbar button takes the same path as the drop:

```tsx
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const out = await uploadImage<{ uploadUrl: string; publicUrl: string }>(
        "/api/blog/upload-url",
        file,
      );
      if ("error" in out) {
        alert(out.error);
        return;
      }
      editor.chain().focus().setImage({ src: out.ok.publicUrl }).run();
    };
```

and set `input.accept = IMAGE_ACCEPT;` in place of `"image/*"` (line 65).

- [ ] **Step 4: Wire the same into `RichTextEditor`**

Identical, with two differences: the endpoint is `` `/api/events/${eventId}/upload-url` ``, and the import paths are `../../../_upload/…`.

- [ ] **Step 5: Verify manually**

Run: `pnpm --filter @bdas/web dev`. In the blog post editor:
1. Drag a PNG into the middle of a paragraph → it lands at the pointer, not at the end.
2. Copy a screenshot to the clipboard, click into the editor, Cmd/Ctrl+V → it uploads and appears **once** (a duplicate means `consumePasteEvent` is not set).
3. Drag a PDF in → alert "…: nur JPEG, PNG, WebP oder AVIF.", nothing inserted.
4. Drop two PNGs at once → both appear, in order.
Repeat 1 and 2 in an event's description editor.

- [ ] **Step 6: Test, typecheck, lint**

Run: `pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/app/_upload/editor-file-handler.ts \
  apps/web/app/_blog/PostEditor.tsx apps/web/app/admin/events/_editor/RichTextEditor.tsx
git commit -m "feat(web): drop and paste images into the blog and event editors"
```

---

## Task 9: Fold `FileUploader` onto the shared zone

`FileUploader` already has drop, but its `onDragLeave` sets a boolean, so the highlight flickers whenever the pointer crosses a child. It keeps its own MIME set and 25 MB cap (documents, not images) — which is exactly what the `accept` prop takes, so no escape hatch is needed.

**Files:**
- Modify: `apps/web/app/_files/FileUploader.tsx:50-119`

**Interfaces:**
- Consumes: `DropZone`.

- [ ] **Step 1: Replace the hand-rolled drop handlers**

Add `import { DropZone } from "../_upload/DropZone";`.

Delete the `dragOver` state (line 51) and the four inline drag handlers. Build this surface's spec from its props — it is already given both halves:

```tsx
  const spec = useMemo(
    () => ({ mime: acceptMime, maxBytes, maxLabel: formatFileSize(maxBytes) }),
    [acceptMime, maxBytes],
  );
```

The existing `allowedMime` memo (line 53) stays: `runUploads` still validates per file through `validateFile`, and reports failures in the item list.

Wrap the existing dashed-border `<div>` in:

```tsx
    <DropZone
      accept={spec}
      onFiles={(files) => void upload(files)}
      onReject={() => {
        /* per-file failures already surface in the list below. */
      }}
      label="Dateien hier ablegen"
      disabled={busy}
    >
```

Change `upload`'s signature from `(fileList: FileList | null)` to `(files: readonly File[])`, drop the `Array.from(fileList)`, and make the hidden input's `onChange` read `void upload(Array.from(e.target.files ?? []))`.

- [ ] **Step 2: Verify the highlight no longer flickers**

Run: `pnpm --filter @bdas/web dev`, open a folder under `/dateien` (needs `BDAS_FLAG_FILES=true` locally), drag a file slowly across the drop area including over the "Bis zu 25 MB" text.
Expected: the red dashed border stays lit. Before this task it blinks off when crossing the text.

- [ ] **Step 3: Verify the files acceptance spec**

Run: `pnpm e2e files`
Expected: PASS — the hidden input is untouched, so `setInputFiles` still works.

- [ ] **Step 4: Test, typecheck, lint, commit**

```bash
pnpm --filter @bdas/web test && pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web lint
git add apps/web/app/_files/FileUploader.tsx
git commit -m "fix(web): keep the file dropzone highlight steady across child elements"
```

---

## Task 10: End-to-end coverage of a real drop

The one automated test that actually dispatches a drop, so the wiring cannot silently rot. Playwright cannot drag from the OS, so the drop is synthesised with a `DataTransfer` built in the page.

**Files:**
- Modify: `e2e/blog.e2e.ts`

**Interfaces:**
- Consumes: `registerVerifyLogin` (`e2e/helpers/flows.ts:91`), `uniqueEmail` and `activateMemberByEmail` (`e2e/helpers/db.ts`) — all three are already imported at the top of `e2e/blog.e2e.ts`. Do not add a helper.

- [ ] **Step 1: Write the spec**

Add inside the existing `test.describe("blog", …)`. The setup mirrors the neighbouring specs: `registerVerifyLogin` creates a `pending` member, so the account must be activated before `/blog/neu` renders the form (see the file's header comment).

```ts
test("drops an image into the post editor", async ({ page }) => {
  const email = uniqueEmail("blog-drop");
  await registerVerifyLogin(page, email);
  await activateMemberByEmail(email);

  await page.goto("/blog/neu");
  const editor = page.locator('.ProseMirror[contenteditable="true"]');
  await editor.click();

  await page.evaluate(async () => {
    const png = await fetch(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    ).then((r) => r.blob());
    const transfer = new DataTransfer();
    transfer.items.add(new File([png], "drop.png", { type: "image/png" }));
    const target = document.querySelector('.ProseMirror[contenteditable="true"]');
    if (!target) throw new Error("editor not found");
    const rect = target.getBoundingClientRect();
    for (const type of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
          clientX: rect.left + 10,
          clientY: rect.top + 10,
        }),
      );
    }
  });

  await expect(editor.locator("img")).toHaveCount(1);
});
```

- [ ] **Step 2: Run the spec**

Run: `pnpm e2e blog`
Expected: PASS. If the image never appears, check the browser console — a 422 means a client spec and a route have drifted apart, which after Task 1 should be impossible.

- [ ] **Step 3: Run the whole acceptance suite**

Run: `pnpm e2e`
Expected: PASS. `events`, `content-pages` and `files` all touch surfaces this plan modified.

- [ ] **Step 4: Commit**

```bash
git add e2e/blog.e2e.ts
git commit -m "test(e2e): cover dropping an image into the post editor"
```

---

## Adding a future picture field

The measure of whether this landed: a new surface should be three imports and a wrapper.

```tsx
import { DropZone } from "../_upload/DropZone";
import { CONTENT_IMAGE, IMAGE_ACCEPT } from "../_upload/accept";
import { uploadImage } from "../_upload/upload-image";

async function upload(file: File) {
  const out = await uploadImage<{ uploadUrl: string; publicUrl: string }>(endpoint, file);
  if ("error" in out) return setError(out.error);
  onChange(out.ok.publicUrl);
}

<DropZone accept={CONTENT_IMAGE} onFile={(f) => void upload(f)} onReject={(m) => setError(m[0]!)} label="…">
  {/* the existing preview + hidden input + button */}
</DropZone>
```

Stray-drop protection is already global. A new *editor* is one line: `imageFileHandler({ endpoint, onError })` in its `extensions` array. A new route reuses a spec from `accept.ts`, or adds one there — never a local `MAX_BYTES`.

---

## Review

Per CLAUDE.md §4:

- [ ] `/review` on the PR.
- [ ] `/security-review` — this PR touches file upload paths **and now edits the four signing routes**. The question to press on: Task 1 must change only where the numbers come from, never whether a check runs. Every route keeps its own guard, executing server-side, with its response strings byte-identical; `route.test.ts` for `profile` and `content` is the regression net.
- [ ] One PR: a single cross-cutting UI capability, not a module.
- [ ] Confirm whether `@tiptap/extension-file-handler` warrants an ADR (see finding 1 — assessed as within the existing Tiptap pin, not a substitution).
