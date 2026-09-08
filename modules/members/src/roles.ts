import type { Role } from "@bdas/auth";

import type { Grant, Member, MemberStatus } from "./types";

const ALL_ROLES: ReadonlyArray<Role> = [
  "member",
  "local_board_lead",
  "federal_board",
  "alumnus",
  "event_organizer",
  "page_editor",
  "file_manager",
  "blogger",
];

export function isRole(value: string): value is Role {
  return (ALL_ROLES as ReadonlyArray<string>).includes(value);
}

/**
 * Effective grants a request acts with (ADR 0007):
 *   - JWT roles (env allowlist at login per ADR 0002) → unscoped grants,
 *   - active rows from `member_role_grants` → their stored scope,
 *   - status-implied: active → member, alumnus → alumnus (unscoped).
 * Deduplicated on (role, groupId).
 */
export function effectiveGrants(
  jwtRoles: ReadonlyArray<Role>,
  member: Member | null,
  dbGrants: ReadonlyArray<Grant>,
): ReadonlyArray<Grant> {
  const out: Grant[] = [];
  const seen = new Set<string>();
  const add = (role: Role, groupId: string | null): void => {
    const key = `${role}:${groupId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ role, groupId });
  };

  for (const r of jwtRoles) add(r, null);
  for (const g of dbGrants) add(g.role, g.groupId);
  if (member) {
    if (member.status === "active") add("member", null);
    if (member.status === "alumnus") add("alumnus", null);
  }
  return out;
}

/** Federal board is always unscoped and authorises every group. */
export function isFederalBoard(grants: ReadonlyArray<Grant>): boolean {
  return grants.some((g) => g.role === "federal_board");
}

/**
 * May the actor manage this group? Federal board → any group. A group's Lead
 * (`local_board_lead`) → only the group its grant is scoped to — the local
 * role redesign folded the old plain `local_board` role into Lead, so Lead is
 * now the sole local "manages this group" authority. A null groupId is
 * manageable only by federal board (a member with no primary group).
 */
export function canManageGroup(grants: ReadonlyArray<Grant>, groupId: string | null): boolean {
  if (isFederalBoard(grants)) return true;
  if (groupId === null) return false;
  return grants.some((g) => g.role === "local_board_lead" && g.groupId === groupId);
}

/**
 * May the actor grant/revoke the group's local delegate roles (`event_organizer`,
 * `page_editor`, `file_manager`, `blogger`)? Federal board → any group. A Lead
 * → only its own group. Identical authority to `canManageGroup` — kept as a
 * separate name because the two questions ("can run this group" vs. "can hand
 * out its delegate roles") are conceptually distinct even though every Lead
 * today answers yes to both.
 */
export function canGrantLocalRoles(grants: ReadonlyArray<Grant>, groupId: string | null): boolean {
  return canManageGroup(grants, groupId);
}

/**
 * May the actor edit the group's public content page (ADR 0026)? Federal board
 * → any group. A `local_board_lead` or `page_editor` → only the group its
 * grant is scoped to.
 */
export function canEditGroupPage(grants: ReadonlyArray<Grant>, groupId: string): boolean {
  if (isFederalBoard(grants)) return true;
  return grants.some(
    (g) => (g.role === "local_board_lead" || g.role === "page_editor") && g.groupId === groupId,
  );
}

/**
 * May the actor decide a *pending* member's join for a local group (ADR 0021)?
 * A join decision — accept (→ active) or reject (→ inactive) — belongs to the
 * group's Lead. Federal board is NOT a blanket authority here; it may act only
 * as an emergency fallback when the group has zero active Lead seats. A
 * pending member with no group (groupId null) has no local Lead to speak for
 * it and is routed through `canManageGroup` (federal-only) by the caller
 * instead.
 */
export function canDecideJoinRequest(
  grants: ReadonlyArray<Grant>,
  groupId: string,
  groupHasLocalBoard: boolean,
): boolean {
  const isLead = grants.some((g) => g.role === "local_board_lead" && g.groupId === groupId);
  if (isLead) return true;
  if (!groupHasLocalBoard) return isFederalBoard(grants);
  return false;
}

const TRANSITIONS: Record<MemberStatus, ReadonlySet<MemberStatus>> = {
  pending: new Set(["active", "inactive"]),
  active: new Set(["inactive", "alumnus"]),
  inactive: new Set(["active"]),
  alumnus: new Set(["active"]),
};

export function canTransition(from: MemberStatus, to: MemberStatus): boolean {
  return TRANSITIONS[from].has(to);
}
