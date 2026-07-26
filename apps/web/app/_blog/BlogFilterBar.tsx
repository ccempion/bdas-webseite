import Link from "next/link";

import type { PostCategory } from "@bdas/blog";
import { cx } from "@bdas/design-system";

import { buildBlogHref, CATEGORY_CHIPS, SINCE_OPTIONS, type SinceKey } from "./filters";

// Mirrors core/design-system FilterChip's token styling; rendered as a <Link>
// so filtering stays server-driven (shareable URLs, no client JS) — same
// pattern as apps/web/app/events/EventFilterBar.tsx.
const CHIP =
  "inline-flex items-center rounded-bdas-pill border px-3 py-1 text-bdas-pill transition-colors duration-bdas-quick ease-bdas";
const ON = "border-bdas-strong bg-bdas-red text-white";
const OFF = "border-bdas-soft bg-bdas-surface text-bdas-ink hover:bg-bdas-overlay-hover";

export function BlogFilterBar({
  category,
  zeitraum,
}: {
  category: PostCategory | undefined;
  zeitraum: SinceKey | undefined;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildBlogHref(undefined, zeitraum)}
          aria-current={!category ? "true" : undefined}
          className={cx(CHIP, !category ? ON : OFF)}
        >
          Alle Kategorien
        </Link>
        {CATEGORY_CHIPS.map((c) => (
          <Link
            key={c.key}
            href={buildBlogHref(c.key, zeitraum)}
            aria-current={category === c.key ? "true" : undefined}
            className={cx(CHIP, category === c.key ? ON : OFF)}
          >
            {c.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildBlogHref(category, undefined)}
          aria-current={!zeitraum ? "true" : undefined}
          className={cx(CHIP, !zeitraum ? ON : OFF)}
        >
          Alle
        </Link>
        {SINCE_OPTIONS.map((opt) => (
          <Link
            key={opt.key}
            href={buildBlogHref(category, opt.key)}
            aria-current={zeitraum === opt.key ? "true" : undefined}
            className={cx(CHIP, zeitraum === opt.key ? ON : OFF)}
          >
            {opt.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
