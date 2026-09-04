import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NotFoundError } from "@bdas/errors";
import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupFaqDb } from "../test-db";
import {
  createEntry,
  deleteEntry,
  listEntries,
  listEntriesByContext,
  publishEntry,
  reorderEntries,
  unpublishEntry,
  updateEntry,
} from "./entries";
import { createSubmission, discardSubmission, listSubmissions } from "./submissions";

const reachable = await dbReachable();
const doc = { type: "doc", content: [] };
const base = {
  section: "mitglieder",
  question: "Wie trete ich bei?",
  body: doc,
  updatedBy: "u1",
} as const;

describe.skipIf(!reachable)("entries service", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("creates a draft with position within (section, subgroup)", async () => {
    const a = await createEntry(t.db, { ...base });
    const b = await createEntry(t.db, { ...base, question: "Zweite?" });
    expect(a.status).toBe("draft");
    expect([a.position, b.position]).toEqual([0, 1]);

    // Position is scoped per (section, subgroup), not a global counter: an
    // entry in a different scope must start over at 0, not continue at 2.
    const c = await createEntry(t.db, {
      ...base,
      section: "vorstand",
      subgroup: "local_board",
      question: "Dritte?",
    });
    expect(c.position).toBe(0);
  });

  it("rejects subgroup outside vorstand and a bad youtube id", async () => {
    await expect(createEntry(t.db, { ...base, subgroup: "local_board" })).rejects.toThrow();
    await expect(createEntry(t.db, { ...base, youtubeId: "kurz" })).rejects.toThrow();
  });

  it("the database rejects a subgroup outside vorstand even on a raw insert", async () => {
    // 0001_init.sql constrains the pairing, not just the value set, so the
    // invariant validate() enforces cannot be bypassed around the service.
    await expect(
      t.client`
        INSERT INTO faq_entries (id, section, subgroup, question, body)
        VALUES ('raw_1', 'mitglieder', 'local_board', 'Frage?', '{"type":"doc"}'::jsonb)
      `,
    ).rejects.toThrow();
    await expect(
      t.client`
        INSERT INTO faq_entries (id, section, subgroup, question, body)
        VALUES ('raw_2', 'vorstand', 'local_board', 'Frage?', '{"type":"doc"}'::jsonb)
      `,
    ).resolves.toBeDefined();
  });

  it("rejects a blank question and an over-long question", async () => {
    await expect(createEntry(t.db, { ...base, question: " " })).rejects.toThrow();
    await expect(createEntry(t.db, { ...base, question: "x".repeat(301) })).rejects.toThrow();
  });

  it("rejects a body that fails the Tiptap document shape", async () => {
    await expect(createEntry(t.db, { ...base, body: { type: "paragraph" } })).rejects.toThrow();
    await expect(createEntry(t.db, { ...base, body: "not a doc" })).rejects.toThrow();
  });

  it("rejects relatedIds containing the entry's own id on update", async () => {
    const a = await createEntry(t.db, { ...base });
    await expect(
      updateEntry(t.db, { id: a.id, ...base, relatedIds: [a.id], updatedBy: "u2" }),
    ).rejects.toThrow();
  });

  it("update replaces contexts and related ids wholesale", async () => {
    const other = await createEntry(t.db, { ...base, question: "Andere?" });
    const a = await createEntry(t.db, { ...base, contexts: ["profil"], relatedIds: [other.id] });
    const upd = await updateEntry(t.db, {
      id: a.id,
      ...base,
      contexts: ["dateien"],
      relatedIds: [],
      updatedBy: "u2",
    });
    expect(upd.contexts).toEqual(["dateien"]);
    expect(upd.relatedIds).toEqual([]);
    expect(upd.updatedBy).toBe("u2");

    // Verify the wholesale replace actually happened in the child tables,
    // independent of the DTO the service handed back.
    const contextRows = await t.client`
      SELECT context FROM faq_entry_contexts WHERE entry_id = ${a.id}
    `;
    expect(contextRows.map((r) => r["context"])).toEqual(["dateien"]);
    const linkRows = await t.client`
      SELECT related_entry_id FROM faq_entry_links WHERE entry_id = ${a.id}
    `;
    expect(linkRows).toHaveLength(0);
  });

  it("listEntriesByContext returns only published entries matching the context", async () => {
    const a = await createEntry(t.db, { ...base, contexts: ["profil"] });
    const other = await createEntry(t.db, {
      ...base,
      question: "Andere?",
      contexts: ["dateien"],
    });
    expect(await listEntriesByContext(t.db, "profil")).toEqual([]);
    await publishEntry(t.db, { id: a.id, updatedBy: "u1" });
    await publishEntry(t.db, { id: other.id, updatedBy: "u1" });

    // Both entries are now published, but only `a` carries the "profil"
    // context — a filter that ignored context would wrongly return both.
    expect((await listEntriesByContext(t.db, "profil")).map((e) => e.id)).toEqual([a.id]);
  });

  it("publish marks a linked submission answered, but not before", async () => {
    const sub = await createSubmission(t.db, { question: "Wo?", submittedBy: "m1" });
    const a = await createEntry(t.db, { ...base, submissionId: sub.id });

    // Spec: entry_id is set immediately, status stays "open" until publish.
    const [beforePublish] = await listSubmissions(t.db);
    expect(beforePublish!.status).toBe("open");
    expect(beforePublish!.entryId).toBe(a.id);

    await publishEntry(t.db, { id: a.id, updatedBy: "board1" });
    const [s] = await listSubmissions(t.db);
    expect(s!.status).toBe("answered");
    expect(s!.entryId).toBe(a.id);

    // decided_by/decided_at aren't on the FaqSubmission DTO — read them raw.
    const [raw] = await t.client`
      SELECT decided_by, decided_at FROM faq_submissions WHERE id = ${sub.id}
    `;
    expect(raw?.["decided_by"]).toBe("board1");
    expect(raw?.["decided_at"]).not.toBeNull();
  });

  it("rejects an unusable submissionId — unknown, or not open", async () => {
    await expect(createEntry(t.db, { ...base, submissionId: "nope" })).rejects.toThrow();

    const sub = await createSubmission(t.db, { question: "Wo?", submittedBy: "m1" });
    await discardSubmission(t.db, { id: sub.id, decidedBy: "board1" });
    await expect(createEntry(t.db, { ...base, submissionId: sub.id })).rejects.toThrow();

    // The failed link must not have silently created an orphan entry.
    expect(await listEntries(t.db)).toEqual([]);
  });

  it("unpublish returns a published entry to draft", async () => {
    const a = await createEntry(t.db, { ...base });
    await publishEntry(t.db, { id: a.id, updatedBy: "u1" });
    const back = await unpublishEntry(t.db, { id: a.id, updatedBy: "u2" });
    expect(back.status).toBe("draft");
    expect(back.updatedBy).toBe("u2");
  });

  it("delete cascades links without touching the related entry", async () => {
    const other = await createEntry(t.db, { ...base, question: "Andere?" });
    const a = await createEntry(t.db, { ...base, relatedIds: [other.id] });
    await deleteEntry(t.db, { id: a.id });
    const left = await listEntries(t.db);
    expect(left.map((e) => e.id)).toEqual([other.id]);
  });

  it("reorder rewrites positions from the given order", async () => {
    const a = await createEntry(t.db, { ...base });
    const b = await createEntry(t.db, { ...base, question: "Zweite?" });
    await reorderEntries(t.db, {
      section: "mitglieder",
      subgroup: null,
      orderedIds: [b.id, a.id],
    });
    const ids = (await listEntries(t.db)).map((e) => e.id);
    expect(ids).toEqual([b.id, a.id]);
  });

  it("unknown id throws NotFound for update, publish, unpublish, and delete", async () => {
    await expect(updateEntry(t.db, { id: "nope", ...base, updatedBy: "u1" })).rejects.toThrow(
      NotFoundError,
    );
    await expect(publishEntry(t.db, { id: "nope", updatedBy: "u1" })).rejects.toThrow(
      NotFoundError,
    );
    await expect(unpublishEntry(t.db, { id: "nope", updatedBy: "u1" })).rejects.toThrow(
      NotFoundError,
    );
    // The board expects the row it clicked to exist — deletes throw, unlike
    // reorderEntries, which stays tolerant on purpose.
    await expect(deleteEntry(t.db, { id: "nope" })).rejects.toThrow(NotFoundError);
  });

  it("reorder tolerates ids that no longer exist", async () => {
    const a = await createEntry(t.db, { ...base });
    await expect(
      reorderEntries(t.db, {
        section: "mitglieder",
        subgroup: null,
        orderedIds: ["geloescht", a.id],
      }),
    ).resolves.toBeUndefined();
    expect((await listEntries(t.db))[0]!.position).toBe(1);
  });

  it("a stale relatedId or unknown topicId surfaces as NotFound, not a raw pg error", async () => {
    await expect(createEntry(t.db, { ...base, relatedIds: ["weg"] })).rejects.toThrow(
      NotFoundError,
    );
    await expect(createEntry(t.db, { ...base, topicId: "kein-thema" })).rejects.toThrow(
      NotFoundError,
    );
    // Nothing partially committed: the failed insert must leave no entry.
    expect(await listEntries(t.db)).toEqual([]);

    const a = await createEntry(t.db, { ...base });
    await expect(
      updateEntry(t.db, { id: a.id, ...base, relatedIds: ["weg"], updatedBy: "u2" }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      updateEntry(t.db, { id: a.id, ...base, topicId: "kein-thema", updatedBy: "u2" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("update re-allocates position when the entry moves to another scope", async () => {
    // Two entries already sit in the destination scope, so carrying the old
    // position (0) over would collide with `dest0`.
    const dest0 = await createEntry(t.db, { ...base, section: "allgemein", question: "A?" });
    const dest1 = await createEntry(t.db, { ...base, section: "allgemein", question: "B?" });
    const moving = await createEntry(t.db, { ...base, question: "Wandert?" });
    expect(moving.position).toBe(0);

    const moved = await updateEntry(t.db, {
      ...base,
      id: moving.id,
      section: "allgemein",
      question: "Wandert?",
      updatedBy: "u2",
    });
    expect(moved.position).toBe(2);
    expect([dest0.position, dest1.position]).toEqual([0, 1]);

    // Staying in the same scope must NOT renumber the entry.
    const again = await updateEntry(t.db, {
      ...base,
      id: moved.id,
      section: "allgemein",
      question: "Wandert immer noch?",
      updatedBy: "u2",
    });
    expect(again.position).toBe(2);
  });

  it("orders by declaration order of sections and subgroups, not alphabetically", async () => {
    // Alphabetically this would be allgemein → bundesvorstand → mitglieder →
    // vorstand, and event_organizer → local_board → local_board_lead →
    // page_editor. Neither is an order anyone chose.
    await createEntry(t.db, { ...base, section: "mitglieder", question: "m" });
    await createEntry(t.db, {
      ...base,
      section: "vorstand",
      subgroup: "page_editor",
      question: "v-pe",
    });
    await createEntry(t.db, { ...base, section: "allgemein", question: "a" });
    await createEntry(t.db, {
      ...base,
      section: "vorstand",
      subgroup: "local_board_lead",
      question: "v-lead",
    });
    await createEntry(t.db, { ...base, section: "bundesvorstand", question: "b" });
    await createEntry(t.db, { ...base, section: "vorstand", question: "v-null" });

    expect((await listEntries(t.db)).map((e) => e.question)).toEqual([
      "a",
      "b",
      "v-null",
      "v-lead",
      "v-pe",
      "m",
    ]);
  });

  it("breaks position ties by id", async () => {
    // createEntry allocates distinct positions, so the tie is written raw —
    // with ids chosen so the expected order is collation-independent, and
    // inserted in reverse so heap order alone would fail this.
    for (const id of ["entry2", "entry1"]) {
      await t.client`
        INSERT INTO faq_entries (id, section, question, body, position)
        VALUES (${id}, 'mitglieder', 'Gleiche Position?', '{"type":"doc"}'::jsonb, 0)
      `;
    }
    expect((await listEntries(t.db)).map((e) => e.id)).toEqual(["entry1", "entry2"]);
  });
});
