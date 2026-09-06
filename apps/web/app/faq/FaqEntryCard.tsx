"use client";

import type { ReactNode } from "react";

import type { FaqEntryView } from "../../lib/faq/assemble";
import { FaqRichText } from "./FaqRichText";
import { FeedbackButtons } from "./FeedbackButtons";
import { highlightMatches } from "./highlight";
import { YouTubeFacade } from "./YouTubeFacade";

/**
 * One FAQ entry as the shared `.bdas-accordion` disclosure. Chips for topic
 * and video are plain `<span>`s styled with design tokens — `Badge` from
 * `@bdas/design-system` is a numeric count marker (`{count, label}`, renders
 * a number, `null` at `count<=0`) and cannot render a topic name or the word
 * "Video"; the pattern below follows the static-pill precedent already in
 * this codebase at `FaqSection.tsx`'s "Deine Rolle" chip.
 */
export function FaqEntryCard({
  entry,
  query,
  forceOpen,
  onCopyLink,
  relatedQuestions,
}: {
  entry: FaqEntryView;
  query: string;
  forceOpen: boolean;
  onCopyLink: (id: string) => void;
  relatedQuestions: ReadonlyArray<{ id: string; question: string }>;
}): ReactNode {
  return (
    <details
      // A remount, not controlled `open` + `onToggle` state: an uncontrolled
      // `<details>` ignores further prop changes to `open` once the user has
      // toggled it themselves, so flipping `forceOpen` later (a new search
      // hit, a new hash target) would otherwise silently do nothing. Varying
      // the key forces React to tear down and recreate the DOM node instead.
      key={entry.id + (forceOpen ? "-f" : "")}
      id={entry.id}
      className="bdas-accordion"
      open={forceOpen}
    >
      <summary className="flex items-center justify-between gap-3">
        <span>{highlightMatches(entry.question, query)}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {entry.topic ? (
            <span className="rounded-bdas-pill border border-bdas-soft px-2 py-0.5 text-xs font-semibold text-bdas-ink-muted">
              {entry.topic.name}
            </span>
          ) : null}
          {entry.youtubeId ? (
            <span className="rounded-bdas-pill border border-bdas-red px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-bdas-red">
              Video
            </span>
          ) : null}
        </span>
      </summary>
      <div>
        <FaqRichText doc={entry.body} />
        {entry.youtubeId ? (
          <YouTubeFacade youtubeId={entry.youtubeId} title={entry.question} />
        ) : null}
        <footer className="mt-3 flex flex-wrap items-center gap-3 border-t border-bdas-soft pt-3 text-xs text-bdas-ink-muted">
          <span>
            Zuletzt aktualisiert:{" "}
            {new Date(entry.updatedAtIso).toLocaleDateString("de-DE", {
              timeZone: "Europe/Berlin",
            })}
          </span>
          <button
            type="button"
            aria-label="Link kopieren"
            onClick={() => onCopyLink(entry.id)}
            className="rounded-bdas-sm border border-bdas-soft px-2 py-0.5 font-semibold text-bdas-ink-muted transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover"
          >
            Link kopieren
          </button>
          {relatedQuestions.length > 0 ? (
            <span className="flex flex-wrap items-center gap-1.5">
              {relatedQuestions.map((related) => (
                <a
                  key={related.id}
                  href={`#${related.id}`}
                  className="rounded-bdas-pill border border-bdas-soft px-2 py-0.5 text-bdas-ink-muted transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover"
                >
                  {related.question}
                </a>
              ))}
            </span>
          ) : null}
          <FeedbackButtons entryId={entry.id} />
        </footer>
      </div>
    </details>
  );
}
