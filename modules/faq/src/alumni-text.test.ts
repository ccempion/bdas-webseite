import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { applyAlumniTextFix, dbReachable, setupFaqDb } from "./test-db";

const reachable = await dbReachable();

const bodyText = async (t: TestDb, id: string): Promise<string> => {
  const [row] = await t.client`SELECT body::text AS b FROM faq_entries WHERE id = ${id}`;
  return String(row?.["b"]);
};

describe.skipIf(!reachable)("content migration 0003 (Alumni-Texte, ADR 0043)", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb({ seed: true });
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("ersetzt beide alten Alumni-Texte", async () => {
    await applyAlumniTextFix(t);

    const roles = await bodyText(t, "rollenmodell");
    expect(roles).not.toContain("meldet sich nicht mehr für Veranstaltungen an");
    expect(roles).toContain(
      "Alumni: ehemaliges Mitglied; eine Kennzeichnung, keine Einschränkung.",
    );
    expect(roles).toContain("Bundesvorstand: föderationsweite Verwaltung über alle Gruppen.");

    const alumni = await bodyText(t, "alumni");
    expect(alumni).not.toContain("nicht mehr als aktives Mitglied");
    expect(alumni).toContain("kannst dich weiterhin zu Veranstaltungen anmelden");
  });

  it("überschreibt keinen vom Bundesvorstand bearbeiteten Eintrag", async () => {
    await t.client`UPDATE faq_entries SET updated_by = 'usr_board' WHERE id = 'alumni'`;
    const before = await bodyText(t, "alumni");

    await applyAlumniTextFix(t);

    expect(await bodyText(t, "alumni")).toBe(before);
  });

  it("ist idempotent", async () => {
    await applyAlumniTextFix(t);
    const [first] =
      await t.client`SELECT body::text AS b, updated_at FROM faq_entries WHERE id = 'rollenmodell'`;

    await applyAlumniTextFix(t);

    const [second] =
      await t.client`SELECT body::text AS b, updated_at FROM faq_entries WHERE id = 'rollenmodell'`;
    expect(second).toEqual(first);
  });
});
