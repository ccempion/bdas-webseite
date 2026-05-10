/**
 * Status transitions. Phase 1 only the federal_board can transition members;
 * local_board approval comes in a later sprint.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ConflictError, ForbiddenError, NotFoundError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { StatusChanged } from "../events.js";
import { canTransition } from "../roles.js";
import { members } from "../schema.js";
import type { Member, MemberStatus } from "../types.js";

import { row2member } from "./get.js";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type Actor = {
  readonly userId: string;
  readonly effectiveRoles: ReadonlyArray<string>;
};

function requireBoard(actor: Actor): void {
  if (!actor.effectiveRoles.includes("federal_board")) {
    throw new ForbiddenError("Nur der Bundesvorstand darf diese Aktion ausführen.");
  }
}

export async function transitionStatus(
  db: Db,
  memberId: string,
  to: MemberStatus,
  actor: Actor,
): Promise<Member> {
  requireBoard(actor);

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(members).where(eq(members.id, memberId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mitglied nicht gefunden.");
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

/** Convenience for the most common Sprint 3 transition. */
export async function approveMember(db: Db, memberId: string, actor: Actor): Promise<Member> {
  return transitionStatus(db, memberId, "active", actor);
}
