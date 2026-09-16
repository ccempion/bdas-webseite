import { and, eq, exists, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { listGroupIdsByKind } from "@bdas/groups";

import { members, memberRoleGrants } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Die Zahlen der Vorstands-Übersicht. `pending`/`active` sind Kontostände aus
 * `members.status`; `alumnus` ist seit ADR 0043 kein Status mehr, sondern ein
 * Grant — der Eimer bleibt trotzdem, sonst zählte der Bundesvorstand ab dem
 * Merge stillschweigend etwas anderes als vorher. Ein Alumnus zählt in BEIDEN
 * Eimern: er ist ein aktives Mitglied mit einer Kennzeichnung.
 *
 * `active` zählt seit ADR 0045 nur Mitglieder (Spec 2026-09-16 §3.1):
 * aufgenommen UND (Hochschulgruppe ODER Alumnus-Markierung). Ein
 * Förderer-Account ist aufgenommen, aber kein Mitglied. `pending` bleibt der
 * Bewerbungs-Pool — diese Accounts haben noch keine Gruppe (ADR 0031).
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

  const pendingRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(members)
    .where(and(eq(members.status, "pending"), scope));

  // Die Gruppen-IDs kommen über die öffentliche Schnittstelle — members liest
  // die groups-Tabelle nicht (CLAUDE.md §1).
  const hochschulIds = await listGroupIdsByKind(db, "hochschulgruppe");
  const hasAlumnusMark = exists(
    db
      .select({ one: sql`1` })
      .from(memberRoleGrants)
      .where(
        and(
          eq(memberRoleGrants.memberId, members.id),
          eq(memberRoleGrants.role, "alumnus"),
          isNull(memberRoleGrants.revokedAt),
        ),
      ),
  );
  const isMember =
    hochschulIds.length > 0
      ? or(inArray(members.primaryGroupId, hochschulIds), hasAlumnusMark)
      : hasAlumnusMark;
  const activeRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(members)
    .where(and(eq(members.status, "active"), isMember, scope));

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

  return {
    pending: pendingRows[0]?.n ?? 0,
    active: activeRows[0]?.n ?? 0,
    alumnus: alumnusRows[0]?.n ?? 0,
  };
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
