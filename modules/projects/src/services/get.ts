import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { resolveGroupRef } from "../group-ref";
import { projects } from "../schema";
import type { Project } from "../types";

import { rowToProject } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Fetch one project, enriched with its owning group's name/slug. Open to any
 * authenticated member (cross-group discovery); the caller gates on auth, not
 * on group membership.
 */
export async function getProject(db: Db, id: string): Promise<Project | null> {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!rows[0]) return null;
  const group = await resolveGroupRef(db, rows[0].groupId);
  return rowToProject(rows[0], group);
}
