"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { FilterChip, Input } from "@bdas/design-system";

import type { FaqEntryView, FaqSectionView } from "../../lib/faq/assemble";
import { filterSections } from "./explorer-filter";
import { FaqEntryCard } from "./FaqEntryCard";

type Topic = { id: string; name: string };

/**
 * Top-level client shell for the FAQ page: search + topic filter, a sticky
 * desktop rail with scroll-spy'd section anchors, and deep-link handling.
 *
 * `sections`/`topics` are the already-visibility-narrowed view model from
 * {@link import("../../lib/faq/assemble").assembleFaq} — no server calls or
 * grant checks happen here, only client-side filtering and presentation.
 */
export function FaqExplorer({
  sections,
  topics,
}: {
  sections: FaqSectionView[];
  topics: Topic[];
}): ReactNode {
  const [query, setQuery] = useState("");
  const [topicId, setTopicId] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(sections[0]?.key ?? null);
  const [hashTarget, setHashTarget] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const sectionEls = useRef(new Map<string, HTMLElement>());

  const filtered = useMemo(
    () => filterSections(sections, { query, topicId }),
    [sections, query, topicId],
  );

  // id -> question across every entry (unfiltered), so a related-question
  // chip still resolves its label even when the target is filtered out.
  const questionById = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections) {
      for (const e of section.entries) map.set(e.id, e.question);
      for (const sub of section.subgroups) for (const e of sub.entries) map.set(e.id, e.question);
    }
    return map;
  }, [sections]);

  function relatedFor(entry: FaqEntryView): Array<{ id: string; question: string }> {
    return entry.relatedIds
      .map((id) => {
        const question = questionById.get(id);
        return question ? { id, question } : null;
      })
      .filter((r): r is { id: string; question: string } => r !== null);
  }

  function onCopyLink(id: string) {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    void navigator.clipboard?.writeText(url);
  }

  // "/" focuses the search field, unless the user is already typing somewhere.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Deep-link: read the hash once on mount, open that entry and scroll to it.
  // Read only once — a hash change later (e.g. clicking "Link kopieren" on a
  // different entry) doesn't re-trigger this, matching normal anchor-link
  // behaviour rather than re-navigating the page under the user.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    setHashTarget(id);
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  // Scroll-spy: the rail highlights whichever section heading is currently
  // nearest the top of the viewport, below the sticky site header.
  useEffect(() => {
    const elements = Array.from(sectionEls.current.values());
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveKey(e.target.id.replace(/^bereich-/, ""));
        }
      },
      { rootMargin: "-112px 0px -60% 0px", threshold: 0 },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [filtered]);

  const chips = (
    <>
      <FilterChip active={topicId === null} onClick={() => setTopicId(null)}>
        Alle
      </FilterChip>
      {topics.map((topic) => (
        <FilterChip
          key={topic.id}
          active={topicId === topic.id}
          onClick={() => setTopicId(topicId === topic.id ? null : topic.id)}
        >
          {topic.name}
        </FilterChip>
      ))}
    </>
  );

  return (
    <div>
      <div className="mb-8">
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche"
          aria-label='FAQ durchsuchen ("/" drücken zum Fokussieren)'
        />
        <div
          role="group"
          aria-label="Nach Thema filtern"
          className="mt-3 flex gap-2 overflow-x-auto lg:hidden"
        >
          {chips}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-10">
        <nav
          aria-label="Bereiche"
          className="hidden lg:sticky lg:top-24 lg:block lg:h-fit lg:self-start"
        >
          <ul className="flex flex-col gap-1">
            {filtered.map((section) => (
              <li key={section.key}>
                <a
                  href={`#bereich-${section.key}`}
                  className={
                    activeKey === section.key
                      ? "block rounded-bdas-sm px-2 py-1 text-sm font-semibold text-bdas-red"
                      : "block rounded-bdas-sm px-2 py-1 text-sm text-bdas-ink-muted transition-colors duration-bdas-quick ease-bdas hover:text-bdas-ink"
                  }
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
          <div role="group" aria-label="Nach Thema filtern" className="mt-6 flex flex-col gap-2">
            {chips}
          </div>
        </nav>

        <div>
          {filtered.length === 0 ? (
            <div className="rounded-bdas border border-bdas-soft bg-bdas-surface p-8 text-center">
              <p className="text-lg font-semibold text-bdas-ink">Keine Antwort gefunden.</p>
              <p className="mt-2 text-bdas-ink-muted">
                Stell deine Frage über „Frage einreichen“ — wir beantworten sie dann hier.
              </p>
              {/* PR 4: Submission-Dialog */}
            </div>
          ) : (
            filtered.map((section) => (
              <section
                key={section.key}
                id={`bereich-${section.key}`}
                ref={(el) => {
                  if (el) sectionEls.current.set(section.key, el);
                  else sectionEls.current.delete(section.key);
                }}
                className="scroll-mt-24 border-b border-bdas-soft pb-8 pt-2"
              >
                <h2 className="mb-1 text-xl font-semibold text-bdas-ink">{section.title}</h2>
                {section.intro ? <p className="mb-4 text-bdas-ink-muted">{section.intro}</p> : null}

                {section.entries.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {section.entries.map((entry) => (
                      <FaqEntryCard
                        key={entry.id}
                        entry={entry}
                        query={query}
                        forceOpen={query.length > 0 || entry.id === hashTarget}
                        defaultOpen={section.defaultOpen}
                        onCopyLink={onCopyLink}
                        relatedQuestions={relatedFor(entry)}
                      />
                    ))}
                  </div>
                ) : null}

                {section.subgroups.map((sub) => (
                  <div key={sub.id} className="mt-6">
                    <div className="mb-2 flex items-center gap-2">
                      <h3 className="text-base font-semibold text-bdas-ink">{sub.title}</h3>
                      {sub.highlighted ? (
                        <span className="rounded-bdas-pill border border-bdas-red px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-bdas-red">
                          Deine Rolle
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2">
                      {sub.entries.map((entry) => (
                        <FaqEntryCard
                          key={entry.id}
                          entry={entry}
                          query={query}
                          forceOpen={query.length > 0 || entry.id === hashTarget}
                          defaultOpen={sub.highlighted}
                          onCopyLink={onCopyLink}
                          relatedQuestions={relatedFor(entry)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
