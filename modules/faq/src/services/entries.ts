import { and, asc, eq, inArray, isNull, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { NotFoundError, ValidationError } from "@bdas/errors";

import { isForeignKeyViolation } from "../pg-errors";
import { faqEntries, faqEntryContexts, faqEntryLinks, faqSubmissions } from "../schema";
import {
  FAQ_SECTIONS,
  FAQ_SUBGROUPS,
  MAX_BODY_BYTES,
  TiptapDocSchema,
  newId,
  type FaqEntry,
  type FaqEntryStatus,
  type FaqSectionKey,
  type FaqSubgroupKey,
  type TiptapDoc,
} from "../types";
import type { Db } from "./topics";

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const MAX_QUESTION = 300;

export type EntryInput = {
  section: FaqSectionKey;
  subgroup?: FaqSubgroupKey | null;
  topicId?: string | null;
  question: string;
  body: unknown;
  youtubeId?: string | null;
  relatedIds?: readonly string[];
  contexts?: readonly string[];
};

type EntryRow = typeof faqEntries.$inferSelect;

function dedupe(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

function validate(input: EntryInput, selfId?: string): { question: string; body: TiptapDoc } {
  const question = input.question.trim();
  if (question.length === 0 || question.length > MAX_QUESTION)
    throw new ValidationError("Ungültige Frage (1–300 Zeichen).");
  if (!(FAQ_SECTIONS as readonly string[]).includes(input.section))
    throw new ValidationError("Ungültiger Bereich.");
  if (input.subgroup != null) {
    if (
      input.section !== "vorstand" ||
      !(FAQ_SUBGROUPS as readonly string[]).includes(input.subgroup)
    )
      throw new ValidationError("Untergruppen gibt es nur im Bereich Vorstand.");
  }
  if (input.youtubeId != null && !YOUTUBE_ID_RE.test(input.youtubeId))
    throw new ValidationError("Ungültige YouTube-Video-ID.");
  if (selfId && (input.relatedIds ?? []).includes(selfId))
    throw new ValidationError("Ein Eintrag kann nicht mit sich selbst verwandt sein.");
  const parsed = TiptapDocSchema.safeParse(input.body);
  if (!parsed.success) throw new ValidationError("Ungültiger Antwort-Inhalt.");
  if (Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > MAX_BODY_BYTES)
    throw new ValidationError("Antwort zu groß (max. 256 KB).");
  return { question, body: parsed.data as TiptapDoc };
}

function rowToEntry(
  r: EntryRow,
  relatedIds: readonly string[],
  contexts: readonly string[],
): FaqEntry {
  return {
    id: r.id,
    section: r.section as FaqSectionKey,
    subgroup: r.subgroup as FaqSubgroupKey | null,
    topicId: r.topicId,
    question: r.question,
    body: r.body as TiptapDoc,
    youtubeId: r.youtubeId,
    status: r.status as FaqEntryStatus,
    position: r.position,
    updatedAt: r.updatedAt,
    updatedBy: r.updatedBy,
    relatedIds,
    contexts,
  };
}

function groupBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Loads relatedIds/contexts for a set of already-committed entry rows. */
async function assemble(db: Db, rows: readonly EntryRow[]): Promise<FaqEntry[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [links, ctxs] = await Promise.all([
    db.select().from(faqEntryLinks).where(inArray(faqEntryLinks.entryId, ids)),
    db.select().from(faqEntryContexts).where(inArray(faqEntryContexts.entryId, ids)),
  ]);
  const relatedByEntry = groupBy(links, (l) => l.entryId);
  const contextsByEntry = groupBy(ctxs, (c) => c.entryId);
  return rows.map((r) =>
    rowToEntry(
      r,
      (relatedByEntry.get(r.id) ?? []).map((l) => l.relatedEntryId),
      (contextsByEntry.get(r.id) ?? []).map((c) => c.context),
    ),
  );
}

/**
 * Rank expression over a fixed value set: the value's index in the declaring
 * const array. Values come from `types.ts` const tuples ([a-z_] only), so
 * inlining them as literals is safe — no caller-supplied input reaches here.
 */
function declarationRank(column: SQLWrapper, values: readonly string[]): SQL {
  const whens = values.map((v, i) => `when '${v}' then ${i}`).join(" ");
  return sql`case ${column} ${sql.raw(whens)} else ${sql.raw(String(values.length))} end`;
}

/**
 * Storage order, not presentation order: sections and subgroups sort by their
 * declaration order in `FAQ_SECTIONS` / `FAQ_SUBGROUPS` (alphabetical would
 * give `allgemein → bundesvorstand → mitglieder → vorstand`, an order nobody
 * chose). Subgroup NULL sorts before every named subgroup, then `position`,
 * then `id` so equal positions never come back in an arbitrary order.
 *
 * The *final* order shown to a member belongs to the app layer — PR 2's
 * `orderSections` reorders these per viewer role. Do not encode viewer rules
 * here; the module is auth-agnostic.
 */
const ENTRY_ORDER = [
  declarationRank(faqEntries.section, FAQ_SECTIONS),
  sql`case when ${faqEntries.subgroup} is null then -1 else ${declarationRank(faqEntries.subgroup, FAQ_SUBGROUPS)} end`,
  asc(faqEntries.position),
  asc(faqEntries.id),
];

/** Next free position inside one (section, subgroup) scope. */
function nextPosition(section: FaqSectionKey, subgroup: FaqSubgroupKey | null): SQL {
  return sql`coalesce((select max(position) from faq_entries where section = ${section} and subgroup is not distinct from ${subgroup}), -1) + 1`;
}

/**
 * A stale `relatedIds` id or an unknown `topicId` reaches Postgres as SQLSTATE
 * 23503. Callers get the module's own German NotFoundError, never a raw driver
 * error (same mapping as `upsertFeedback`).
 */
async function mapForeignKeyViolation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isForeignKeyViolation(err))
      throw new NotFoundError("Verknüpfter Eintrag oder Thema nicht gefunden.");
    throw err;
  }
}

export async function createEntry(
  db: Db,
  input: EntryInput & { updatedBy: string; submissionId?: string },
): Promise<FaqEntry> {
  const { question, body } = validate(input);
  const id = newId();
  const subgroup = input.subgroup ?? null;
  const relatedIds = dedupe(input.relatedIds ?? []);
  const contexts = dedupe(input.contexts ?? []);

  const row = await mapForeignKeyViolation(() =>
    db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(faqEntries)
        .values({
          id,
          section: input.section,
          subgroup,
          topicId: input.topicId ?? null,
          question,
          body,
          youtubeId: input.youtubeId ?? null,
          updatedBy: input.updatedBy,
          position: nextPosition(input.section, subgroup),
        })
        .returning();
      if (relatedIds.length > 0) {
        await tx
          .insert(faqEntryLinks)
          .values(relatedIds.map((relatedEntryId) => ({ entryId: id, relatedEntryId })));
      }
      if (contexts.length > 0) {
        await tx
          .insert(faqEntryContexts)
          .values(contexts.map((context) => ({ entryId: id, context })));
      }
      if (input.submissionId) {
        const linked = await tx
          .update(faqSubmissions)
          .set({ entryId: id })
          .where(and(eq(faqSubmissions.id, input.submissionId), eq(faqSubmissions.status, "open")))
          .returning({ id: faqSubmissions.id });
        if (linked.length === 0) {
          throw new NotFoundError("Offene Anfrage nicht gefunden.");
        }
      }
      return inserted!;
    }),
  );

  const [entry] = await assemble(db, [row]);
  return entry!;
}

export async function updateEntry(
  db: Db,
  input: EntryInput & { id: string; updatedBy: string },
): Promise<FaqEntry> {
  const { question, body } = validate(input, input.id);
  const subgroup = input.subgroup ?? null;
  const relatedIds = dedupe(input.relatedIds ?? []);
  const contexts = dedupe(input.contexts ?? []);

  const row = await mapForeignKeyViolation(() =>
    db.transaction(async (tx) => {
      const [before] = await tx
        .select({ section: faqEntries.section, subgroup: faqEntries.subgroup })
        .from(faqEntries)
        .where(eq(faqEntries.id, input.id));
      if (!before) throw new NotFoundError("Eintrag nicht gefunden.");

      // Moving across (section, subgroup) leaves the scope the position was
      // allocated in, so it has to be re-allocated at the end of the new one —
      // carrying it over would collide with whatever already sits there and
      // break the per-scope invariant createEntry establishes.
      const movedScope = before.section !== input.section || before.subgroup !== subgroup;

      const [updated] = await tx
        .update(faqEntries)
        .set({
          section: input.section,
          subgroup,
          topicId: input.topicId ?? null,
          question,
          body,
          youtubeId: input.youtubeId ?? null,
          updatedBy: input.updatedBy,
          updatedAt: new Date(),
          ...(movedScope ? { position: nextPosition(input.section, subgroup) } : {}),
        })
        .where(eq(faqEntries.id, input.id))
        .returning();
      if (!updated) throw new NotFoundError("Eintrag nicht gefunden.");

      await tx.delete(faqEntryLinks).where(eq(faqEntryLinks.entryId, input.id));
      await tx.delete(faqEntryContexts).where(eq(faqEntryContexts.entryId, input.id));
      if (relatedIds.length > 0) {
        await tx
          .insert(faqEntryLinks)
          .values(relatedIds.map((relatedEntryId) => ({ entryId: input.id, relatedEntryId })));
      }
      if (contexts.length > 0) {
        await tx
          .insert(faqEntryContexts)
          .values(contexts.map((context) => ({ entryId: input.id, context })));
      }
      return updated;
    }),
  );

  const [entry] = await assemble(db, [row]);
  return entry!;
}

export async function deleteEntry(db: Db, input: { id: string }): Promise<void> {
  const [row] = await db
    .delete(faqEntries)
    .where(eq(faqEntries.id, input.id))
    .returning({ id: faqEntries.id });
  if (!row) throw new NotFoundError("Eintrag nicht gefunden.");
}

export async function publishEntry(
  db: Db,
  input: { id: string; updatedBy: string },
): Promise<FaqEntry> {
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(faqEntries)
      .set({ status: "published", updatedBy: input.updatedBy, updatedAt: new Date() })
      .where(eq(faqEntries.id, input.id))
      .returning();
    if (!updated) throw new NotFoundError("Eintrag nicht gefunden.");

    await tx
      .update(faqSubmissions)
      .set({ status: "answered", decidedBy: input.updatedBy, decidedAt: new Date() })
      .where(and(eq(faqSubmissions.entryId, input.id), eq(faqSubmissions.status, "open")));

    return updated;
  });

  const [entry] = await assemble(db, [row]);
  return entry!;
}

export async function unpublishEntry(
  db: Db,
  input: { id: string; updatedBy: string },
): Promise<FaqEntry> {
  const [row] = await db
    .update(faqEntries)
    .set({ status: "draft", updatedBy: input.updatedBy, updatedAt: new Date() })
    .where(eq(faqEntries.id, input.id))
    .returning();
  if (!row) throw new NotFoundError("Eintrag nicht gefunden.");
  const [entry] = await assemble(db, [row]);
  return entry!;
}

export async function listEntries(db: Db, opts?: { status?: FaqEntryStatus }): Promise<FaqEntry[]> {
  const rows = opts?.status
    ? await db
        .select()
        .from(faqEntries)
        .where(eq(faqEntries.status, opts.status))
        .orderBy(...ENTRY_ORDER)
    : await db
        .select()
        .from(faqEntries)
        .orderBy(...ENTRY_ORDER);
  return assemble(db, rows);
}

export async function listEntriesByContext(db: Db, context: string): Promise<FaqEntry[]> {
  const rows = await db
    .select({ entry: faqEntries })
    .from(faqEntries)
    .innerJoin(faqEntryContexts, eq(faqEntryContexts.entryId, faqEntries.id))
    .where(and(eq(faqEntryContexts.context, context), eq(faqEntries.status, "published")))
    .orderBy(...ENTRY_ORDER);
  return assemble(
    db,
    rows.map((r) => r.entry),
  );
}

export async function reorderEntries(
  db: Db,
  input: { section: FaqSectionKey; subgroup: FaqSubgroupKey | null; orderedIds: readonly string[] },
): Promise<void> {
  // Deliberately tolerant of ids that no longer exist or have left the scope:
  // a reorder racing a delete must not blow up. Unlike the deletes, which throw.
  await db.transaction(async (tx) => {
    for (const [i, id] of input.orderedIds.entries()) {
      await tx
        .update(faqEntries)
        .set({ position: i })
        .where(
          and(
            eq(faqEntries.id, id),
            eq(faqEntries.section, input.section),
            input.subgroup === null
              ? isNull(faqEntries.subgroup)
              : eq(faqEntries.subgroup, input.subgroup),
          ),
        );
    }
  });
}
