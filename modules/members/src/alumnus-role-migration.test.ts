import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

/**
 * Die Migration läuft bereits in setupMembersDb, ein hier eingefügtes Fixture
 * ist also schon migriert. Um die Migration selbst zu prüfen, wird der von ihr
 * gesetzte CHECK kurz gelöst, der Vor-Migrations-Zustand eingefügt und der
 * Datenschritt erneut ausgeführt — er ist durch den NOT-EXISTS-Guard und
 * ON CONFLICT DO NOTHING idempotent. Dass der CHECK danach wieder gesetzt
 * werden KANN, ist selbst die schärfste Zusicherung: er greift nur, wenn der
 * Datenschritt jede Zeile sauber überführt hat.
 */
describeIfDb("0011 alumnus is a role — Datenmigration", () => {
  let t: TestDb;
  let hadStatusCheck = false;

  beforeEach(async () => {
    t = await setupMembersDb();
    // Auf conrelid eingegrenzt: jede Testdatei bekommt ein eigenes Schema,
    // pg_constraint ist aber datenbankweit — ohne die Einschränkung zählte
    // diese Abfrage die gleichnamigen Constraints paralleler Läufe mit.
    hadStatusCheck =
      (
        await t.client`
          SELECT 1 FROM pg_constraint
           WHERE conname = 'members_status_check' AND conrelid = 'members'::regclass
        `
      ).length === 1;

    await t.client.unsafe(`ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check`);
    await createGroup(t, "grp_a", "aachen");
    for (const [id, email] of [
      ["usr_al", "al@example.de"],
      ["usr_in", "in@example.de"],
      ["usr_ac", "ac@example.de"],
      ["usr_pe", "pe@example.de"],
      ["usr_dp", "dp@example.de"],
    ]) {
      await createUser(t, id!, email!);
    }
    // Alumnus mit Gruppe
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_al', 'usr_al', 'Alma', 'Alumna', 'grp_a', 'alumnus', now())
    `;
    // Inaktives Ex-Mitglied ohne Gruppe (0008 hat die Nie-Mitglieder bereits befreit)
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_in', 'usr_in', 'Ina', 'Inaktiv', NULL, 'inactive', now())
    `;
    // gewöhnliches aktives Mitglied
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_ac', 'usr_ac', 'Ada', 'Aktiv', 'grp_a', 'active', now())
    `;
    // Bewerberin
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_pe', 'usr_pe', 'Pia', 'Pending', NULL, 'pending')
    `;
    // Alumnus, der den Grant BEREITS hat — darf keinen zweiten bekommen
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_dp', 'usr_dp', 'Doro', 'Doppelt', 'grp_a', 'alumnus', now())
    `;
    await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
      VALUES ('mrg_dp', 'mem_dp', 'alumnus', 'grp_a', 'system')
    `;

    await runDataSteps(t);
    await t.client.unsafe(
      `ALTER TABLE members ADD CONSTRAINT members_status_check CHECK (status IN ('pending', 'active'))`,
    );
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("die Migration setzt einen CHECK auf members.status", () => {
    expect(hadStatusCheck).toBe(true);
  });

  it("macht aus einem Alumnus ein aktives Mitglied mit Grant", async () => {
    const [m] = await t.client`SELECT status FROM members WHERE id = 'mem_al'`;
    expect(m!["status"]).toBe("active");

    const grants = await t.client`
      SELECT group_id FROM member_role_grants
       WHERE member_id = 'mem_al' AND role = 'alumnus' AND revoked_at IS NULL
    `;
    expect(grants).toHaveLength(1);
    expect(grants[0]!["group_id"]).toBe("grp_a");
  });

  it("behandelt ein inaktives Ex-Mitglied genauso — ohne Gruppe im Scope", async () => {
    const [m] = await t.client`SELECT status FROM members WHERE id = 'mem_in'`;
    expect(m!["status"]).toBe("active");

    const grants = await t.client`
      SELECT group_id FROM member_role_grants
       WHERE member_id = 'mem_in' AND role = 'alumnus' AND revoked_at IS NULL
    `;
    expect(grants).toHaveLength(1);
    expect(grants[0]!["group_id"]).toBeNull();
  });

  it("lässt aktive Mitglieder und Bewerberinnen unberührt", async () => {
    const [a] = await t.client`SELECT status FROM members WHERE id = 'mem_ac'`;
    expect(a!["status"]).toBe("active");
    const [p] = await t.client`SELECT status FROM members WHERE id = 'mem_pe'`;
    expect(p!["status"]).toBe("pending");
    const grants = await t.client`
      SELECT id FROM member_role_grants WHERE member_id IN ('mem_ac', 'mem_pe')
    `;
    expect(grants).toHaveLength(0);
  });

  it("vergibt keinen zweiten Grant an jemanden, der ihn schon hat", async () => {
    const grants = await t.client`
      SELECT id FROM member_role_grants
       WHERE member_id = 'mem_dp' AND role = 'alumnus' AND revoked_at IS NULL
    `;
    expect(grants).toHaveLength(1);
  });

  it("ist idempotent — ein zweiter Lauf ändert nichts", async () => {
    await runDataSteps(t);
    const grants = await t.client`
      SELECT member_id FROM member_role_grants WHERE role = 'alumnus' AND revoked_at IS NULL
    `;
    expect(grants).toHaveLength(3);
  });

  it("weist nach der Migration jeden anderen Status ab", async () => {
    await createUser(t, "usr_bad", "bad@example.de");
    await expect(
      t.client`
        INSERT INTO members (id, user_id, first_name, last_name, status)
        VALUES ('mem_bad', 'usr_bad', 'Bad', 'Value', 'alumnus')
      `,
    ).rejects.toThrow(/members_status_check/);
  });
});

/** Schritt 1 der Migration, gegen das Fixture wiederholt. */
async function runDataSteps(t: TestDb): Promise<void> {
  await t.client.unsafe(`
    INSERT INTO member_role_grants (id, member_id, role, group_id, granted_at, granted_by)
    SELECT 'mrg_alum_' || m.id, m.id, 'alumnus', m.primary_group_id, now(), 'system'
      FROM members m
     WHERE m.status IN ('alumnus', 'inactive')
       AND NOT EXISTS (
             SELECT 1 FROM member_role_grants g
              WHERE g.member_id = m.id AND g.role = 'alumnus' AND g.revoked_at IS NULL
           )
    ON CONFLICT (id) DO NOTHING;

    UPDATE members
       SET status = 'active', updated_at = now()
     WHERE status IN ('alumnus', 'inactive');
  `);
}
