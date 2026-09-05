"use client";

import { Combobox } from "@bdas/design-system";

import { toggleId } from "./related-picker";

export function RelatedEntriesPicker({
  allEntries,
  selfId,
  selectedIds,
  onChange,
}: {
  allEntries: ReadonlyArray<{ id: string; question: string }>;
  selfId: string | null;
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const selected = new Set(selectedIds);
  const options = allEntries
    .filter((e) => e.id !== selfId && !selected.has(e.id))
    .map((e) => ({ value: e.id, label: e.question }));
  const byId = new Map(allEntries.map((e) => [e.id, e.question]));

  return (
    <div className="flex flex-col gap-2">
      <Combobox
        label="Verwandte Frage hinzufügen"
        placeholder="Frage suchen…"
        options={options}
        value=""
        onChange={(id) => {
          if (id) onChange(toggleId(selectedIds, id));
        }}
      />
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => (
            <span
              key={id}
              className="flex items-center gap-1.5 rounded-bdas-pill border border-bdas-soft px-2 py-0.5 text-sm text-bdas-ink-body"
            >
              {byId.get(id) ?? id}
              <button
                type="button"
                aria-label={`„${byId.get(id) ?? id}" entfernen`}
                onClick={() => onChange(toggleId(selectedIds, id))}
                className="text-bdas-ink-muted hover:text-bdas-red"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
