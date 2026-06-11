/**
 * Role grant / revoke (ADR 0007, amended by ADR 0013). Writes scoped rows to
 * `member_role_grants`. Federal board may grant any role; a `local_board_lead`
 * may grant/revoke `local_board` within its own group only (see requireCanGrant).
 * `local_board` and `local_board_lead` are group-scoped; `federal_board` is unscoped.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { Role } from "@bdas/auth";
import { ForbiddenError, NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { RoleGranted, RoleRevoked } from "../events";
import { canGrantLocalBoard, isFederalBoard, isRole } from "../roles";
import { members, memberRoleGrants } from "../schema";
import type { Member } from "../types";

import { row2member } from "./get";
import type { Actor } from "./status";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Who may grant/revoke (ADR 0013, supersedes the federal-only rule):
 *  - `local_board`              → federal_board OR a local_board_lead of that group
 *  - everything else            → federal_board only
 *    (appointing leads and federal_board stays central; member/alumnus are
 *     edge grants the federation owns).
 * `role` must already be validated to a known Role and `groupId` to its scope.
 */
function requireCanGrant(actor: Actor, role: Role, groupId: string | null): void {
  if (role === "local_board") {
    if (canGrantLocalBoard(actor.grants, groupId)) return;
    throw new ForbiddenError(
      "Nur der Bundesvorstand oder ein Vorstands-Lead dieser Gruppe darf local_board vergeben.",
    );
  }
  if (!isFederalBoard(actor.grants)) {
    throw new ForbiddenError("Nur der Bundesvorstand darf diese Rolle vergeben.");
  }
}

function requireValidRole(role: string): asserts role is Role {
  if (!isRole(role)) {
    throw new ValidationError(`Unbekannte Rolle '${role}'.`);
  }
}

/** local_board and local_board_lead are group-scoped; federal_board is unscoped. */
function requireValidScope(role: Role, groupId: string | null): void {
  if ((role === "local_board" || role === "local_board_lead") && groupId === null) {
    throw new ValidationError(`${role} erfordert eine Gruppe.`);
  }
  if (role === "federal_board" && groupId !== null) {
    throw new ValidationError("federal_board ist nicht gruppengebunden.");
  }
}

export async function grantRole(
  db: Db,
  memberId: string,
  role: string,
  actor: Actor,
  groupId: string | null = null,
): Promise<Member> {
  requireValidRole(role);
  requireValidScope(role, groupId);
  requireCanGrant(actor, role, groupId);

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(members).where(eq(members.id, memberId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mitglied nicht gefunden.");
    const member = row2member(row);

    const existing = await tx
      .select({ id: memberRoleGrants.id })
      .from(memberRoleGrants)
      .where(
        and(
          eq(memberRoleGrants.memberId, memberId),
          eq(memberRoleGrants.role, role),
          isNull(memberRoleGrants.revokedAt),
          groupId === null
            ? isNull(memberRoleGrants.groupId)
            : eq(memberRoleGrants.groupId, groupId),
        ),
      )
      .limit(1);
    if (existing[0]) return member; // idempotent

    await tx.insert(memberRoleGrants).values({
      id: createId("mrg"),
      memberId,
      role,
      groupId,
      grantedBy: actor.userId,
    });

    const event: RoleGranted = {
      type: "members.role.granted",
      memberId,
      role,
      groupId,
      actorUserId: actor.userId,
      at: new Date(),
    };
    await getEventBus().publish(event);

    return member;
  });
}

export async function revokeRole(
  db: Db,
  memberId: string,
  role: string,
  actor: Actor,
  groupId: string | null = null,
): Promise<Member> {
  requireValidRole(role);
  requireValidScope(role, groupId);
  requireCanGrant(actor, role, groupId);

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(members).where(eq(members.id, memberId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mitglied nicht gefunden.");
    const member = row2member(row);

    const updated = await tx
      .update(memberRoleGrants)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(memberRoleGrants.memberId, memberId),
          eq(memberRoleGrants.role, role),
          isNull(memberRoleGrants.revokedAt),
          groupId === null
            ? isNull(memberRoleGrants.groupId)
            : eq(memberRoleGrants.groupId, groupId),
        ),
      )
      .returning({ id: memberRoleGrants.id });
    if (updated.length === 0) return member; // idempotent

    const event: RoleRevoked = {
      type: "members.role.revoked",
      memberId,
      role,
      groupId,
      actorUserId: actor.userId,
      at: new Date(),
    };
    await getEventBus().publish(event);

    return member;
  });
}
