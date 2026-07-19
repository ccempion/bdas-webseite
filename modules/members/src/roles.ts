import type { Role } from "@bdas/auth";

import type { Grant, Member, MemberStatus } from "./types";

const ALL_ROLES: ReadonlyArray<Role> = [
  "member",
  "local_board",
  "local_board_lead",
  "federal_board",
  "alumnus",
  "event_organizer",
  "page_editor",
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
 * May the actor manage this group? Federal board → any group. A `local_board`
 * or `local_board_lead` → only the group its grant is scoped to (a lead is the
 * group's highest-trust role and manages it too, per ADR 0013). A null groupId
 * is manageable only by federal board (a member with no primary group).
 */
export function canManageGroup(grants: ReadonlyArray<Grant>, groupId: string | null): boolean {
  if (isFederalBoard(grants)) return true;
  if (groupId === null) return false;
  return grants.some(
    (g) => (g.role === "local_board" || g.role === "local_board_lead") && g.groupId === groupId,
  );
}

/**
 * May the actor grant/revoke `local_board` for this group (ADR 0013)? Federal
 * board → any group. A `local_board_lead` → only the group its lead grant is
 * scoped to. A null groupId is never delegable — only federal (handled above).
 * Note: a plain `local_board` grant does NOT confer this; only a lead does.
 */
export function canGrantLocalBoard(grants: ReadonlyArray<Grant>, groupId: string | null): boolean {
  if (isFederalBoard(grants)) return true;
  if (groupId === null) return false;
  return grants.some((g) => g.role === "local_board_lead" && g.groupId === groupId);
}

/**
 * May the actor edit the group's public content page (ADR 0025)? Federal board
 * → any group. A `local_board_lead` or `page_editor` → only the group its
 * grant is scoped to. Plain `local_board` does NOT edit — the lead delegates
 * explicitly via `page_editor`.
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
 * group's own board: a `local_board` or `local_board_lead` scoped to that group.
 * Federal board is NOT a blanket authority here; it may act only as an emergency
 * fallback when the group has zero active local-board seats. A pending member
 * with no group (groupId null) has no local board to speak for it and is routed
 * through `canManageGroup` (federal-only) by the caller instead.
 */
export function canDecideJoinRequest(
  grants: ReadonlyArray<Grant>,
  groupId: string,
  groupHasLocalBoard: boolean,
): boolean {
  const isLocalBoard = grants.some(
    (g) => (g.role === "local_board" || g.role === "local_board_lead") && g.groupId === groupId,
  );
  if (isLocalBoard) return true;
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
