import type { Route } from "next";
import Link from "next/link";

import type { FaqBlock, FaqEntry } from "../../content/faq";

function Block({ block }: { block: FaqBlock }) {
  switch (block.kind) {
    case "p":
      return <p className="mb-3 text-bdas-ink-body">{block.text}</p>;
    case "steps":
      return (
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-bdas-ink-body">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "link":
      return (
        <Link
          href={block.href as Route}
          className="mb-1 mr-2 inline-flex items-center gap-1.5 rounded-bdas-pill bg-bdas-red px-4 py-1.5 text-sm font-semibold text-white"
        >
          {block.label} →
        </Link>
      );
  }
}

/** One FAQ entry as the design-system disclosure accordion. `defaultOpen` lets a
 *  highlighted sub-role's entries start expanded. */
export function FaqAccordion({
  entry,
  defaultOpen = false,
}: {
  entry: FaqEntry;
  defaultOpen?: boolean;
}) {
  return (
    <details className="bdas-accordion" open={defaultOpen}>
      <summary>{entry.question}</summary>
      <div>
        {entry.body.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>
    </details>
  );
}
