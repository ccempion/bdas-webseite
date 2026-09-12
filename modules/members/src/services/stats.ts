import { and, eq, gte, isNull, sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { members, memberRoleGrants } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Die Zahlen der Vorstands-Übersicht. `pending`/`active` sind Kontostände aus
 * `members.status`; `alumnus` ist seit ADR 0043 kein Status mehr, sondern ein
 * Grant — der Eimer bleibt trotzdem, sonst zählte der Bundesvorstand ab dem
 * Merge stillschweigend etwas anderes als vorher. Ein Alumnus zählt in BEIDEN
 * Eimern: er ist ein aktives Mitglied mit einer Kennzeichnung.
 */
export type MemberCounts = {
  readonly pending: number;
  readonly active: number;
  readonly alumnus: number;
};

/** @deprecated Name aus der Zeit, als alle Eimer Status waren. Alias auf MemberCounts. */
export type StatusCounts = MemberCounts;

export type SignupPoint = { readonly day: string; readonly count: number };

export async function countMembersByStatus(
  db: Db,
  q: { readonly groupId?: string } = {},
): Promise<MemberCounts> {
  const scope = q.groupId ? eq(members.primaryGroupId, q.groupId) : undefined;

  const statusRows = await db
    .select({ status: members.status, n: sql<number>`count(*)::int` })
    .from(members)
    .where(scope)
    .groupBy(members.status);

  const alumnusConds: SQL[] = [
    eq(memberRoleGrants.role, "alumnus"),
    isNull(memberRoleGrants.revokedAt) as SQL,
  ];
  if (q.groupId) alumnusConds.push(eq(members.primaryGroupId, q.groupId));
  const alumnusRows = await db
    .select({ n: sql<number>`count(distinct ${memberRoleGrants.memberId})::int` })
    .from(memberRoleGrants)
    .innerJoin(members, eq(members.id, memberRoleGrants.memberId))
    .where(and(...alumnusConds));

  let pending = 0;
  let active = 0;
  for (const r of statusRows) {
    if (r.status === "pending") pending = r.n;
    if (r.status === "active") active = r.n;
  }
  return { pending, active, alumnus: alumnusRows[0]?.n ?? 0 };
}

/**
 * Daily signup counts over the last `days` days (default 30), zero-filled so
 * the sparkline always has `days` buckets. `day` is an ISO date (YYYY-MM-DD).
 */
export async function signupsOverTime(
  db: Db,
  q: { readonly groupId?: string; readonly days?: number } = {},
): Promise<SignupPoint[]> {
  const days = q.days ?? 30;
  const conds: SQL[] = [gte(members.createdAt, sql`now() - (${days} || ' days')::interval`)];
  if (q.groupId) conds.push(eq(members.primaryGroupId, q.groupId));
  // Bucket in UTC so the SQL day keys align with the UTC zero-fill keys below,
  // regardless of the Postgres session timezone.
  const dayUtc = sql`date_trunc('day', ${members.createdAt} AT TIME ZONE 'UTC')`;
  const rows = await db
    .select({
      day: sql<string>`to_char(${dayUtc}, 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(members)
    .where(and(...conds))
    .groupBy(dayUtc);

  const byDay = new Map(rows.map((r) => [r.day, r.n]));
  const out: SignupPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: byDay.get(key) ?? 0 });
  }
  return out;
}
