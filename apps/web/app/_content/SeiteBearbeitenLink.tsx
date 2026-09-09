import Link from "next/link";
import React from "react";

/**
 * Edit affordance above a board-editable content page. The page title is
 * authored in the document itself (ADR 0038), so this row is the only chrome a
 * content route still renders — and only for someone who may edit it. Visitors
 * get the document alone.
 */
export function SeiteBearbeitenLink({
  href,
  breiteKlasse,
}: {
  href: string;
  breiteKlasse: string;
}) {
  return (
    <div className={`mx-auto mb-6 flex w-full justify-end px-4 ${breiteKlasse}`}>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
      >
        Seite bearbeiten
      </Link>
    </div>
  );
}
