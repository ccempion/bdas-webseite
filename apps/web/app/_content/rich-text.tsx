import React, { Fragment, type ReactNode } from "react";

import { bildBreiteClass, normalizeBildBreite } from "./bild-breite";
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

/** Whether body text flows past an inline image, and on which side.
 *  `keine` is the default: an image that does not wrap sits on its own line.
 *
 *  Deliberately not called `Ausrichtung` — that is a different, shipped
 *  concept on this surface (block-level `links | mittig | rechts`), and one
 *  word for two things would be a trap. */
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

/** True when a stored Tiptap document would render to nothing visible.
 *  `{ type: "doc", content: [{ type: "paragraph" }] }` — Fließtext's own
 *  defaultProps — counts as empty: it is one paragraph with no children. */
export function istLeererRichText(doc: unknown): boolean {
  const content = (doc as { content?: unknown[] } | null | undefined)?.content;
  if (!Array.isArray(content) || content.length === 0) return true;
  return content.every((node) => {
    const kinder = (node as { content?: unknown[] } | null | undefined)?.content;
    return !Array.isArray(kinder) || kinder.length === 0;
  });
}
