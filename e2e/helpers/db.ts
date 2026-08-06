/**
 * E2E test-data helper. Talks to the same Postgres the app uses (`DATABASE_URL`)
 * to do the things a browser can't: read the one-time verify/reset tokens the
 * app would have emailed, seed groups and a local_board grant, and clear rate
 * limits so a shared-IP run doesn't trip the register/login limiters.
 *
 * This only touches test data in an ephemeral CI database — never production.
 */
import postgres from "postgres";

const url = process.env["DATABASE_URL"];
if (!url) {
  throw new Error("E2E helper requires DATABASE_URL (the same DB the app runs against).");
}

// One shared client for the whole Playwright worker. `idle_timeout` lets idle
// connections close themselves so the worker process can exit without anyone
// calling `.end()` — ending it mid-suite would break later spec files
// (CONNECTION_ENDED), since they share this module instance.
const sql = postgres(url, { max: 2, idle_timeout: 3, onnotice: () => {} });

/** Random suffix so parallel-safe unique emails/slugs never collide across runs. */
function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}
export function uniqueEmail(prefix: string): string {
  return `${prefix}.${rand()}@e2e.bdas.test`;
}
export function uniqueSlug(prefix: string): string {
  return `${prefix}-${rand()}`;
}

/** Clear the fixed-window rate-limit counters so register/login flows aren't throttled. */
export async function resetRateLimits(): Promise<void> {
  await sql`DELETE FROM auth_rate_limits`;
}

/** The latest unused email-verification token for an email, or null. */
export async function latestVerifyToken(email: string): Promise<string | null> {
  const rows = await sql<{ token: string }[]>`
    SELECT v.token
    FROM auth_email_verifications v
    JOIN auth_users u ON u.id = v.user_id
    WHERE u.email_normalized = lower(${email}) AND v.used_at IS NULL
    ORDER BY v.created_at DESC
    LIMIT 1`;
  return rows[0]?.token ?? null;
}

/** The latest unused password-reset token for an email, or null. */
export async function latestResetToken(email: string): Promise<string | null> {
  const rows = await sql<{ token: string }[]>`
    SELECT r.token
    FROM auth_password_resets r
    JOIN auth_users u ON u.id = r.user_id
    WHERE u.email_normalized = lower(${email}) AND r.used_at IS NULL
    ORDER BY r.created_at DESC
    LIMIT 1`;
  return rows[0]?.token ?? null;
}

/**
 * Delete a user (and everything FK-cascaded: credentials, sessions, tokens,
 * member, role grants) by email. Used to keep the fixed federal-board email
 * idempotent across Playwright retries in a shared DB.
 */
export async function deleteUserByEmail(email: string): Promise<void> {
  await sql`DELETE FROM auth_users WHERE email_normalized = lower(${email})`;
}

/**
 * Drop the groups seeded by earlier runs of this suite.
 *
 * Nothing else removes them, so on a database that survives between runs they
 * pile up — and they are visible to every spec, not just the one that made
 * them. A second run finds two "E2E Aktive Gruppe" cards in the public list and
 * two pins on the map, and strict-mode locators fail in specs that nobody
 * touched. CI starts from an empty database and never sees this, which is
 * precisely why it costs local time to diagnose.
 *
 * Everything pointing at a group either cascades or nulls out, except
 * `member_group_change_requests`, whose two FKs declare no action — those rows
 * go first or the delete is refused.
 */
export async function deleteSeededGroups(): Promise<void> {
  await sql`
    DELETE FROM member_group_change_requests
     WHERE from_group_id LIKE 'grp_e2e_%' OR to_group_id LIKE 'grp_e2e_%'`;
  await sql`DELETE FROM groups WHERE id LIKE 'grp_e2e_%'`;
}

/** Insert a group directly and return its id. `status` defaults to 'active'. */
export async function seedGroup(input: {
  slug: string;
  name: string;
  city: string;
  status?: "active" | "dormant" | "new" | "archived";
  contactEmail?: string;
  location?: { name: string; address: string; lat: number; lng: number };
}): Promise<string> {
  const id = `grp_e2e_${rand()}`;
  await sql`
    INSERT INTO groups (id, slug, name, city, status, contact_email,
                        location_name, location_address, location_lat, location_lng)
    VALUES (${id}, ${input.slug}, ${input.name}, ${input.city}, ${input.status ?? "active"},
            ${input.contactEmail ?? null},
            ${input.location?.name ?? null}, ${input.location?.address ?? null},
            ${input.location?.lat ?? null}, ${input.location?.lng ?? null})`;
  return id;
}

/** The stored contact email for a group (Task 5b regression check). */
export async function groupContactEmail(slug: string): Promise<string | null> {
  const rows = await sql<{ contact_email: string | null }[]>`
    SELECT contact_email FROM groups WHERE slug = ${slug} LIMIT 1`;
  return rows[0]?.contact_email ?? null;
}

/** The member id for a given login email (member rows are created on /account). */
export async function memberIdByEmail(email: string): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT m.id
    FROM members m
    JOIN auth_users u ON u.id = m.user_id
    WHERE u.email_normalized = lower(${email})
    LIMIT 1`;
  return rows[0]?.id ?? null;
}

/** Grant local_board of a group to the member with this email (immediate, DB-side). */
export async function grantLocalBoard(email: string, groupId: string): Promise<void> {
  // The member row is created by the /account Server Action just before this;
  // poll briefly so we don't race its commit.
  let memberId: string | null = null;
  for (let i = 0; i < 20 && !memberId; i++) {
    memberId = await memberIdByEmail(email);
    if (!memberId) await new Promise((r) => setTimeout(r, 250));
  }
  if (!memberId) throw new Error(`grantLocalBoard: no member for ${email}`);
  await sql`
    INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
    VALUES (${`mrg_e2e_${rand()}`}, ${memberId}, 'local_board', ${groupId}, 'e2e')`;
}

/** Current status of the member with this email (for asserting approval). */
export async function memberStatusByEmail(email: string): Promise<string | null> {
  const rows = await sql<{ status: string }[]>`
    SELECT m.status
    FROM members m
    JOIN auth_users u ON u.id = m.user_id
    WHERE u.email_normalized = lower(${email})
    LIMIT 1`;
  return rows[0]?.status ?? null;
}

/** Force a member straight to `active`, bypassing the board-approval flow —
 *  for tests that only need an active viewer (e.g. members_only visibility).
 *  Returns the member id. The member row is created by the /account Server
 *  Action just before this; poll briefly so we don't race its commit (same
 *  race `grantLocalBoard` above guards against). */
export async function activateMemberByEmail(email: string): Promise<string> {
  let memberId: string | null = null;
  for (let i = 0; i < 20 && !memberId; i++) {
    memberId = await memberIdByEmail(email);
    if (!memberId) await new Promise((r) => setTimeout(r, 250));
  }
  if (!memberId) throw new Error(`activateMemberByEmail: no member for ${email}`);
  await sql`UPDATE members SET status = 'active' WHERE id = ${memberId}`;
  return memberId;
}

/** Insert an active role grant for a member directly (bypasses the UI). */
export async function seedRoleGrant(
  memberId: string,
  role: string,
  groupId: string | null,
): Promise<void> {
  await sql`
    INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
    VALUES (${"mrg_e2e_" + rand()}, ${memberId}, ${role}, ${groupId}, 'usr_e2e_seed')`;
}

/** Insert an event directly and return its id. `events.id` has no DB default,
 *  so the id is generated here (same convention as `seedGroup`). Only sets
 *  the NOT NULL columns plus what the facets test needs; `status` is always
 *  'published' and `created_at` defaults to now() — both required for
 *  `listUpcomingEvents` to include the row. */
export async function seedEvent(input: {
  title: string;
  groupId: string | null;
  visibility: "public" | "members_only" | "group_only";
  startsAt: Date;
  createdBy: string;
}): Promise<string> {
  const id = `evt_e2e_${rand()}`;
  await sql`
    INSERT INTO events (id, group_id, title, starts_at, visibility, status, created_by)
    VALUES (${id}, ${input.groupId}, ${input.title}, ${input.startsAt},
            ${input.visibility}, 'published', ${input.createdBy})`;
  return id;
}
