# Bilder im Fließtext mit Textumfluss — Design

**Date:** 2026-08-10
**Status:** Approved (brainstormed with product owner) — one decision open, see §9
**Scope:** Inline images inside the `Fliesstext` block, sized and optionally floated so body text wraps around them. `apps/web/app/_content/` only. No `content` module, schema, migration, or flag change.

---

## 1. Context and decisions

The request, in the product owner's words: _"when I am writing text, the picture should be able to be inserted into the text, and then the text should continue within the empty space the picture makes free."_ That is the Word / Google Docs model — the image lives **inside** the text flow, not as a separate block above it.

**What already exists.** The blog and events editors both support inline images in rich text, uploaded by drag and paste through the shared `imageFileHandler` (`apps/web/app/_upload/editor-file-handler.ts`), with width presets `["25%", "50%", "75%", "100%"]` applied by a Tiptap `ImageWithWidth` node extension (`modules/blog/src/content.ts:21`).

**What is missing everywhere.** None of the three editors wrap text. They carry a `width` attribute but no float, so a 50 % image sits alone on its line with dead space beside it — exactly the complaint, and it applies to the blog too.

**What is missing in `Fliesstext` specifically.** Images entirely. `RichTextField` loads StarterKit only, and the typed renderer (`rich-text.tsx`) handles `text`, `paragraph`, `bulletList`, `orderedList`, `listItem` and `hardBreak` — there is no image node.

Decisions made during brainstorming:

- **Fließtext only, for now.** Blog and events keep their current no-wrap images. Proving the interaction on one surface first is cheaper than changing three modules at once. Recorded as a known inconsistency, not an oversight.
- **The float lives inside the block, so the root layout is untouched.** Every `<p>` the renderer emits is a sibling in one formatting context, so a floated `<img>` wraps them naturally. And because the `Fliesstext` block is itself a flex item in the root column, it **contains its own floats** — the following Puck block is unaffected with no clearfix. The flex constraint that blocks wrapping _between_ blocks does not apply here.
- **No HTML, ever (ADR 0023).** The blog reaches its rendering through `generateHTML` + `sanitizeHtml`. Content pages must not: ADR 0023 stores no HTML, and the palette-expansion spec (2026-07-18) explicitly rejected the blog's path for this surface. `Fliesstext` gets a new typed `case "image"` in `rich-text.tsx` instead.
- **Reuse the existing upload path.** `imageFileHandler({ endpoint, onError })` is already generic, and `/api/content/upload-url` is the signed-upload endpoint `FotoField` already uses. No new route, no new intake rules.
- **Alt text is required, not optional.** The standalone `Bild` block has a dedicated field labelled _Alt-Text (Barrierefreiheit)_. An inline image that cannot carry alt text would be a regression in accessibility on the same page.

## 2. Goals and non-goals

**Goals**

- Insert an image into body text by drag, paste, or a toolbar button.
- Choose its width from presets, and choose whether text flows to its left, its right, or not at all.
- Give it alt text.
- Public rendering stays HTML-free and passes through the existing typed renderer.

**Non-goals**

- No change to the blog or events editors.
- No wrapping _between_ Puck blocks — that would require changing the root container from flex to block layout across all seven public pages, and is not what was asked for.
- No captions on inline images. The standalone `Bild` block owns the captioned case.
- No text wrap on mobile (see §5).

## 3. Relationship to the standalone `Bild` block

Both stay. They answer different needs:

|           | `Bild` block                                          | Inline image in `Fliesstext` |
| --------- | ----------------------------------------------------- | ---------------------------- |
| Position  | its own row in the column                             | inside the text flow         |
| Text wrap | no                                                    | yes                          |
| Caption   | yes (`bildunterschrift`)                              | no                           |
| Sized by  | drag handle (see `2026-08-10-bild-groesse-design.md`) | toolbar presets              |

## 4. Editor side — `RichTextField.tsx`

- Extend Tiptap's `Image` node with three attributes: `width`, `ausrichtung` (`"keine" | "links" | "rechts"`), and `alt`.
- Add `imageFileHandler({ endpoint: "/api/content/upload-url", onError })` to the extension list, matching how the blog and events editors wire it.
- Toolbar gains a **Bild** button, and — when `editor.isActive("image")` — a width control, a wrap control, and an alt-text input, following the existing `editor.isActive("image")` pattern in `PostEditor.tsx:157`.

## 5. Renderer side — `rich-text.tsx`

New `case "image"` in `renderNode`:

- Validate `src` through the existing `safeHref`. An unsafe or unparseable src renders **nothing**, matching how the renderer already drops unsafe link hrefs.
- Emit `<img>` with `alt` (defaulting to `""` so a decorative image is not announced as "image").
- Classes come from a lookup of literal strings — width class plus float class, never template-interpolated.

Float and the mobile rule combine as, for example, `w-full sm:float-left sm:w-1/2 sm:mr-4 sm:mb-2`: full width and no float below the `sm` breakpoint, wrap above it. This matches the mobile decision already taken for the `Bild` block — a floated 25 % image on a 380 px phone would leave an unreadable ribbon of text beside it.

## 6. Security

`src` validation in the renderer is the load-bearing control, mirroring the existing "render side allow-lists on top of the editor side — defence in depth" comment in `rich-text-config.ts`. Unknown node types are already ignored by `renderNode`'s `switch`, so an injected node type cannot render.

## 7. Testing

Extend `apps/web/app/_content/rich-text.test.ts` (node env, `renderToStaticMarkup`):

- A valid image src renders an `<img>` with the expected width and float classes, for every combination of preset and wrap value.
- A `javascript:` src renders nothing — the direct analogue of the existing unsafe-link test.
- `alt` passes through; a missing `alt` emits `alt=""`.
- `ausrichtung: "keine"` emits no float class.

No new E2E: image upload is already covered by the existing files/blog specs, and the wrap is a pure rendering property better asserted in unit tests.

## 8. Risks

- **Tall floats.** An image floated beside a short paragraph overhangs into whatever follows _inside the same Fließtext block_. This is normal float behaviour and is what the board asked for, but it is worth a look during implementation to decide whether the block should clear its floats at the end. It cannot affect other Puck blocks — see §1.

## 9. Open decision

**Which width scale?** The blog and events editors use four steps — `25 / 50 / 75 / 100 %`. The approved `Bild` drag-handle spec proposes six — `25 / 33 / 50 / 66 / 75 / 100 %`. Shipping both would put two different image scales on the same page.

Recommendation: **align everything on content pages to the existing four steps**, so the whole codebase has one image scale and the drag handle gets larger, easier snap targets. This revises the six-step choice made earlier, on the strength of the codebase precedent discovered afterwards. Requires the product owner's confirmation before either spec is implemented.
