import type { Grant } from "@bdas/members";
import type { GroupSummary } from "@bdas/groups";

/** A view the sidebar can switch into. Federal is the federation-wide cockpit;
 *  a group scope is one Hochschulgruppe. */
export type Scope =
  | { readonly kind: "federal" }
  | { readonly kind: "group"; readonly groupId: string; readonly slug: string; readonly name: string };

/**
 * The scopes a user may switch between, derived from their grants (ADR 0007 /
 * 0013). Federal board is a superset: it yields the federal scope AND every
 * active group. `local_board` and `local_board_lead` each yield their own
 * group. Order: federal first, then groups in the order `groups` is given
 * (callers pass them city-then-name sorted). De-duplicated by group id.
 */
export function boardScopes(
  grants: ReadonlyArray<Grant>,
  groups: ReadonlyArray<GroupSummary>,
): Scope[] {
  const isFederal = grants.some((g) => g.role === "federal_board");
  const out: Scope[] = [];
  if (isFederal) out.push({ kind: "federal" });

  const wanted = new Set<string>();
  if (isFederal) {
    for (const g of groups) if (g.status === "active") wanted.add(g.id);
  } else {
    for (const grant of grants) {
      if ((grant.role === "local_board" || grant.role === "local_board_lead") && grant.groupId) {
        wanted.add(grant.groupId);
      }
    }
  }

  for (const g of groups) {
    if (wanted.has(g.id)) {
      out.push({ kind: "group", groupId: g.id, slug: g.slug, name: g.name });
    }
  }
  return out;
}
