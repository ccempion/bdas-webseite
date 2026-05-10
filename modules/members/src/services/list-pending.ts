import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ForbiddenError } from "@bdas/errors";

import { members } from "../schema";
import type { Member } from "../types";

import { row2member } from "./get";
import type { Actor } from "./status";

export type Db = PostgresJsDatabase<Record<string, never>>;

export async function listPendingMembers(db: Db, actor: Actor): Promise<Member[]> {
  if (!actor.effectiveRoles.includes("federal_board")) {
    throw new ForbiddenError("Nur der Bundesvorstand darf diese Liste sehen.");
  }
  const rows = await db
    .select()
    .from(members)
    .where(eq(members.status, "pending"))
    .orderBy(asc(members.createdAt));
  return rows.map(row2member);
}
