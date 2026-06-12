import Link from "next/link";

export type ActionItem = { readonly count: number; readonly label: string; readonly href: string };

/** Slim row of work counters; an item with count 0 renders calm (grey). */
export function ActionStrip({ items }: { items: ActionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const lit = it.count > 0;
        return (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center gap-2 rounded-bdas border border-bdas-soft px-3 py-2 text-bdas-ink-body transition-colors hover:bg-bdas-surface-hover"
          >
            <span
              className={`min-w-[22px] rounded-bdas-pill px-2 py-0.5 text-center text-sm font-bold ${
                lit ? "bg-bdas-red text-bdas-surface" : "bg-bdas-surface-hover text-bdas-ink-muted"
              }`}
            >
              {it.count}
            </span>
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
