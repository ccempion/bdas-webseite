import type { ReactNode } from "react";

import { cx } from "../cx";

export type FilterChipProps = {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
};

/** Toggleable pill for inline filtering (calendar, lists). */
export function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex items-center rounded-bdas-pill border px-3 py-1 text-bdas-pill transition-colors duration-bdas-quick ease-bdas",
        active
          ? "border-bdas-strong bg-bdas-red text-white"
          : "border-bdas-soft bg-bdas-surface text-bdas-ink hover:bg-bdas-overlay-hover",
      )}
    >
      {children}
    </button>
  );
}
