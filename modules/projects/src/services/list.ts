import { and, desc, eq, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { groupRefMap } from "../group-ref";
import { projects } from "../schema";
import type { ProjectStatus, ProjectSummary } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type ListOpts = {
  /** Restrict to one owning group. */
  readonly groupId?: string | undefined;
  /** Restrict to one topic (exact match). */
  readonly topic?: string | undefined;
};

/**
 * Cross-group project browse (spec §12), newest first. Filterable by owning
 * group and topic. Each row is enriched with its group's name/slug via the
 * groups public interface (one batched query). Open to any authenticated
 * member — no group restriction.
 */
export async function listProjects(db: Db, opts: ListOpts = {}): Promise<ProjectSummary[]> {
  const conds: SQL[] = [];
  if (opts.groupId !== undefined) conds.push(eq(projects.groupId, opts.groupId));
  if (opts.topic !== undefined) conds.push(eq(projects.topic, opts.topic));

  const rows = await db
    .select({
      id: projects.id,
      groupId: projects.groupId,
      title: projects.title,
      status: projects.status,
      topic: projects.topic,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(projects.createdAt));

  const refs = await groupRefMap(db);

  return rows.map((r) => {
    const ref = refs.get(r.groupId);
    return {
      id: r.id,
      groupId: r.groupId,
      groupName: ref?.name ?? "",
      groupSlug: ref?.slug ?? "",
      title: r.title,
      status: r.status as ProjectStatus,
      topic: r.topic,
      createdAt: r.createdAt,
    };
  });
}
