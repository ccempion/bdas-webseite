/**
 * Status transitions. The actor must manage the member's group (ADR 0007):
 * federal_board for any member, local_board only for members of its own
 * group. The group is known only after the row is read, so the authorization
 * check lives inside the transaction.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ConflictError, ForbiddenError, NotFoundError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { StatusChanged } from "../events";
import { canManageGroup, canTransition } from "../roles";
import { members } from "../schema";
import type { Grant, Member, MemberStatus } from "../types";

import { row2member } from "./get";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type Actor = {
  readonly userId: string;
  readonly grants: ReadonlyArray<Grant>;
};

export async function transitionStatus(
  db: Db,
  memberId: string,
  to: MemberStatus,
  actor: Actor,
): Promise<Member> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(members).where(eq(members.id, memberId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mitglied nicht gefunden.");

    if (!canManageGroup(actor.grants, row.primaryGroupId)) {
      throw new ForbiddenError("Du darfst dieses Mitglied nicht verwalten.");
    }

    const from = row.status as MemberStatus;
    if (from === to) return row2member(row);
    if (!canTransition(from, to)) {
      throw new ConflictError(`Übergang ${from} → ${to} nicht erlaubt.`);
    }

    const set: Partial<typeof members.$inferInsert> & { updatedAt: Date; status: MemberStatus } = {
      status: to,
      updatedAt: new Date(),
    };
    if (to === "active" && row.joinedAt === null) {
      set.joinedAt = new Date();
    }

    const [updated] = await tx.update(members).set(set).where(eq(members.id, memberId)).returning();
    if (!updated) throw new Error("transitionStatus: update returned no row");

    const event: StatusChanged = {
      type: "members.status.changed",
      memberId,
      from,
      to,
      actorUserId: actor.userId,
      at: new Date(),
    };
    await getEventBus().publish(event);

    return row2member(updated);
  });
}

/** Convenience for the most common transition (pending → active). */
export async function approveMember(db: Db, memberId: string, actor: Actor): Promise<Member> {
  return transitionStatus(db, memberId, "active", actor);
}
