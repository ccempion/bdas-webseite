/**
 * Role grant / revoke (ADR 0007, amended by ADR 0013, extended by ADR 0026,
 * by the local role redesign, and by ADR 0043). Writes scoped rows to
 * `member_role_grants`. Federal board may grant any role; a Lead
 * (`local_board_lead`) may grant/revoke the group's delegate roles —
 * `event_organizer`, `page_editor`, `file_manager`, `blogger` — and mark
 * `alumnus` within its own group only (see requireCanGrant).
 * `local_board_lead` and all four delegate roles are group-scoped;
 * `federal_board` is unscoped.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { Role } from "@bdas/auth";
import { ForbiddenError, NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { getGroupKind } from "@bdas/groups";
import { createId } from "@bdas/id";

import type { RoleGranted, RoleRevoked } from "../events";
import { canGrantLocalRoles, isFederalBoard, isRole } from "../roles";
import { members, memberRoleGrants } from "../schema";
import type { Member } from "../types";

import { row2member } from "./get";
import type { Actor } from "./status";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Who may grant/revoke (ADR 0013, extended by ADR 0026, the local role
 * redesign, and ADR 0043):
 *  - `event_organizer`, `page_editor`, `file_manager`, `blogger` → federal_board OR the group's Lead
 *  - `alumnus`                                                   → federal_board OR the group's Lead
 *    (eine Kennzeichnung, keine Befugnis: der Lead kennt seine Ehemaligen,
 *     der Bundesvorstand vergibt sie ungescoped über `acceptWithoutGroup`)
 *  - everything else                                            → federal_board only
 *    (appointing leads and federal_board stays central).
 * `role` must already be validated to a known Role and `groupId` to its scope.
 */
function requireCanGrant(actor: Actor, role: Role, groupId: string | null): void {
  if (
    role === "event_organizer" ||
    role === "page_editor" ||
    role === "file_manager" ||
    role === "blogger" ||
    role === "alumnus"
  ) {
    if (canGrantLocalRoles(actor.grants, groupId)) return;
    throw new ForbiddenError(
      "Nur der Bundesvorstand oder der Lead dieser Gruppe darf diese Rolle vergeben.",
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

/**
 * `local_board_lead`, `event_organizer`, `page_editor`, `file_manager`, and
 * `blogger` are group-scoped; `federal_board` is unscoped.
 */
function requireValidScope(role: Role, groupId: string | null): void {
  if (
    (role === "local_board_lead" ||
      role === "event_organizer" ||
      role === "page_editor" ||
      role === "file_manager" ||
      role === "blogger") &&
    groupId === null
  ) {
    throw new ValidationError(`${role} erfordert eine Gruppe.`);
  }
  if (role === "federal_board" && groupId !== null) {
    throw new ValidationError("federal_board ist nicht gruppengebunden.");
  }
}

/**
 * Ein lokaler Vorstand sitzt ausschließlich auf einer Hochschulgruppe
 * (Spec 2026-09-12 §3.3). Jede andere Art eskaliert ihre
 * Beitrittsentscheidungen laut ADR 0021 an den Bundesvorstand — das hängt
 * daran, dass dort kein aktiver Lead existiert. Ein versehentlich vergebener
 * Lead würde diese Freigabe unterlaufen, deshalb wird der Zustand erzwungen
 * statt gehofft. Eine unbekannte Gruppe fällt ebenfalls durch.
 *
 * Die Lesung läuft außerhalb der Transaktion: die Art einer Gruppe ist
 * faktisch unveränderlich, und `getGroupKind` nimmt eine Db, keine Tx.
 * `revokeRole` prüft bewusst NICHT — einen Grant, den es nicht geben sollte,
 * muss man immer entziehen können.
 */
async function requireBoardableGroup(db: Db, role: Role, groupId: string | null): Promise<void> {
  if (role !== "local_board_lead" || groupId === null) return;
  if ((await getGroupKind(db, groupId)) !== "hochschulgruppe") {
    throw new ValidationError("Nur eine Hochschulgruppe kann einen lokalen Vorstand haben.");
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
  await requireBoardableGroup(db, role, groupId);

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(members).where(eq(members.id, memberId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mitglied nicht gefunden.");
    const member = row2member(row);
    // Wer nie aufgenommen wurde, ist kein Alumnus (ADR 0043: „wer abgelehnt
    // wurde, war nie dabei"). Ohne diese Prüfung verschwände eine markierte
    // Bewerbung aus „Ohne Gruppe", ohne je Zugang bekommen zu haben.
    if (role === "alumnus" && member.status !== "active") {
      throw new ValidationError("Nur aufgenommene Mitglieder können als Alumnus markiert werden.");
    }
    // Ein Lead markiert nur Mitglieder der eigenen Gruppe (ADR 0043 §3): sonst
    // erschiene die Markierung in einer fremden Mitgliederliste, deren Lead sie
    // nicht entfernen darf.
    if (
      role === "alumnus" &&
      groupId !== null &&
      !isFederalBoard(actor.grants) &&
      member.primaryGroupId !== groupId
    ) {
      throw new ForbiddenError(
        "Ein Lead kann nur Mitglieder der eigenen Gruppe als Alumnus markieren.",
      );
    }

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
      .set({ revokedAt: sql`now()`, revokedBy: actor.userId })
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
