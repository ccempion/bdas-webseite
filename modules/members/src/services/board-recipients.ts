import { and, eq, isNull, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { memberRoleGrants } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Member ids that should be notified of a new application in `groupId`:
 * the group's active local board (lead + members). Falls back to the federal
 * board when the group has no local board (spec §8). Deduplicated.
 */
export async function listBoardRecipientsForGroup(
  db: Db,
  groupId: string | null,
): Promise<string[]> {
  if (groupId) {
    const local = await db
      .select({ memberId: memberRoleGrants.memberId })
      .from(memberRoleGrants)
      .where(
        and(
          eq(memberRoleGrants.groupId, groupId),
          isNull(memberRoleGrants.revokedAt),
          or(
            eq(memberRoleGrants.role, "local_board"),
            eq(memberRoleGrants.role, "local_board_lead"),
          ),
        ),
      );
    const ids = [...new Set(local.map((r) => r.memberId))];
    if (ids.length > 0) return ids;
  }

  const federal = await db
    .select({ memberId: memberRoleGrants.memberId })
    .from(memberRoleGrants)
    .where(and(eq(memberRoleGrants.role, "federal_board"), isNull(memberRoleGrants.revokedAt)));
  return [...new Set(federal.map((r) => r.memberId))];
}
