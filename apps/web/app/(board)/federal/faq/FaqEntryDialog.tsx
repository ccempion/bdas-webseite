"use client";

import { useState, useTransition } from "react";

import { Alert, Dialog, FilterChip, Input } from "@bdas/design-system";
import {
  FAQ_SECTIONS,
  FAQ_SUBGROUPS,
  type FaqSectionKey,
  type FaqSubgroupKey,
  type FaqTopic,
  type TiptapDoc,
} from "@bdas/faq";

import { SECTION_LABELS, VORSTAND_SUBGROUP_LABELS } from "../../../../lib/faq/assemble";
import { FAQ_CONTEXTS } from "../../../../lib/faq/contexts";
import { parseYoutubeInput, youtubeThumbnailUrl } from "../../../../lib/faq/youtube";
import { saveEntryAction } from "./actions";
import { FaqAnswerEditor } from "./FaqAnswerEditor";
import { RelatedEntriesPicker } from "./RelatedEntriesPicker";

export type FaqEntryDialogInitial = {
  id?: string;
  section: FaqSectionKey;
  subgroup: FaqSubgroupKey | null;
  topicId: string | null;
  question: string;
  body: TiptapDoc;
  youtubeId: string | null;
  relatedIds: readonly string[];
  contexts: readonly string[];
  submissionId?: string;
};

function EntryForm({
  initial,
  allEntries,
  topics,
  currentStatus,
  onClose,
}: {
  initial: FaqEntryDialogInitial;
  allEntries: ReadonlyArray<{ id: string; question: string }>;
  topics: readonly FaqTopic[];
  currentStatus: "draft" | "published" | null;
  onClose: () => void;
}) {
  const [section, setSection] = useState(initial.section);
  const [subgroup, setSubgroup] = useState(initial.subgroup);
  const [topicId, setTopicId] = useState(initial.topicId);
  const [question, setQuestion] = useState(initial.question);
  const [body, setBody] = useState<TiptapDoc>(initial.body);
  const [youtubeInput, setYoutubeInput] = useState(initial.youtubeId ?? "");
  const [relatedIds, setRelatedIds] = useState<string[]>([...initial.relatedIds]);
  const [contexts, setContexts] = useState<string[]>([...initial.contexts]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const youtubeId = parseYoutubeInput(youtubeInput);

  function submit(publish: boolean) {
    start(async () => {
      setError(null);
      const res = await saveEntryAction({
        ...(initial.id ? { id: initial.id } : {}),
        section,
        subgroup: section === "vorstand" ? subgroup : null,
        topicId,
        question,
        body,
        youtubeId,
        relatedIds,
        contexts,
        ...(initial.submissionId ? { submissionId: initial.submissionId } : {}),
        publish,
      });
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="error">{error}</Alert>}
      <Input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Frage"
        aria-label="Frage"
      />
      <div className="flex gap-3">
        <select
          value={section}
          onChange={(e) => setSection(e.target.value as FaqSectionKey)}
          className="rounded-bdas border border-bdas-soft px-3 py-2 text-bdas-ink-body"
        >
          {FAQ_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {SECTION_LABELS[s]}
            </option>
          ))}
        </select>
        {section === "vorstand" && (
          <select
            value={subgroup ?? ""}
            onChange={(e) => setSubgroup((e.target.value || null) as FaqSubgroupKey | null)}
            className="rounded-bdas border border-bdas-soft px-3 py-2 text-bdas-ink-body"
          >
            <option value="">— keine —</option>
            {FAQ_SUBGROUPS.map((s) => (
              <option key={s} value={s}>
                {VORSTAND_SUBGROUP_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        <select
          value={topicId ?? ""}
          onChange={(e) => setTopicId(e.target.value || null)}
          className="rounded-bdas border border-bdas-soft px-3 py-2 text-bdas-ink-body"
        >
          <option value="">— kein Thema —</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <FaqAnswerEditor value={body} onChange={setBody} />
      <div className="flex flex-col gap-2">
        <Input
          value={youtubeInput}
          onChange={(e) => setYoutubeInput(e.target.value)}
          placeholder="YouTube-URL oder Video-ID (optional)"
        />
        {youtubeInput.trim() !== "" && !youtubeId && (
          <p className="text-sm text-bdas-red">Keine gültige YouTube-URL/ID erkannt.</p>
        )}
        {youtubeId && (
          // eslint-disable-next-line @next/next/no-img-element -- explizite Board-Eingabe, keine Fassade nötig (siehe Interfaces oben)
          <img
            src={youtubeThumbnailUrl(youtubeId)}
            alt="Video-Vorschau"
            className="w-40 rounded-bdas"
          />
        )}
      </div>
      <RelatedEntriesPicker
        allEntries={allEntries}
        selfId={initial.id ?? null}
        selectedIds={relatedIds}
        onChange={setRelatedIds}
      />
      <div className="flex flex-wrap gap-2">
        {FAQ_CONTEXTS.map((c) => (
          <FilterChip
            key={c.key}
            active={contexts.includes(c.key)}
            onClick={() =>
              setContexts((cur) =>
                cur.includes(c.key) ? cur.filter((k) => k !== c.key) : [...cur, c.key],
              )
            }
          >
            {c.label}
          </FilterChip>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || question.trim() === ""}
          onClick={() => submit(false)}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm font-semibold text-bdas-ink-body disabled:opacity-40"
        >
          Speichern
        </button>
        {currentStatus !== "published" && (
          <button
            type="button"
            disabled={pending || question.trim() === ""}
            onClick={() => submit(true)}
            className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface disabled:opacity-40"
          >
            Veröffentlichen
          </button>
        )}
      </div>
    </div>
  );
}

export function FaqEntryDialog({
  open,
  onClose,
  initial,
  allEntries,
  topics,
  currentStatus,
}: {
  open: boolean;
  onClose: () => void;
  initial: FaqEntryDialogInitial;
  allEntries: ReadonlyArray<{ id: string; question: string }>;
  topics: readonly FaqTopic[];
  currentStatus: "draft" | "published" | null;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial.id ? "Eintrag bearbeiten" : "Eintrag anlegen"}
      wide
    >
      {open && (
        <EntryForm
          key={initial.id ?? "new"}
          initial={initial}
          allEntries={allEntries}
          topics={topics}
          currentStatus={currentStatus}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}
