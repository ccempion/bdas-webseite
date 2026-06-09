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

const sql = postgres(url, { max: 2, onnotice: () => {} });

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}

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
    WHERE lower(u.email) = lower(${email}) AND v.used_at IS NULL
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
    WHERE lower(u.email) = lower(${email}) AND r.used_at IS NULL
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
  await sql`DELETE FROM auth_users WHERE lower(email) = lower(${email})`;
}

/** Insert a group directly and return its id. `status` defaults to 'active'. */
export async function seedGroup(input: {
  slug: string;
  name: string;
  city: string;
  status?: "active" | "dormant" | "new" | "archived";
}): Promise<string> {
  const id = `grp_e2e_${rand()}`;
  await sql`
    INSERT INTO groups (id, slug, name, city, status)
    VALUES (${id}, ${input.slug}, ${input.name}, ${input.city}, ${input.status ?? "active"})`;
  return id;
}

/** The member id for a given login email (member rows are created on /account). */
export async function memberIdByEmail(email: string): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT m.id
    FROM members m
    JOIN auth_users u ON u.id = m.user_id
    WHERE lower(u.email) = lower(${email})
    LIMIT 1`;
  return rows[0]?.id ?? null;
}

/** Grant local_board of a group to the member with this email (immediate, DB-side). */
export async function grantLocalBoard(email: string, groupId: string): Promise<void> {
  const memberId = await memberIdByEmail(email);
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
    WHERE lower(u.email) = lower(${email})
    LIMIT 1`;
  return rows[0]?.status ?? null;
}
