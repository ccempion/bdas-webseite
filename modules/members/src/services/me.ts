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
import { getGroupKind } from "@bdas/groups";

import { effectiveGrants, isFederalBoard } from "../roles";
import type { Grant, Member } from "../types";

import { getGrants, getMemberByUserId } from "./get";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type CurrentMember = {
  readonly user: CurrentUser;
  readonly member: Member | null;
  readonly grants: ReadonlyArray<Grant>;
  /**
   * Hat dieser Account einen Hochschulgruppen-Scope? Abgeleitet aus der Art
   * der primären Gruppe (Spec 2026-09-12 §3.2) — die EINZIGE Stelle, an der
   * die Frage beantwortet wird. Ohne Gruppe: false. Das ändert nichts am
   * heutigen Verhalten: `canManageGroup` lässt für groupId null ohnehin nur
   * den Bundesvorstand durch.
   */
  readonly hasGroupScope: boolean;
};

export async function getCurrentMember(
  db: Db,
  cookieValue: string | undefined,
): Promise<CurrentMember | null> {
  const user = await getCurrentUser(db, cookieValue);
  if (!user) return null;

  const member = await getMemberByUserId(db, user.id);
  const [dbGrants, hasGroupScope] = await Promise.all([
    member ? getGrants(db, member.id) : [],
    resolveHasGroupScope(db, member),
  ]);
  return {
    user,
    member,
    grants: effectiveGrants(user.roles, member, dbGrants),
    hasGroupScope,
  };
}

/**
 * `hasGroupScope` aus der Art der primären Gruppe. Liest nur, wenn das
 * Mitglied überhaupt eine Gruppe hat — für ein gruppenloses Mitglied entsteht
 * keine zusätzliche Abfrage. Nicht über index.ts exportiert; eigene Funktion,
 * damit die Ableitung ohne Sitzung gegen echtes Postgres testbar ist.
 */
export async function resolveHasGroupScope(db: Db, member: Member | null): Promise<boolean> {
  if (!member?.primaryGroupId) return false;
  return (await getGroupKind(db, member.primaryGroupId)) === "hochschulgruppe";
}

export function requireFederalBoard(me: CurrentMember | null): asserts me is CurrentMember {
  if (!me) throw new ForbiddenError("Anmeldung erforderlich.");
  if (!isFederalBoard(me.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand darf diese Seite sehen.");
  }
}
