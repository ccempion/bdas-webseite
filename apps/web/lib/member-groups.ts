import type { Member } from "@bdas/members";

/**
 * Account id → the name of the group that person belongs to today.
 *
 * The join the newsletter board and its export both need. Deliberately not
 * `Subscription.groupId`, which records where a signup came from (spec §4);
 * and deliberately here rather than in `modules/newsletter`, which must not
 * depend on `modules/members` (CLAUDE.md §1 rule 1). Pure — the caller has
 * already read both lists.
 */
export function groupNamesByUserId(
  members: ReadonlyArray<Member>,
  // Structural on purpose: `listGroups` hands back a `GroupSummary`, and all
  // this join needs is an id and a name.
  groups: ReadonlyArray<{ readonly id: string; readonly name: string }>,
): Map<string, string> {
  const nameById = new Map(groups.map((g) => [g.id, g.name]));
  return new Map(
    members.flatMap((m) => {
      const name = m.primaryGroupId === null ? undefined : nameById.get(m.primaryGroupId);
      return name === undefined ? [] : [[m.userId, name] as const];
    }),
  );
}
