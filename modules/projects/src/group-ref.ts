/**
 * Group name/slug resolution through @bdas/groups' public interface.
 *
 * Private to the module (not re-exported from index.ts). This is the only place
 * projects touches groups, and it does so via the typed service — never the
 * `groups` table directly (CLAUDE.md §1 rule 1).
 */
import { getGroup, listGroups } from "@bdas/groups";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { NotFoundError } from "@bdas/errors";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type GroupRef = { readonly name: string; readonly slug: string };

/**
 * Resolve one group, asserting it exists. Used to enrich a single project and
 * to guard create/adopt against a non-existent owning/target group.
 */
export async function resolveGroupRef(db: Db, groupId: string): Promise<GroupRef> {
  const group = await getGroup(db, groupId);
  if (!group) {
    throw new NotFoundError("Gruppe nicht gefunden.");
  }
  return { name: group.name, slug: group.slug };
}

/** Batched id → {name, slug} map for list enrichment (one groups query). */
export async function groupRefMap(db: Db): Promise<Map<string, GroupRef>> {
  const groups = await listGroups(db);
  return new Map(groups.map((g) => [g.id, { name: g.name, slug: g.slug }]));
}
