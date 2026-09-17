import { cx } from "@bdas/design-system";

const PARTS = ["Über dich", "Konto", "Angaben"] as const;

/** Füllt pro Teil, nicht pro Frage (Spec §4.4). */
export function Progress({ part }: { part: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Fortschritt" className="mb-6 grid grid-cols-3 gap-2">
      {PARTS.map((label, i) => {
        const n = i + 1;
        const current = n === part;
        return (
          <li
            key={label}
            aria-current={current ? "step" : undefined}
            className="flex flex-col gap-1"
          >
            <span
              className={cx(
                "h-1 rounded-bdas-full transition-colors duration-bdas-slow ease-bdas",
                n <= part ? "bg-bdas-ink" : "bg-bdas-overlay-soft",
              )}
            />
            <span
              className={cx(
                "text-xs",
                current ? "font-semibold text-bdas-ink" : "text-bdas-ink-muted",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
