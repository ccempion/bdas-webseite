/**
 * Members integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 *
 * Pulls in the auth + groups migrations because the members table FKs both.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { createProfile } from "./services/profile";
import { approveMember, transitionStatus } from "./services/status";
import { grantRole, revokeRole } from "./services/roles";
import { listPendingMembers } from "./services/list-pending";
import { getMemberByUserId } from "./services/get";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

async function dbReachable(): Promise<boolean> {
  const url = process.env["DATABASE_URL"] ?? DEFAULT_URL;
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 2 });
  try {
    await sql`select 1`;
    await sql.end();
    return true;
  } catch {
    try {
      await sql.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

const BOARD = {
  userId: "usr_board_actor",
  effectiveRoles: ["federal_board"] as const,
};
const PEASANT = {
  userId: "usr_peasant_actor",
  effectiveRoles: ["member"] as const,
};

describeIfDb("members integration", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "migrations", "0001_init.sql"],
    ]) {
      const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  async function createUser(id: string, email: string): Promise<void> {
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES (${id}, ${email}, ${email}, 'active')
    `;
  }

  it("createProfile writes a pending row", async () => {
    await createUser("usr_alice", "alice@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_alice",
      firstName: "Alice",
      lastName: "Beispiel",
    });
    expect(m.id).toMatch(/^mem_/);
    expect(m.status).toBe("pending");
    expect(m.roles).toEqual([]);
  });

  it("approveMember requires federal_board and stamps joined_at", async () => {
    await createUser("usr_bob", "bob@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_bob",
      firstName: "Bob",
      lastName: "Beispiel",
    });

    await expect(approveMember(t.db, m.id, PEASANT)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const approved = await approveMember(t.db, m.id, BOARD);
    expect(approved.status).toBe("active");
    expect(approved.joinedAt).not.toBeNull();
  });

  it("listPendingMembers shows only pending rows, ordered by createdAt", async () => {
    await createUser("usr_a", "a@example.de");
    await createUser("usr_b", "b@example.de");
    await createUser("usr_c", "c@example.de");

    const a = await createProfile(t.db, { userId: "usr_a", firstName: "A", lastName: "x" });
    await createProfile(t.db, { userId: "usr_b", firstName: "B", lastName: "x" });
    await createProfile(t.db, { userId: "usr_c", firstName: "C", lastName: "x" });

    await approveMember(t.db, a.id, BOARD);

    const pending = await listPendingMembers(t.db, BOARD);
    expect(pending.map((m) => m.firstName)).toEqual(["B", "C"]);
  });

  it("rejects illegal status transitions", async () => {
    await createUser("usr_d", "d@example.de");
    const m = await createProfile(t.db, { userId: "usr_d", firstName: "D", lastName: "x" });
    // pending → alumnus is not in the matrix
    await expect(transitionStatus(t.db, m.id, "alumnus", BOARD)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("grantRole / revokeRole writes the array correctly and is idempotent", async () => {
    await createUser("usr_e", "e@example.de");
    const m = await createProfile(t.db, { userId: "usr_e", firstName: "E", lastName: "x" });
    await approveMember(t.db, m.id, BOARD);

    await grantRole(t.db, m.id, "local_board", BOARD);
    await grantRole(t.db, m.id, "local_board", BOARD); // idempotent
    let updated = await getMemberByUserId(t.db, "usr_e");
    expect(updated?.roles).toEqual(["local_board"]);

    await revokeRole(t.db, m.id, "local_board", BOARD);
    updated = await getMemberByUserId(t.db, "usr_e");
    expect(updated?.roles).toEqual([]);

    await expect(grantRole(t.db, m.id, "not_a_role", BOARD)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(grantRole(t.db, m.id, "local_board", PEASANT)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
