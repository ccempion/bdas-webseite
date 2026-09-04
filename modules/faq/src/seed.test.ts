import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { applyFaqSeed, dbReachable, setupFaqDb } from "./test-db";

const reachable = await dbReachable();

/**
 * `0002_seed.sql` is the one migration that touches production content, so it
 * gets its own schema with BOTH migrations applied — the default
 * `setupFaqDb()` deliberately leaves the seed out (see test-db.ts).
 */
describe.skipIf(!reachable)("seed migration 0002", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb({ seed: true });
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("seeds 30 entries and 5 topics", async () => {
    const [entries] = await t.client`SELECT count(*)::int AS n FROM faq_entries`;
    const [topics] = await t.client`SELECT count(*)::int AS n FROM faq_topics`;
    expect(entries?.["n"]).toBe(30);
    expect(topics?.["n"]).toBe(5);
  });

  it("every topic_id resolves to a seeded topic", async () => {
    // The FK would already reject a dangling id, so this asserts the stronger
    // property: no entry silently lost its topic to an ON DELETE SET NULL and
    // at least some entries are actually grouped.
    const dangling = await t.client`
      SELECT e.id FROM faq_entries e
      LEFT JOIN faq_topics tp ON tp.id = e.topic_id
      WHERE e.topic_id IS NOT NULL AND tp.id IS NULL
    `;
    expect(dangling).toHaveLength(0);
    const [withTopic] = await t.client`
      SELECT count(*)::int AS n FROM faq_entries WHERE topic_id IS NOT NULL
    `;
    expect(withTopic?.["n"]).toBeGreaterThan(0);
  });

  it("all seeded rows are published and carry no editor", async () => {
    const [row] = await t.client`
      SELECT
        count(*) FILTER (WHERE status <> 'published')::int AS unpublished,
        count(*) FILTER (WHERE updated_by IS NOT NULL)::int AS edited
      FROM faq_entries
    `;
    expect(row?.["unpublished"]).toBe(0);
    expect(row?.["edited"]).toBe(0);
  });

  it("is idempotent — a second apply changes nothing", async () => {
    const before = await t.client`
      SELECT id, section, subgroup, topic_id, question, body, status, position, updated_by
      FROM faq_entries ORDER BY id
    `;
    const topicsBefore = await t.client`SELECT id, name, position FROM faq_topics ORDER BY id`;

    await applyFaqSeed(t);

    const after = await t.client`
      SELECT id, section, subgroup, topic_id, question, body, status, position, updated_by
      FROM faq_entries ORDER BY id
    `;
    const topicsAfter = await t.client`SELECT id, name, position FROM faq_topics ORDER BY id`;
    expect(after).toEqual(before);
    expect(topicsAfter).toEqual(topicsBefore);
  });
});
