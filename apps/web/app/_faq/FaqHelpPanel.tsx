"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Dialog, Input } from "@bdas/design-system";

import type { FaqHelpEntry } from "../api/faq/help/route";
import { FaqRichText } from "../faq/FaqRichText";
import { searchEntries } from "../../lib/faq/help";

/**
 * Panel body. `contextEntries` are the entries pinned to this route; when
 * there are none the panel shows `popular` instead (Spec §7). The mini-search
 * always runs over `allEntries` — everything the viewer may see.
 */
export function FaqHelpPanel({
  open,
  onClose,
  loading,
  error,
  contextEntries,
  popular,
  allEntries,
  onSubmitQuestion,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: boolean;
  contextEntries: readonly FaqHelpEntry[];
  popular: readonly FaqHelpEntry[];
  allEntries: readonly FaqHelpEntry[];
  onSubmitQuestion: () => void;
}) {
  const [query, setQuery] = useState("");

  const searching = query.trim() !== "";
  const shown = useMemo(() => {
    if (searching) return searchEntries(allEntries, query);
    return contextEntries.length > 0 ? contextEntries : popular;
  }, [searching, query, allEntries, contextEntries, popular]);

  const heading = searching
    ? "Suchergebnisse"
    : contextEntries.length > 0
      ? "Passend zu dieser Seite"
      : "Beliebte Fragen";

  return (
    <Dialog open={open} onClose={onClose} title="Hilfe">
      <div className="flex flex-col gap-4">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Im FAQ suchen"
          aria-label="Im FAQ suchen"
        />
        <h3 className="text-sm font-bold text-bdas-ink">{heading}</h3>

        {error ? (
          <p className="text-sm text-bdas-ink-muted">
            Die Hilfe konnte gerade nicht geladen werden. Bitte versuch es später noch einmal.
          </p>
        ) : loading ? (
          <p className="text-sm text-bdas-ink-muted">Wird geladen …</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-bdas-ink-muted">
            Dazu gibt es noch keine Antwort — reich die Frage gern ein.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {shown.map((e) => (
              <details key={e.id} className="bdas-accordion">
                <summary>{e.question}</summary>
                <div>
                  <FaqRichText doc={e.body} />
                </div>
              </details>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3 border-t border-bdas-soft pt-3">
          <Link
            href="/faq"
            className="text-sm font-semibold text-bdas-red transition-colors duration-bdas-quick ease-bdas hover:underline"
          >
            Alle FAQ ansehen
          </Link>
          <button
            type="button"
            onClick={onSubmitQuestion}
            className="text-sm font-semibold text-bdas-ink-body transition-colors duration-bdas-quick ease-bdas hover:text-bdas-ink"
          >
            Frage einreichen
          </button>
        </div>
      </div>
    </Dialog>
  );
}
