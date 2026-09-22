/**
 * E2E test-data helper. Talks to the same Postgres the app uses (`DATABASE_URL`)
 * to do the things a browser can't: read the one-time verify/reset tokens the
 * app would have emailed, seed groups and a local_board_lead grant, and clear rate
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

/**
 * Clear the fixed-window rate-limit counters so register/login flows aren't
 * throttled.
 *
 * `keyPrefix` narrows it to one family of counters (`register:`, `login:`,
 * `reset-request:` — see `modules/auth/src/rate-limit.ts`), mirroring the
 * module's own test helper. Callers should pass the family they are about to
 * spend: a whole-table wipe from inside `register()` used to clear everyone
 * else's counters as a side effect, which is exactly the kind of implicit
 * coupling that makes a spec pass only because an unrelated one ran first.
 */
export async function resetRateLimits(keyPrefix?: string): Promise<void> {
  if (keyPrefix === undefined) {
    await sql`DELETE FROM auth_rate_limits`;
    return;
  }
  await sql`DELETE FROM auth_rate_limits WHERE key LIKE ${keyPrefix + "%"}`;
}

/**
 * Der Hash des jüngsten offenen Bestätigungstokens, oder null. Den Klartext gibt
 * die Tabelle nicht mehr her (ADR 0051), der Hash reicht aber, um zu prüfen,
 * dass ein neuer Token ausgestellt wurde. Den Token selbst kennt der Browser,
 * siehe `verifyTokenFromBrowser` in `helpers/flows.ts`.
 */
export async function latestVerifyTokenHash(email: string): Promise<string | null> {
  const rows = await sql<{ tokenHash: string }[]>`
    SELECT v.token_hash AS "tokenHash"
    FROM auth_email_verifications v
    JOIN auth_users u ON u.id = v.user_id
    WHERE u.email_normalized = lower(${email}) AND v.used_at IS NULL
    ORDER BY v.created_at DESC
    LIMIT 1`;
  return rows[0]?.tokenHash ?? null;
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

/** Grant a group-scoped role to the member with this email (immediate, DB-side). */
async function grantGroupRole(email: string, groupId: string, role: string): Promise<void> {
  // The member row is created by the /account Server Action just before this;
  // poll briefly so we don't race its commit.
  let memberId: string | null = null;
  for (let i = 0; i < 20 && !memberId; i++) {
    memberId = await memberIdByEmail(email);
    if (!memberId) await new Promise((r) => setTimeout(r, 250));
  }
  if (!memberId) throw new Error(`grantGroupRole(${role}): no member for ${email}`);
  await sql`
    INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
    VALUES (${`mrg_e2e_${rand()}`}, ${memberId}, ${role}, ${groupId}, 'e2e')`;
}

/** Grant local_board_lead — the authority that owns the group's profile (#62). */
export function grantLocalBoardLead(email: string, groupId: string): Promise<void> {
  return grantGroupRole(email, groupId, "local_board_lead");
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
 *  race `grantLocalBoardLead` above guards against).
 *
 *  Active alone is an accepted account, not a BDAS member (ADR 0045). Pass
 *  `groupId` (a Hochschulgruppe) when the test needs a member — commenting,
 *  the federation-wide members folder. */
export async function activateMemberByEmail(
  email: string,
  opts: { groupId?: string } = {},
): Promise<string> {
  let memberId: string | null = null;
  for (let i = 0; i < 20 && !memberId; i++) {
    memberId = await memberIdByEmail(email);
    if (!memberId) await new Promise((r) => setTimeout(r, 250));
  }
  if (!memberId) throw new Error(`activateMemberByEmail: no member for ${email}`);
  await sql`
    UPDATE members
       SET status = 'active',
           primary_group_id = COALESCE(${opts.groupId ?? null}, primary_group_id)
     WHERE id = ${memberId}`;
  return memberId;
}

/**
 * Turn a member's pending group-change request (created by `createProfile`'s
 * application, `NULL → toGroupId`) into a transfer between the two given
 * groups — the destination-board decision path, per ADR 0022/0031. Rewrites
 * the same row rather than inserting a second one: only one `pending` request
 * per member is allowed (`member_group_change_requests_open_uq`).
 */
export async function seedGroupTransferRequest(
  email: string,
  fromGroupId: string,
  toGroupId: string,
): Promise<void> {
  const memberId = await memberIdByEmail(email);
  if (!memberId) throw new Error(`seedGroupTransferRequest: no member for ${email}`);
  await sql`
    UPDATE member_group_change_requests
    SET from_group_id = ${fromGroupId}, to_group_id = ${toGroupId}
    WHERE member_id = ${memberId} AND status = 'pending'`;
}

/**
 * Write a ready-to-use account straight into the database: the `auth_users`
 * row an e-mail confirmation would have left behind, its credentials, and the
 * `members` row registration creates alongside them.
 *
 * `applicationGroupId` reproduces what picking a group in the profile form
 * does (ADR 0022): an open request NULL → group, while `primary_group_id`
 * stays empty until a board decides. `primaryGroupId` is the other half — the
 * state *after* that decision. Passing both at once is not a state the app can
 * produce for a pending member, so pass one.
 *
 * Used by `helpers/session.ts`; see there for why the specs seed instead of
 * driving the registration forms.
 */
export async function seedAccount(input: {
  email: string;
  firstName: string;
  lastName: string;
  hashedPassword: string;
  memberStatus: "pending" | "active";
  primaryGroupId: string | null;
  applicationGroupId: string | null;
}): Promise<{ userId: string; memberId: string }> {
  const userId = `usr_e2e_${rand()}${rand()}`;
  const memberId = `mem_e2e_${rand()}${rand()}`;
  const emailNormalized = input.email.trim().toLowerCase();

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO auth_users (id, email_normalized, email_display, status,
                              consent_at, consent_version)
      VALUES (${userId}, ${emailNormalized}, ${input.email.trim()}, 'active',
              now(), 'e2e-seed')`;
    await tx`
      INSERT INTO auth_credentials (user_id, hashed_password, algorithm)
      VALUES (${userId}, ${input.hashedPassword}, 'argon2id')`;
    await tx`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES (${memberId}, ${userId}, ${input.firstName}, ${input.lastName},
              ${input.primaryGroupId}, ${input.memberStatus})`;
    if (input.applicationGroupId !== null) {
      await tx`
        INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
        VALUES (${"mgc_e2e_" + rand()}, ${memberId}, NULL, ${input.applicationGroupId})`;
    }
  });

  return { userId, memberId };
}

/** A fresh session row for a seeded account. Its id becomes the JWT's `jti`,
 *  which is what `getCurrentUser` looks up on every request. */
export async function insertSessionRow(userId: string, maxAgeSeconds: number): Promise<string> {
  const id = `ses_e2e_${rand()}${rand()}`;
  await sql`
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES (${id}, ${userId}, now() + make_interval(secs => ${maxAgeSeconds}))`;
  return id;
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

/** Seed a Puck document for a content page (slug `gruppen/<slug>` for a group
 *  page). Used to plant documents in shapes the editor no longer produces —
 *  e.g. a `Bild` still carrying the pre-2026-08-11 `"voll" | "halb"` width. */
export async function seedContentPage(slug: string, data: unknown): Promise<void> {
  await sql`
    INSERT INTO content_pages (slug, data, updated_by)
    VALUES (${slug}, ${sql.json(data as never)}, 'e2e')
    ON CONFLICT (slug) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by`;
}

/**
 * Drop every FAQ entry pinned to one context key.
 *
 * Nothing else removes them, so a local database that survives between runs
 * accumulates every entry the `Kontextuelle Hilfe` specs create — and
 * `FaqHinweis` caps at `MAX_ENTRIES`, so a spec asserting "exactly N of the M
 * entries I pin are visible" needs the M it creates to be every entry
 * currently pinned to that context, not that plus whatever earlier runs left
 * behind. `faq_entry_contexts` cascades from `faq_entries`, so deleting the
 * entries is enough (same shape of problem as `deleteSeededGroups` above).
 */
export async function deleteFaqEntriesByContext(context: string): Promise<void> {
  await sql`
    DELETE FROM faq_entries
     WHERE id IN (SELECT entry_id FROM faq_entry_contexts WHERE context = ${context})`;
}

/** Query whether a member voted on an FAQ entry and whether they found it helpful. */
export async function faqFeedbackByUserAndEntry(
  userEmail: string,
  entryId: string,
): Promise<{ helpful: boolean } | null> {
  const rows = await sql<{ helpful: boolean }[]>`
    SELECT helpful
    FROM faq_feedback f
    JOIN auth_users u ON u.id = f.user_id
    WHERE u.email_normalized = lower(${userEmail}) AND f.entry_id = ${entryId}`;
  return rows[0] ?? null;
}

/**
 * Clear the newsletter throttles (its own table, owned by `modules/newsletter`,
 * so `resetRateLimits` above does not reach it).
 *
 * The public signup is capped at five per IP per hour — and a whole Playwright
 * run shares one IP. Without this the sixth signup of the hour is refused
 * SILENTLY, by design: the page still says "Fast geschafft." while nothing is
 * written, so the spec fails on the row and not on anything it can see.
 */
export async function resetNewsletterRateLimits(): Promise<void> {
  await sql`DELETE FROM newsletter_rate_limits`;
}

/** Newsletter rows survive `deleteUserByEmail` when there is no account behind
 *  the address at all, which is exactly the public-capture case. */
export async function deleteNewsletterSubscriberByEmail(email: string): Promise<void> {
  await sql`DELETE FROM newsletter_subscribers WHERE email = ${email.toLowerCase()}`;
}

/**
 * The confirmation token is only ever stored hashed, so a spec cannot read it
 * back and click it. It reads the status instead: the E2E asserts the visible
 * outcome of the double opt-in, not the token itself.
 */
export async function newsletterStatus(email: string): Promise<string | null> {
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM newsletter_subscribers WHERE email = ${email.toLowerCase()} LIMIT 1`;
  return rows[0]?.status ?? null;
}

/**
 * Answers the scroll panel's own gate (shouldPrompt, spec §6.1) for this
 * account, server-side, so a spec whose page happens to be tall enough for
 * NewsletterScrollPanel to trigger never has to race its scroll listener —
 * the panel simply never becomes eligible to mount.
 */
export async function declineNewsletterPromptByEmail(email: string): Promise<void> {
  await sql`
    INSERT INTO newsletter_prompts (user_id, dismiss_count)
    SELECT u.id, 1 FROM auth_users u WHERE u.email_normalized = lower(${email})
    ON CONFLICT (user_id) DO UPDATE
      SET dismiss_count = newsletter_prompts.dismiss_count + 1,
          last_dismissed_at = now()`;
}

/** Die Journey eines Kontos (onboarding_journeys), oder null. */
export async function journeyByEmail(email: string): Promise<{
  outcome: string;
  status: string;
  entry_source: string;
  stadt: string | null;
  application_ref: string | null;
} | null> {
  const rows = await sql<
    {
      outcome: string;
      status: string;
      entry_source: string;
      stadt: string | null;
      application_ref: string | null;
    }[]
  >`
    SELECT j.outcome, j.status, j.entry_source, j.stadt, j.application_ref
    FROM onboarding_journeys j
    JOIN auth_users u ON u.id = j.user_id
    WHERE u.email_normalized = ${email.trim().toLowerCase()}`;
  return rows[0] ?? null;
}

/** Die Netzwerk-Zeile, die `infra/seeds/groups.json` in echten Umgebungen anlegt. */
export async function ensureNetzwerkGroup(): Promise<string> {
  await sql`
    INSERT INTO groups (id, slug, name, city, kind, status)
    VALUES ('grp_netzwerk_e2e', 'netzwerk', 'BDAS Netzwerk', NULL, 'netzwerk', 'active')
    ON CONFLICT (slug) DO NOTHING`;
  const rows = await sql<{ id: string }[]>`SELECT id FROM groups WHERE slug = 'netzwerk'`;
  return rows[0]!.id;
}

/** Ziel des offenen Gruppenantrags eines Kontos, oder null. */
export async function openRequestTargetByEmail(email: string): Promise<string | null> {
  const rows = await sql<{ to_group_id: string | null }[]>`
    SELECT r.to_group_id
    FROM member_group_change_requests r
    JOIN members m ON m.id = r.member_id
    JOIN auth_users u ON u.id = m.user_id
    WHERE u.email_normalized = ${email.trim().toLowerCase()} AND r.status = 'pending'`;
  return rows[0]?.to_group_id ?? null;
}
