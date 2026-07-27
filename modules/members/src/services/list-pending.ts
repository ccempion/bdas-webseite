import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ForbiddenError } from "@bdas/errors";

import { isFederalBoard } from "../roles";
import { members } from "../schema";
import type { Member } from "../types";

import { row2member } from "./get";
import { scopedGroupIds, type Actor } from "./status";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Pending members the actor may decide on (ADR 0007): federal_board sees all;
 * a local_board (or local_board_lead, which manages its group too per ADR 0013)
 * sees only pending members of the groups it is scoped to.
 */
export async function listPendingMembers(db: Db, actor: Actor): Promise<Member[]> {
  const federal = isFederalBoard(actor.grants);
  const scoped = scopedGroupIds(actor);

  if (!federal && scoped.length === 0) {
    throw new ForbiddenError("Nur Vorstände dürfen diese Liste sehen.");
  }

  const rows = await db
    .select()
    .from(members)
    .where(eq(members.status, "pending"))
    .orderBy(asc(members.createdAt));

  const visible = federal
    ? rows
    : rows.filter((r) => r.primaryGroupId !== null && scoped.includes(r.primaryGroupId));

  return visible.map(row2member);
}
