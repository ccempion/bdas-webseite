import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, seedAuthUser, setupProfileDb } from "./test-db";

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
        "bdaj_funktion",
        "completed_at",
        "empfehler_name",
        "gefunden_durch",
        "geburtsdatum",
        "interesse",
        "nutzertyp",
        "photo_storage_key",
        "studienfach_kategorie",
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

describeIfDb("member_profiles: nutzertyp (0004)", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupProfileDb();
    await seedAuthUser(t, "usr_1");
  });
  afterEach(async () => {
    await t.cleanup();
  });

  async function insert(row: Record<string, unknown>): Promise<void> {
    await t.client`INSERT INTO member_profiles ${t.client({
      user_id: "usr_1",
      gefunden_durch: "webseite",
      updated_by: "usr_1",
      ...row,
    })}`;
  }

  const student = {
    nutzertyp: "student",
    studiengang: "Informatik",
    abschlussart: "bachelor",
    uni: "RWTH Aachen",
    geburtsdatum: "2000-01-01",
  };

  it("stores a row without a type as a student, as code from before 0004 writes", async () => {
    const { nutzertyp: _omit, ...rest } = student;
    await insert(rest);
    const [row] = await t.client`SELECT nutzertyp FROM member_profiles`;
    expect(row?.["nutzertyp"]).toBe("student");
  });

  it("accepts each type with its own fields", async () => {
    await insert(student);
    await t.client`DELETE FROM member_profiles`;
    await insert({ nutzertyp: "alumnus", studiengang: "Jura", uni: "Universität zu Köln" });
    await t.client`DELETE FROM member_profiles`;
    await insert({ nutzertyp: "foerderer", interesse: "Kultur" });
    await t.client`DELETE FROM member_profiles`;
    await insert({ nutzertyp: "bdaj", bdaj_funktion: "mitglied" });
  });

  it.each([
    ["student without birth date", { ...student, geburtsdatum: null }],
    ["alumnus without university", { nutzertyp: "alumnus", studiengang: "Jura" }],
    ["supporter without interest", { nutzertyp: "foerderer" }],
    ["bdaj without function", { nutzertyp: "bdaj" }],
    ["bdaj with an unknown function", { nutzertyp: "bdaj", bdaj_funktion: "chef" }],
    ["an unknown type", { ...student, nutzertyp: "gast" }],
  ])("rejects %s", async (_label, row) => {
    await expect(insert(row)).rejects.toThrow(/check/i);
  });

  it("keeps existing rows valid as students", async () => {
    await insert(student);
    const [row] = await t.client`SELECT nutzertyp FROM member_profiles`;
    expect(row?.["nutzertyp"]).toBe("student");
  });
});
