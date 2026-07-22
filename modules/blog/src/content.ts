/**
 * Server-side rendering of a post's Tiptap JSON to sanitized HTML.
 *
 * Blog feed and single-post pages are React Server Components; we render here so
 * the editor never ships to visitors. Output is sanitized — posts are authored
 * by signed-in users (not just board), so this is a real XSS boundary, not just
 * defense in depth. The allowed set mirrors the editor's capabilities: text
 * formatting, headings, lists, links, images (with width), and YouTube embeds.
 */
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Youtube from "@tiptap/extension-youtube";
import { generateHTML } from "@tiptap/html";
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

const EXTENSIONS = [
  StarterKit,
  ImageWithWidth,
  Link.configure({ openOnClick: false }),
  Youtube.configure({ nocookie: true }),
];

// Only youtube-nocookie/youtube embed hosts are allowed as iframe sources.
const YOUTUBE_IFRAME_RE =
  /^https:\/\/(www\.)?(youtube-nocookie\.com|youtube\.com)\/embed\/[A-Za-z0-9_-]+/;

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
    "iframe",
    "div",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width"],
    div: ["data-youtube-video"],
    iframe: [
      "src",
      "width",
      "height",
      "allow",
      "allowfullscreen",
      "frameborder",
    ],
  },
  allowedSchemes: ["https", "http", "mailto"],
  allowedSchemesByTag: { img: ["https", "http"], iframe: ["https"] },
  allowedIframeHostnames: ["www.youtube-nocookie.com", "www.youtube.com"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
  exclusiveFilter: (frame) =>
    // Drop any iframe whose src is not a YouTube embed URL.
    frame.tag === "iframe" && !YOUTUBE_IFRAME_RE.test(frame.attribs["src"] ?? ""),
};

function isEmptyDoc(doc: TiptapDoc | null | undefined): boolean {
  return !doc || !doc.content || doc.content.length === 0;
}

export function renderPostContentHtml(doc: TiptapDoc | null | undefined): string {
  if (isEmptyDoc(doc)) return "";
  // The repo runs two @tiptap/core majors side by side (the app's editors on
  // v2, Puck's editor on v3). Depending on how pnpm dedupes, the extension
  // instances and generateHTML can be typed against different cores — a purely
  // nominal mismatch (runtime is unaffected; see content.test.ts). Cast both
  // args to generateHTML's own parameter types to bridge it.
  const raw = generateHTML(
    doc as Parameters<typeof generateHTML>[0],
    EXTENSIONS as Parameters<typeof generateHTML>[1],
  );
  return sanitizeHtml(raw, SANITIZE_OPTS).trim();
}

/** Wrap a plain string as a single-paragraph Tiptap doc (used for previews/seeds). */
export function plainTextToDoc(text: string): TiptapDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  } as TiptapDoc;
}
