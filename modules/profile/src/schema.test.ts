import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupProfileDb } from "./test-db";

const describeIfDb = (await dbReachable()) ? describe : describe.skip;

describeIfDb("member_profiles migration", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupProfileDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("creates the table with the expected columns", async () => {
    const cols = await t.client<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = ${t.schema} AND table_name = 'member_profiles'
    `;
    const names = cols.map((c) => c.column_name).sort();
    expect(names).toEqual(
      [
        "abschlussart",
        "completed_at",
        "empfehler_name",
        "gefunden_durch",
        "geburtsdatum",
        "photo_storage_key",
        "studiengang",
        "uni",
        "updated_at",
        "updated_by",
        "user_id",
        "vorstellung",
      ].sort(),
    );
  });
});
