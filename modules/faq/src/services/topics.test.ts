import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupFaqDb } from "../test-db";
import { createTopic, deleteTopic, listTopics, renameTopic, reorderTopics } from "./topics";

const reachable = await dbReachable();

describe.skipIf(!reachable)("topics service", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("creates and lists in position order", async () => {
    const a = await createTopic(t.db, { name: "Events" });
    const b = await createTopic(t.db, { name: "Dateien" });
    await reorderTopics(t.db, { orderedIds: [b.id, a.id] });
    const names = (await listTopics(t.db)).map((x) => x.name);
    expect(names).toEqual(["Dateien", "Events"]);
  });

  it("rejects an empty name", async () => {
    await expect(createTopic(t.db, { name: "  " })).rejects.toThrow();
  });

  it("rejects a name over 80 characters", async () => {
    await expect(createTopic(t.db, { name: "x".repeat(81) })).rejects.toThrow();
  });

  it("renames; unknown id throws NotFound", async () => {
    const a = await createTopic(t.db, { name: "Events" });
    const r = await renameTopic(t.db, { id: a.id, name: "Veranstaltungen" });
    expect(r.name).toBe("Veranstaltungen");
    await expect(renameTopic(t.db, { id: "nope", name: "x" })).rejects.toThrow();
  });

  it("delete keeps referencing entries (topic_id nulled by FK)", async () => {
    const a = await createTopic(t.db, { name: "Events" });
    await t.client`
      INSERT INTO faq_entries (id, section, topic_id, question, body)
      VALUES ('entry_1', 'allgemein', ${a.id}, 'Wann?', '{"type":"doc"}'::jsonb)
    `;
    await deleteTopic(t.db, { id: a.id });
    expect(await listTopics(t.db)).toEqual([]);
    const rows = await t.client`SELECT topic_id FROM faq_entries WHERE id = 'entry_1'`;
    expect(rows[0]?.["topic_id"]).toBeNull();
  });
});
