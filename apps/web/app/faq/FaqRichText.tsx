import type { ReactNode } from "react";

import { renderRichText } from "../_content/rich-text";

/** Thin wrapper: the FAQ entry body is a stored Tiptap document, rendered
 *  through the same allow-list renderer the rest of the site uses. */
export function FaqRichText({ doc }: { doc: unknown }): ReactNode {
  return <div className="text-bdas-ink-body [&_a]:underline">{renderRichText(doc)}</div>;
}
