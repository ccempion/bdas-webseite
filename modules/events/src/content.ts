/**
 * Server-side rendering of an event's Tiptap JSON to sanitized HTML.
 *
 * Public event pages are React Server Components; we render here so the editor
 * never ships to visitors. Output is sanitized — stored docs are board-authored
 * but we defend in depth (and guest-era content later).
 */
import type { JSONContent } from "@tiptap/core";
import { generateHTML } from "@tiptap/html";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import sanitizeHtml from "sanitize-html";

import type { TiptapDoc } from "./types";

// Images carry an optional `width` (e.g. "50%") set in the editor; teach the
// node about it so generateHTML emits it (the editor uses the same attribute).
const ImageWithWidth = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) => (attrs["width"] ? { width: attrs["width"] } : {}),
        parseHTML: (el) => (el as HTMLElement).getAttribute("width"),
      },
    };
  },
});

// StarterKit v3 bundles Link and Underline; Link is configured through it
// rather than added twice. Underline stays off to match the editor.
const EXTENSIONS = [
  StarterKit.configure({ underline: false, link: { openOnClick: false } }),
  ImageWithWidth,
];

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "img",
    "hr",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width"],
  },
  allowedSchemes: ["https", "http", "mailto"],
  allowedSchemesByTag: { img: ["https", "http"] },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
};

function isEmptyDoc(doc: TiptapDoc | null | undefined): boolean {
  return !doc || !doc.content || doc.content.length === 0;
}

export function renderEventContentHtml(doc: TiptapDoc | null | undefined): string {
  if (!doc || isEmptyDoc(doc)) return "";
  // TiptapDoc is deliberately loose (`ReadonlyArray<unknown>`) so this module's
  // public surface never leaks Tiptap's own types (rule 8). generateHTML takes a
  // JSONContent; widen at this single boundary. Unlike the cast this replaces,
  // it bridges a module-boundary type choice, not two @tiptap/core majors.
  const raw = generateHTML(doc as JSONContent, EXTENSIONS);
  return sanitizeHtml(raw, SANITIZE_OPTS).trim();
}

/** Wrap a plain string as a single-paragraph Tiptap doc (used for previews/seeds). */
export function plainTextToDoc(text: string): TiptapDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  } as TiptapDoc;
}
