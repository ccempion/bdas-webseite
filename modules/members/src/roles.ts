import type { Role } from "@bdas/auth";

import type { Member, MemberStatus } from "./types";

const ALL_ROLES: ReadonlyArray<Role> = ["member", "local_board", "federal_board", "alumnus"];

export function isRole(value: string): value is Role {
  return (ALL_ROLES as ReadonlyArray<string>).includes(value);
}

/**
 * Effective roles a request acts with:
 *   - JWT roles (from `core/feature-flags` env allowlist at login),
 *   - explicitly-granted DB roles on the member row,
 *   - status-implied roles (active → member; alumnus → alumnus).
 */
export function effectiveRoles(
  jwtRoles: ReadonlyArray<Role>,
  member: Member | null,
): ReadonlyArray<Role> {
  const out = new Set<Role>(jwtRoles);
  if (member) {
    for (const r of member.roles) out.add(r);
    if (member.status === "active") out.add("member");
    if (member.status === "alumnus") out.add("alumnus");
  }
  return [...out];
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
