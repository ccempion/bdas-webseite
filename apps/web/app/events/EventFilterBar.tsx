import Link from "next/link";

import { cx } from "@bdas/design-system";

import { buildHref, toggleHref, type OwnerChip } from "./event-filter";

// Mirrors core/design-system FilterChip's token styling; rendered as a <Link>
// so filtering stays server-driven (shareable URLs, no client JS).
const CHIP =
  "inline-flex items-center rounded-bdas-pill border px-3 py-1 text-bdas-pill transition-colors duration-bdas-quick ease-bdas";
const ON = "border-bdas-strong bg-bdas-red text-white";
const OFF = "border-bdas-soft bg-bdas-surface text-bdas-ink hover:bg-bdas-overlay-hover";

export function EventFilterBar({
  chips,
  selected,
  past,
}: {
  chips: ReadonlyArray<OwnerChip>;
  selected: ReadonlySet<string>;
  past: boolean;
}) {
  if (chips.length === 0 && !past) return null;

  return (
    <div className="flex flex-col gap-3">
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildHref(new Set(), past)}
            className={cx(CHIP, selected.size === 0 ? ON : OFF)}
          >
            Alle
          </Link>
          {chips.map((c) => (
            <Link
              key={c.key}
              href={toggleHref(c.key, selected, past)}
              className={cx(CHIP, selected.has(c.key) ? ON : OFF)}
            >
              {c.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div>
        <Link
          href={buildHref(selected, !past)}
          className={cx(CHIP, past ? ON : OFF)}
        >
          {past ? "Nur kommende" : "Vergangene anzeigen"}
        </Link>
      </div>
    </div>
  );
}
