/**
 * Private test harness for the onboarding module. Not re-exported from index.ts.
 *
 * Pulls in auth (the journey FK), all groups migrations (listGroups and
 * getGroupBySlug select every groups column) and all members migrations
 * (completeJourney files a request through @bdas/members). Fixtures are plain
 * SQL: other modules expose only their public surface.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { createTestDb, type TestDb } from "@bdas/db/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

const m = (module: string, file: string) => ["..", "..", module, "migrations", file];

/** Migration files, in apply order. Append new onboarding migrations at the end. */
export const ONBOARDING_TEST_MIGRATIONS: ReadonlyArray<ReadonlyArray<string>> = [
  m("auth", "0001_init.sql"),
  m("groups", "0001_init.sql"),
  m("groups", "0002_status_check.sql"),
  m("groups", "0003_drop_university_description.sql"),
  m("groups", "0004_location.sql"),
  m("groups", "0005_image_key.sql"),
  m("groups", "0006_link_scheme_guard.sql"),
  m("groups", "0007_group_kind.sql"),
  m("groups", "0008_group_kind_netzwerk.sql"),
  m("members", "0001_init.sql"),
  m("members", "0002_role_grants.sql"),
  m("members", "0003_local_board_lead.sql"),
  m("members", "0004_revoked_by.sql"),
  m("members", "0005_event_organizer.sql"),
  m("members", "0006_group_change_requests.sql"),
  m("members", "0007_page_editor.sql"),
  m("members", "0008_application_reasons.sql"),
  m("members", "0009_reason_required.sql"),
  m("members", "0010_local_role_redesign.sql"),
  m("members", "0011_alumnus_is_a_role.sql"),
  ["..", "migrations", "0001_init.sql"],
];

export async function dbReachable(): Promise<boolean> {
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

export async function setupOnboardingDb(): Promise<TestDb> {
  const t = await createTestDb();
  for (const file of ONBOARDING_TEST_MIGRATIONS) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
  return t;
}

export async function seedUser(t: TestDb, id: string): Promise<void> {
  await t.client`
    INSERT INTO auth_users (id, email_normalized, email_display, status)
    VALUES (${id}, ${`${id}@test.local`}, ${`${id}@test.local`}, 'active')`;
}

export async function seedGroup(
  t: TestDb,
  g: {
    id: string;
    slug: string;
    kind: "hochschulgruppe" | "affiliate" | "netzwerk";
    status?: "active" | "dormant" | "new" | "archived";
  },
): Promise<void> {
  const city = g.kind === "hochschulgruppe" ? "Berlin" : null;
  await t.client`
    INSERT INTO groups (id, slug, name, city, kind, status)
    VALUES (${g.id}, ${g.slug}, ${`BDAS ${g.slug}`}, ${city}, ${g.kind}, ${g.status ?? "active"})`;
}

export async function seedMember(
  t: TestDb,
  mem: { id: string; userId: string; status?: "pending" | "active"; groupId?: string | null },
): Promise<void> {
  await t.client`
    INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
    VALUES (${mem.id}, ${mem.userId}, 'Lea', 'Yıldız', ${mem.groupId ?? null}, ${mem.status ?? "pending"})`;
}
