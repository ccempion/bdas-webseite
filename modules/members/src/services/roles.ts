/**
 * Role grant / revoke. Federal_board only in Phase 1.
 */
import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { Role } from "@bdas/auth";
import { ForbiddenError, NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { RoleGranted, RoleRevoked } from "../events";
import { isRole } from "../roles";
import { members } from "../schema";
import type { Member } from "../types";

import { row2member } from "./get";
import type { Actor } from "./status";

export type Db = PostgresJsDatabase<Record<string, never>>;

function requireBoard(actor: Actor): void {
  if (!actor.effectiveRoles.includes("federal_board")) {
    throw new ForbiddenError("Nur der Bundesvorstand darf Rollen vergeben.");
  }
}

function requireValidRole(role: string): asserts role is Role {
  if (!isRole(role)) {
    throw new ValidationError(`Unbekannte Rolle '${role}'.`);
  }
}

export async function grantRole(
  db: Db,
  memberId: string,
  role: string,
  actor: Actor,
): Promise<Member> {
  requireBoard(actor);
  requireValidRole(role);

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(members).where(eq(members.id, memberId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mitglied nicht gefunden.");
    if (row.roles.includes(role)) return row2member(row);

    const [updated] = await tx
      .update(members)
      .set({
        roles: sql`array_append(${members.roles}, ${role})`,
        updatedAt: new Date(),
      })
      .where(eq(members.id, memberId))
      .returning();
    if (!updated) throw new Error("grantRole: update returned no row");

    const event: RoleGranted = {
      type: "members.role.granted",
      memberId,
      role,
      actorUserId: actor.userId,
      at: new Date(),
    };
    await getEventBus().publish(event);

    return row2member(updated);
  });
}

export async function revokeRole(
  db: Db,
  memberId: string,
  role: string,
  actor: Actor,
): Promise<Member> {
  requireBoard(actor);
  requireValidRole(role);

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(members).where(eq(members.id, memberId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mitglied nicht gefunden.");
    if (!row.roles.includes(role)) return row2member(row);

    const [updated] = await tx
      .update(members)
      .set({
        roles: sql`array_remove(${members.roles}, ${role})`,
        updatedAt: new Date(),
      })
      .where(eq(members.id, memberId))
      .returning();
    if (!updated) throw new Error("revokeRole: update returned no row");

    const event: RoleRevoked = {
      type: "members.role.revoked",
      memberId,
      role,
      actorUserId: actor.userId,
      at: new Date(),
    };
    await getEventBus().publish(event);

    return row2member(updated);
  });
}
