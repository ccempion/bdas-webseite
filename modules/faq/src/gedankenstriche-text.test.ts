import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { applyAlumniTextFix, applyGedankenstricheFix, dbReachable, setupFaqDb } from "./test-db";

const reachable = await dbReachable();

const bodyText = async (t: TestDb, id: string): Promise<string> => {
  const [row] = await t.client`SELECT body::text AS b FROM faq_entries WHERE id = ${id}`;
  return String(row?.["b"]);
};

const question = async (t: TestDb, id: string): Promise<string> => {
  const [row] = await t.client`SELECT question FROM faq_entries WHERE id = ${id}`;
  return String(row?.["question"]);
};

/**
 * `0002_seed.sql` and `0003_alumni_text.sql` already ship the fixed (no
 * em dash) text on a fresh database, so seeding alone proves nothing about
 * `0004_gedankenstriche.sql` — it would just find nothing to do. These
 * writes put the rows back into the em-dash state that already-applied
 * migrations left in a real, pre-PR-E production database, so the test
 * actually exercises the migration's own UPDATE statements.
 */
async function rewindToPreGedankenstricheText(t: TestDb): Promise<void> {
  // A plain body fragment fix, unrelated to the Alumni special case.
  await t.client`
    UPDATE faq_entries
       SET body = replace(
             body::text,
             'Die Übersicht zeigt die föderationsweiten Kennzahlen: aktive Mitglieder, Neuanmeldungen der letzten 30 Tage, Anzahl aktiver Gruppen und anstehende Veranstaltungen, dazu einen Verlaufs-Chart der Anmeldungen.',
             'Die Übersicht zeigt die föderationsweiten Kennzahlen: aktive Mitglieder, Neuanmeldungen der letzten 30 Tage, Anzahl aktiver Gruppen und anstehende Veranstaltungen — dazu einen Verlaufs-Chart der Anmeldungen.'
           )::jsonb
     WHERE id = 'overview'
  `;
  // The parenthetical-aside rewrite (double em dash -> parentheses).
  await t.client`
    UPDATE faq_entries
       SET body = replace(
             body::text,
             'Die übrigen lokalen Rollen (Vorstand, Event Organisator, Seiten Editor) vergibt die LEAD-Person',
             'Die übrigen lokalen Rollen — Vorstand, Event Organisator, Seiten Editor — vergibt die LEAD-Person'
           )::jsonb
     WHERE id = 'rollenvergabe'
  `;
  // Question rewrite plus its own body fix, on the same row.
  await t.client`
    UPDATE faq_entries
       SET question = 'Ich habe mehrere Rollen — wie wechsle ich zwischen ihnen?',
           body = replace(
             body::text,
             'zwischen den Ansichten. Die URL musst du dafür nicht wechseln.',
             'zwischen den Ansichten — die URL musst du dafür nicht wechseln.'
           )::jsonb
     WHERE id = 'scope-switcher'
  `;
  // The 'rollenmodell' Alumni bullet: 0003 already applied the ADR-0043 text in
  // prod, but still with the em dash 0003 originally shipped with (fixed to a
  // colon only in this PR's edit to 0003's own source, which does not touch
  // already-applied data). Simulate that already-migrated-but-still-dashed state.
  await t.client`
    UPDATE faq_entries
       SET body = replace(
             body::text,
             'Alumni: ehemaliges Mitglied; eine Kennzeichnung, keine Einschränkung.',
             'Alumni — ehemaliges Mitglied; eine Kennzeichnung, keine Einschränkung.'
           )::jsonb
     WHERE id = 'rollenmodell'
  `;
  // The 'alumni' row: same situation, 0003 already overwrote it in prod with
  // the ADR-0043 wording, still with the em dash.
  await t.client`
    UPDATE faq_entries
       SET body = replace(
             body::text,
             'als Alumnus gekennzeichnet. Das ist eine Einordnung, keine Einschränkung.',
             'als Alumnus gekennzeichnet — das ist eine Einordnung, keine Einschränkung.'
           )::jsonb
     WHERE id = 'alumni'
  `;
}

describe.skipIf(!reachable)("content migration 0004 (Gedankenstriche, PR E)", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb({ seed: true });
    // Real production already has 0003 applied (it ran before PR E existed);
    // reproduce that so the Alumni rows start in the state PR E actually found.
    await applyAlumniTextFix(t);
    await rewindToPreGedankenstricheText(t);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("ersetzt einen einfachen Textausschnitt (Komma statt Gedankenstrich)", async () => {
    expect(await bodyText(t, "overview")).toContain("Veranstaltungen — dazu einen Verlaufs-Chart");

    await applyGedankenstricheFix(t);

    const body = await bodyText(t, "overview");
    expect(body).not.toContain("—");
    expect(body).toContain("Veranstaltungen, dazu einen Verlaufs-Chart der Anmeldungen.");
  });

  it("ersetzt den geklammerten Nebensatz (doppelter Gedankenstrich -> Klammern)", async () => {
    await applyGedankenstricheFix(t);

    const body = await bodyText(t, "rollenvergabe");
    expect(body).not.toContain("—");
    expect(body).toContain(
      "Die übrigen lokalen Rollen (Vorstand, Event Organisator, Seiten Editor) vergibt die LEAD-Person",
    );
  });

  it("schreibt Frage und Text derselben Zeile gemeinsam um", async () => {
    await applyGedankenstricheFix(t);

    expect(await question(t, "scope-switcher")).toBe("Wie wechsle ich zwischen mehreren Rollen?");
    const body = await bodyText(t, "scope-switcher");
    expect(body).not.toContain("—");
    expect(body).toContain("zwischen den Ansichten. Die URL musst du dafür nicht wechseln.");
  });

  it("migriert die beiden bereits von 0003 aktualisierten Alumni-Zeilen weiter auf Doppelpunkt/Punkt", async () => {
    await applyGedankenstricheFix(t);

    const roles = await bodyText(t, "rollenmodell");
    expect(roles).not.toContain("—");
    expect(roles).toContain(
      "Alumni: ehemaliges Mitglied; eine Kennzeichnung, keine Einschränkung.",
    );

    const alumni = await bodyText(t, "alumni");
    expect(alumni).not.toContain("—");
    expect(alumni).toContain(
      "als Alumnus gekennzeichnet. Das ist eine Einordnung, keine Einschränkung.",
    );
  });

  it("überschreibt keinen vom Bundesvorstand bearbeiteten Eintrag", async () => {
    await t.client`UPDATE faq_entries SET updated_by = 'usr_board' WHERE id = 'overview'`;
    const before = await bodyText(t, "overview");

    await applyGedankenstricheFix(t);

    expect(await bodyText(t, "overview")).toBe(before);
    expect(before).toContain("—");
  });

  it("ist idempotent", async () => {
    await applyGedankenstricheFix(t);
    const firstRows = await t.client`
      SELECT id, body::text AS b, question, updated_at FROM faq_entries
       WHERE id IN ('overview', 'rollenvergabe', 'scope-switcher', 'rollenmodell', 'alumni')
       ORDER BY id
    `;

    await applyGedankenstricheFix(t);
    const secondRows = await t.client`
      SELECT id, body::text AS b, question, updated_at FROM faq_entries
       WHERE id IN ('overview', 'rollenvergabe', 'scope-switcher', 'rollenmodell', 'alumni')
       ORDER BY id
    `;

    expect(secondRows).toEqual(firstRows);
  });

  it("lässt eine frische, bereits korrekte Seed-Zeile unangetastet (No-op auf frischer DB)", async () => {
    // 'pe-scope' was not rewound to em-dash text above, it still carries the
    // fixed text straight from 0002_seed.sql — the fresh-database case.
    const before = await t.client`
      SELECT updated_at FROM faq_entries WHERE id = 'pe-scope'
    `;

    await applyGedankenstricheFix(t);

    const after = await t.client`
      SELECT updated_at FROM faq_entries WHERE id = 'pe-scope'
    `;
    expect(after).toEqual(before);
    expect(await bodyText(t, "pe-scope")).not.toContain("—");
  });
});
