import type { Role } from "@bdas/auth";
import type { FaqEntry as FaqEntryRow, FaqSectionKey, FaqTopic } from "@bdas/faq";

import { highlightedVorstandSubgroups, orderSections, type FaqGrant } from "./order";
import { hasAny } from "./visibility";
import { plainText } from "./plain-text";

export type FaqEntryView = {
  id: string;
  question: string;
  body: unknown; // TiptapDoc, gerendert via FaqRichText
  searchText: string; // question + plainText(body), lowercase
  topic: { id: string; name: string } | null;
  youtubeId: string | null;
  updatedAtIso: string; // für "Zuletzt aktualisiert"
  relatedIds: readonly string[];
};

export type FaqSubgroupView = {
  id: string;
  title: string;
  highlighted: boolean;
  entries: FaqEntryView[];
};

export type FaqSectionView = {
  key: FaqSectionKey;
  title: string;
  intro: string | null;
  defaultOpen: boolean;
  entries: FaqEntryView[];
  subgroups: FaqSubgroupView[];
};

/** One subgroup slot inside a section, as rendered — only `vorstand` has any. */
type SubgroupMeta = {
  readonly key: string;
  readonly title: string;
  readonly visibleTo: readonly Role[];
};

type SectionMeta = {
  readonly title: string;
  readonly intro: string | null;
  readonly visibleTo: "all" | readonly Role[];
  readonly subgroups?: readonly SubgroupMeta[];
};

/**
 * Titles, intros, and subgroup titles, copied verbatim from the static
 * `apps/web/content/faq/*.ts` sections this view-model supersedes — the
 * content itself now comes from the DB, but the section chrome stays the
 * same until the copy changes.
 */
const SECTION_META: Record<FaqSectionKey, SectionMeta> = {
  allgemein: {
    title: "Allgemein",
    intro:
      "Grundlagen der Plattform: was sie ist, wie du dich anmeldest und wie das Rollensystem funktioniert.",
    visibleTo: "all",
  },
  bundesvorstand: {
    title: "Bundesvorstand",
    intro:
      "Föderationsweite Funktionen unter „Bundesverband“. Alle Zahlen und Tabellen umfassen sämtliche Gruppen.",
    visibleTo: ["federal_board"],
  },
  vorstand: {
    title: "Vorstand",
    intro:
      "Funktionen für den lokalen Vorstand, jeweils auf die eigene Gruppe begrenzt — getrennt nach den vier Vorstandsrollen.",
    visibleTo: ["local_board", "local_board_lead", "event_organizer", "page_editor"],
    subgroups: [
      { key: "local_board", title: "Vorstand", visibleTo: ["local_board", "local_board_lead"] },
      { key: "local_board_lead", title: "LEAD", visibleTo: ["local_board_lead"] },
      { key: "event_organizer", title: "Event Organisator", visibleTo: ["event_organizer"] },
      { key: "page_editor", title: "Seiten Editor", visibleTo: ["page_editor"] },
    ],
  },
  mitglieder: {
    title: "Mitglieder",
    intro: "Was du als Mitglied auf der Plattform tun kannst.",
    visibleTo: "all",
  },
};

function toEntryView(row: FaqEntryRow, topicById: ReadonlyMap<string, FaqTopic>): FaqEntryView {
  const topic = row.topicId !== null ? (topicById.get(row.topicId) ?? null) : null;
  return {
    id: row.id,
    question: row.question,
    body: row.body,
    searchText: `${row.question} ${plainText(row.body)}`.trim().toLowerCase(),
    topic: topic ? { id: topic.id, name: topic.name } : null,
    youtubeId: row.youtubeId,
    updatedAtIso: row.updatedAt.toISOString(),
    relatedIds: row.relatedIds,
  };
}

/**
 * Turns published DB rows into the plain-object shape a client component
 * renders — section/subgroup grouping, visibility per {@link hasAny}, order
 * and `defaultOpen` via {@link orderSections}, empty sections dropped.
 */
export function assembleFaq(input: {
  entries: readonly FaqEntryRow[]; // bereits nur published
  topics: readonly FaqTopic[];
  grants: readonly FaqGrant[];
}): { sections: FaqSectionView[]; topics: { id: string; name: string }[] } {
  const { entries, topics, grants } = input;
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const highlighted = highlightedVorstandSubgroups(grants);

  const sections: FaqSectionView[] = [];

  for (const { key, defaultOpen } of orderSections(grants)) {
    const meta = SECTION_META[key];
    if (meta.visibleTo !== "all" && !hasAny(grants, meta.visibleTo)) continue;

    const topLevel: FaqEntryView[] = [];
    const bySubgroup = new Map<string, FaqEntryView[]>();

    for (const row of entries) {
      if (row.section !== key) continue;

      if (row.subgroup === null) {
        topLevel.push(toEntryView(row, topicById));
        continue;
      }

      const subMeta = meta.subgroups?.find((s) => s.key === row.subgroup);
      if (!subMeta || !hasAny(grants, subMeta.visibleTo)) continue;

      const list = bySubgroup.get(row.subgroup) ?? [];
      list.push(toEntryView(row, topicById));
      bySubgroup.set(row.subgroup, list);
    }

    const subgroups: FaqSubgroupView[] = (meta.subgroups ?? [])
      .map((s) => ({
        id: s.key,
        title: s.title,
        highlighted: highlighted.has(s.key),
        entries: bySubgroup.get(s.key) ?? [],
      }))
      .filter((s) => s.entries.length > 0);

    if (topLevel.length === 0 && subgroups.length === 0) continue;

    sections.push({
      key,
      title: meta.title,
      intro: meta.intro,
      defaultOpen,
      entries: topLevel,
      subgroups,
    });
  }

  const visibleTopicIds = new Set<string>();
  for (const section of sections) {
    for (const entry of section.entries) if (entry.topic) visibleTopicIds.add(entry.topic.id);
    for (const sub of section.subgroups) {
      for (const entry of sub.entries) if (entry.topic) visibleTopicIds.add(entry.topic.id);
    }
  }
  const visibleTopics = topics
    .filter((t) => visibleTopicIds.has(t.id))
    .map((t) => ({ id: t.id, name: t.name }));

  return { sections, topics: visibleTopics };
}
