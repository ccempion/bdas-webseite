import React, { Fragment, type ReactNode } from "react";

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
