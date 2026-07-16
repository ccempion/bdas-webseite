/**
 * Content integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupContentDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

describeIfDb("content schema", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupContentDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("applies the migration and accepts a page row", async () => {
    await t.client`
      INSERT INTO content_pages (slug, data, updated_by)
      VALUES ('ueber-uns/bundessprecherinnenrat', '{"root":{"props":{}},"content":[]}'::jsonb, 'usr_x')
    `;
    const rows = await t.client`SELECT slug, data, updated_by FROM content_pages`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["slug"]).toBe("ueber-uns/bundessprecherinnenrat");
    expect(rows[0]?.["updated_by"]).toBe("usr_x");
  });
});
