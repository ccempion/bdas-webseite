/**
 * Composite read-side: take a session-cookie value, return:
 *   - the auth user (or null if anonymous),
 *   - their member profile (null until they fill it out),
 *   - effective roles = JWT roles ∪ member.roles ∪ status-implied.
 *
 * Pages and Server Actions use this instead of stitching auth+members
 * themselves.
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getCurrentUser, type CurrentUser, type Role } from "@bdas/auth";
import { ForbiddenError } from "@bdas/errors";

import { effectiveRoles as computeEffectiveRoles } from "../roles";
import type { Member } from "../types";

import { getMemberByUserId } from "./get";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type CurrentMember = {
  readonly user: CurrentUser;
  readonly member: Member | null;
  readonly effectiveRoles: ReadonlyArray<Role>;
};

export async function getCurrentMember(
  db: Db,
  cookieValue: string | undefined,
): Promise<CurrentMember | null> {
  const user = await getCurrentUser(db, cookieValue);
  if (!user) return null;

  const member = await getMemberByUserId(db, user.id);
  return {
    user,
    member,
    effectiveRoles: computeEffectiveRoles(user.roles, member),
  };
}

export function requireFederalBoard(me: CurrentMember | null): asserts me is CurrentMember {
  if (!me) throw new ForbiddenError("Anmeldung erforderlich.");
  if (!me.effectiveRoles.includes("federal_board")) {
    throw new ForbiddenError("Nur der Bundesvorstand darf diese Seite sehen.");
  }
}
