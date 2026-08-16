import type { FaqSection } from "../../content/faq";
import { FaqAccordion } from "./FaqAccordion";

/**
 * A FAQ section rendered as a collapsible block. The viewer's primary section
 * arrives with `defaultOpen`. The `vorstand` section fans out into per-sub-role
 * subgroups; the subgroup matching the viewer's own grant (in
 * `highlightedSubgroups`) is badged and its entries start expanded.
 */
export function FaqSectionView({
  section,
  defaultOpen,
  highlightedSubgroups,
}: {
  section: FaqSection;
  defaultOpen: boolean;
  highlightedSubgroups: ReadonlySet<string>;
}) {
  return (
    <details open={defaultOpen} className="border-b border-bdas-soft">
      <summary className="cursor-pointer list-none py-4 text-xl font-semibold text-bdas-ink [&::-webkit-details-marker]:hidden">
        {section.title}
      </summary>
      <div className="pb-6">
        {section.intro ? <p className="mb-4 text-bdas-ink-muted">{section.intro}</p> : null}

        {section.subgroups ? (
          <div className="flex flex-col gap-6">
            {section.subgroups.map((sub) => {
              const highlighted = highlightedSubgroups.has(sub.id);
              return (
                <div key={sub.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-base font-semibold text-bdas-ink">{sub.title}</h3>
                    {highlighted ? (
                      <span className="rounded-bdas-pill border border-bdas-red px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-bdas-red">
                        Deine Rolle
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    {sub.entries.map((entry) => (
                      <FaqAccordion key={entry.id} entry={entry} defaultOpen={highlighted} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {section.entries.map((entry) => (
              <FaqAccordion key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
