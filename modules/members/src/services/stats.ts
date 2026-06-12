import { and, eq, gte, sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { members } from "../schema";
import type { MemberStatus } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;
export type StatusCounts = Record<MemberStatus, number>;
export type SignupPoint = { readonly day: string; readonly count: number };

const ZERO: StatusCounts = { pending: 0, active: 0, inactive: 0, alumnus: 0 };

export async function countMembersByStatus(
  db: Db,
  q: { readonly groupId?: string } = {},
): Promise<StatusCounts> {
  const where = q.groupId ? eq(members.primaryGroupId, q.groupId) : undefined;
  const rows = await db
    .select({ status: members.status, n: sql<number>`count(*)::int` })
    .from(members)
    .where(where)
    .groupBy(members.status);
  const out: StatusCounts = { ...ZERO };
  for (const r of rows) out[r.status as MemberStatus] = r.n;
  return out;
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
