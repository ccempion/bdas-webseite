import { cx } from "../cx";

import { badgeLabel, badgeText } from "./badge-count";

export type BadgeProps = {
  count: number;
  /** Plural noun for screen readers, e.g. "offene Freigaben". */
  label: string;
  className?: string;
};

/**
 * Count marker for "there is something to do here". Red is the brand's
 * active/open accent (CLAUDE.md §7), which is exactly this state.
 *
 * Renders nothing at zero so callers never have to guard the call site.
 */
export function Badge({ count, label, className }: BadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      role="status"
      aria-label={badgeLabel(count, label)}
      className={cx(
        "inline-flex min-w-[1.25rem] items-center justify-center rounded-bdas-full bg-bdas-red px-1.5 py-0.5 text-bdas-submenu-link font-medium leading-none text-white",
        className,
      )}
    >
      {badgeText(count)}
    </span>
  );
}
