/**
 * Composite read-side: take a session-cookie value, return:
 *   - the auth user (or null if anonymous),
 *   - their member profile (null until they fill it out),
 *   - effective grants = JWT roles (unscoped) ∪ active member_role_grants ∪
 *     status-implied (ADR 0007).
 *
 * Pages and Server Actions use this instead of stitching auth+members
 * themselves.
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getCurrentUser, type CurrentUser } from "@bdas/auth";
import { ForbiddenError } from "@bdas/errors";

import { effectiveGrants, isFederalBoard } from "../roles";
import type { Grant, Member } from "../types";

import { getGrants, getMemberByUserId } from "./get";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type CurrentMember = {
  readonly user: CurrentUser;
  readonly member: Member | null;
  readonly grants: ReadonlyArray<Grant>;
};

export async function getCurrentMember(
  db: Db,
  cookieValue: string | undefined,
): Promise<CurrentMember | null> {
  const user = await getCurrentUser(db, cookieValue);
  if (!user) return null;

  const member = await getMemberByUserId(db, user.id);
  const dbGrants = member ? await getGrants(db, member.id) : [];
  return {
    user,
    member,
    grants: effectiveGrants(user.roles, member, dbGrants),
  };
}

export function requireFederalBoard(me: CurrentMember | null): asserts me is CurrentMember {
  if (!me) throw new ForbiddenError("Anmeldung erforderlich.");
  if (!isFederalBoard(me.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand darf diese Seite sehen.");
  }
}
