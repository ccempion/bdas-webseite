/**
 * Composite read-side: take a session-cookie value, return:
 *   - the auth user (or null if anonymous),
 *   - their member profile (null until they fill it out),
 *   - effective grants = JWT roles (unscoped) ∪ active member_role_grants ∪
 *     membership-implied (ADR 0007, ADR 0045).
 *
 * Pages and Server Actions use this instead of stitching auth+members
 * themselves.
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { getCurrentUser, type CurrentUser } from "@bdas/auth";
import { ForbiddenError } from "@bdas/errors";
import { getGroupKind, type GroupKind } from "@bdas/groups";

import { effectiveGrants, isFederalBoard } from "../roles";
import type { Grant, Member } from "../types";

import { getGrants, getMemberByUserId } from "./get";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type CurrentMember = {
  readonly user: CurrentUser;
  readonly member: Member | null;
  readonly grants: ReadonlyArray<Grant>;
  /** Art der primären Gruppe, null ohne Gruppe. Einmal gelesen, Grundlage
   *  beider Flags darunter. */
  readonly primaryGroupKind: GroupKind | null;
  /**
   * Hat dieser Account einen Hochschulgruppen-Scope? Abgeleitet aus der Art
   * der primären Gruppe (Spec 2026-09-12 §3.2) — die EINZIGE Stelle, an der
   * die Frage beantwortet wird. Ohne Gruppe: false. Das ändert nichts am
   * heutigen Verhalten: `canManageGroup` lässt für groupId null ohnehin nur
   * den Bundesvorstand durch.
   */
  readonly hasGroupScope: boolean;
  /**
   * Ist dieser Account BDAS-Mitglied? Aufgenommen UND (Hochschulgruppe ODER
   * Alumnus-Markierung) — Spec 2026-09-16 §3.1. Die EINZIGE Stelle, an der die
   * Frage beantwortet wird. Förderer und Partnerorganisationen sind es nicht.
   */
  readonly isBdasMember: boolean;
};

/** Reine Ableitung, damit sie ohne Sitzung testbar ist. */
export function isBdasMemberFrom(
  member: Member | null,
  kind: GroupKind | null,
  grants: ReadonlyArray<Grant>,
): boolean {
  if (member?.status !== "active") return false;
  if (kind === "hochschulgruppe") return true;
  return grants.some((g) => g.role === "alumnus");
}

export async function getCurrentMember(
  db: Db,
  cookieValue: string | undefined,
): Promise<CurrentMember | null> {
  const user = await getCurrentUser(db, cookieValue);
  if (!user) return null;

  const member = await getMemberByUserId(db, user.id);
  const m = await resolveMembership(db, member);
  return {
    user,
    member,
    grants: effectiveGrants(user.roles, m.dbGrants, m.isBdasMember),
    primaryGroupKind: m.primaryGroupKind,
    hasGroupScope: m.primaryGroupKind === "hochschulgruppe",
    isBdasMember: m.isBdasMember,
  };
}

/**
 * Der sitzungsfreie Teil von `getCurrentMember`: gespeicherte Grants, Art der
 * primären Gruppe und die Mitgliedschaft daraus. Liest die Art nur, wenn es
 * eine Gruppe gibt. Nicht über index.ts exportiert; eigene Funktion, damit die
 * Ableitung gegen echtes Postgres testbar ist.
 */
export async function resolveMembership(
  db: Db,
  member: Member | null,
): Promise<{
  readonly dbGrants: ReadonlyArray<Grant>;
  readonly primaryGroupKind: GroupKind | null;
  readonly isBdasMember: boolean;
}> {
  const [dbGrants, primaryGroupKind] = await Promise.all([
    member ? getGrants(db, member.id) : [],
    member?.primaryGroupId ? getGroupKind(db, member.primaryGroupId) : null,
  ]);
  return {
    dbGrants,
    primaryGroupKind,
    isBdasMember: isBdasMemberFrom(member, primaryGroupKind, dbGrants),
  };
}

export function requireFederalBoard(me: CurrentMember | null): asserts me is CurrentMember {
  if (!me) throw new ForbiddenError("Anmeldung erforderlich.");
  if (!isFederalBoard(me.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand darf diese Seite sehen.");
  }
}
