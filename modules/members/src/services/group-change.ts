/**
 * Group transfers (ADR 0022). The ONLY self-service writer of
 * `members.primary_group_id`.
 *
 * Nobody moves themselves: choosing a group — whether an active member's
 * transfer or a pending member's first application — files a request that the
 * DESTINATION group's board decides (ADR 0021's rule, applied to transfers).
 * `primary_group_id` is written only once a board approves. Leaving to no
 * group applies immediately — nobody needs to approve an exit — but is still
 * logged.
 *
 * The module deliberately does not verify that a destination group exists; the
 * foreign key does that. Reading the `groups` table from here would violate
 * CLAUDE.md §1 rule 1.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { Role } from "@bdas/auth";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type {
  GroupChangeDecided,
  GroupChangeRequested,
  GroupChangeWithdrawn,
  RoleRevoked,
  StatusChanged,
} from "../events";
import { canDecideJoinRequest, canManageGroup, canTransition, isFederalBoard } from "../roles";
import {
  memberGroupChangeRequests,
  members,
  memberRoleGrants,
  type MemberGroupChangeRow,
} from "../schema";
import type {
  GroupChangeRequest,
  GroupChangeResult,
  GroupChangeStatus,
  IncomingGroupChange,
  MemberStatus,
  OpenGroupChange,
  RejectionCategory,
  RejectionReason,
} from "../types";

import { row2member } from "./get";
import { groupHasActiveLocalBoard, type Actor, type Db } from "./status";

export function row2request(r: MemberGroupChangeRow): GroupChangeRequest {
  return {
    id: r.id,
    memberId: r.memberId,
    fromGroupId: r.fromGroupId,
    toGroupId: r.toGroupId,
    status: r.status as GroupChangeStatus,
    requestedAt: r.requestedAt,
    decidedAt: r.decidedAt,
    decidedBy: r.decidedBy,
    reasonCategory: r.reasonCategory as RejectionCategory | null,
    reasonMessage: r.reasonMessage,
  };
}

/**
 * Revoke every active grant the member holds *scoped to `groupId`* — the group
 * they are leaving (ADR 0022). Unscoped (federal) grants are untouched. Emits a
 * `members.role.revoked` per grant so notifications behave as if a board had
 * revoked it by hand.
 */
async function revokeGroupScopedGrants(
  tx: Db,
  memberId: string,
  groupId: string,
  actorUserId: string,
): Promise<void> {
  const revoked = await tx
    .update(memberRoleGrants)
    .set({ revokedAt: sql`now()`, revokedBy: actorUserId })
    .where(
      and(
        eq(memberRoleGrants.memberId, memberId),
        eq(memberRoleGrants.groupId, groupId),
        isNull(memberRoleGrants.revokedAt),
      ),
    )
    .returning({ role: memberRoleGrants.role, groupId: memberRoleGrants.groupId });

  for (const g of revoked) {
    const event: RoleRevoked = {
      type: "members.role.revoked",
      memberId,
      role: g.role as Role,
      groupId: g.groupId,
      actorUserId,
      at: new Date(),
    };
    await getEventBus().publish(event);
  }
}

/** Close the member's open request, if any. Returns it, or null when there was none. */
async function withdrawOpen(
  tx: Db,
  memberId: string,
  actorUserId: string,
): Promise<GroupChangeRequest | null> {
  const [row] = await tx
    .update(memberGroupChangeRequests)
    .set({ status: "withdrawn", decidedAt: new Date(), decidedBy: actorUserId })
    .where(
      and(
        eq(memberGroupChangeRequests.memberId, memberId),
        eq(memberGroupChangeRequests.status, "pending"),
      ),
    )
    .returning();
  if (!row) return null;

  const event: GroupChangeWithdrawn = {
    type: "members.group_change.withdrawn",
    requestId: row.id,
    memberId,
    actorUserId,
    at: new Date(),
  };
  await getEventBus().publish(event);
  return row2request(row);
}

/**
 * Self-service group change. `toGroupId` null ⇔ leave the group structure.
 * The actor must be the member themselves; a board moves people by deciding
 * requests, never by writing the column.
 */
export async function changePrimaryGroup(
  db: Db,
  memberId: string,
  toGroupId: string | null,
  actor: Actor,
): Promise<GroupChangeResult> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(members).where(eq(members.id, memberId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mitglied nicht gefunden.");
    if (row.userId !== actor.userId) {
      throw new ForbiddenError("Nur das Mitglied selbst kann seine Gruppe wechseln.");
    }

    const status = row.status as MemberStatus;
    if (status !== "pending" && status !== "active") {
      throw new ForbiddenError("Nur aktive Mitglieder können die Gruppe wechseln.");
    }

    const from = row.primaryGroupId;

    // Re-picking the current group means "never mind" — cancel any open request.
    if (toGroupId === from) {
      await withdrawOpen(tx, memberId, actor.userId);
      return { kind: "applied", member: row2member(row) };
    }

    // Leaving needs no approval, but is logged and drops origin-group powers.
    if (toGroupId === null) {
      await withdrawOpen(tx, memberId, actor.userId);
      const [updated] = await tx
        .update(members)
        .set({ primaryGroupId: null, updatedAt: new Date() })
        .where(eq(members.id, memberId))
        .returning();
      if (!updated) throw new Error("changePrimaryGroup: update returned no row");
      if (from !== null) await revokeGroupScopedGrants(tx, memberId, from, actor.userId);

      const id = createId("mgc");
      const now = new Date();
      await tx.insert(memberGroupChangeRequests).values({
        id,
        memberId,
        fromGroupId: from,
        toGroupId: null,
        status: "approved",
        decidedAt: now,
        decidedBy: actor.userId,
      });
      const event: GroupChangeDecided = {
        type: "members.group_change.decided",
        requestId: id,
        memberId,
        fromGroupId: from,
        toGroupId: null,
        decision: "approved",
        actorUserId: actor.userId,
        at: now,
      };
      await getEventBus().publish(event);

      return { kind: "applied", member: row2member(updated) };
    }

    // Joining another group: the destination board decides. An active
    // member's second pick supersedes the first (the partial unique index
    // allows one open row per member) — but a pending applicant must
    // withdraw explicitly before applying elsewhere: at most one open
    // application in the pool at a time, enforced here by that same index.
    if (status === "active") {
      await withdrawOpen(tx, memberId, actor.userId);
    }
    const id = createId("mgc");
    const [request] = await tx
      .insert(memberGroupChangeRequests)
      .values({ id, memberId, fromGroupId: from, toGroupId })
      .returning();
    if (!request) throw new Error("changePrimaryGroup: insert returned no row");

    const event: GroupChangeRequested = {
      type: "members.group_change.requested",
      requestId: id,
      memberId,
      fromGroupId: from,
      toGroupId,
      at: new Date(),
    };
    await getEventBus().publish(event);

    return { kind: "requested", request: row2request(request) };
  });
}

/** The member cancels their own open request. Idempotent: null when none was open. */
export async function withdrawGroupChange(
  db: Db,
  memberId: string,
  actor: Actor,
): Promise<GroupChangeRequest | null> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(members).where(eq(members.id, memberId)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError("Mitglied nicht gefunden.");
    if (row.userId !== actor.userId) {
      throw new ForbiddenError("Nur das Mitglied selbst kann seinen Antrag zurückziehen.");
    }
    return withdrawOpen(tx, memberId, actor.userId);
  });
}

/**
 * The DESTINATION group's board decides (ADR 0022, applying ADR 0021's rule to
 * transfers): a `local_board`/`local_board_lead` scoped to `to_group_id`, with
 * federal board as the fallback only when that group has no active board seat.
 * The origin group has no veto.
 *
 * Approval moves the member and revokes any grant they still hold in the group
 * they left. Rejection leaves them exactly where they were. A transfer never
 * touches status — an approved transfer does not send anyone back to
 * `pending`. A first-time application (`from_group_id IS NULL`) is different:
 * approval is the applicant's acceptance, so it also flips status to `active`
 * and stamps `joined_at`, emitting `members.status.changed` the same way
 * `approveMember` would, so the acceptance notification still fires.
 */
export async function decideGroupChange(
  db: Db,
  requestId: string,
  decision: "approved" | "rejected",
  actor: Actor,
  reason?: RejectionReason,
): Promise<GroupChangeRequest> {
  if (decision === "rejected") {
    if (!reason) {
      throw new ValidationError("Bitte gib einen Grund für die Ablehnung an.");
    }
    if (reason.category === "other" && !reason.message?.trim()) {
      throw new ValidationError('Bei „Sonstiges" ist eine Nachricht erforderlich.');
    }
  }

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(memberGroupChangeRequests)
      .where(eq(memberGroupChangeRequests.id, requestId))
      .limit(1);
    const req = rows[0];
    if (!req) throw new NotFoundError("Antrag nicht gefunden.");
    if (req.status !== "pending") {
      throw new ConflictError("Über diesen Antrag wurde bereits entschieden.");
    }

    const toGroupId = req.toGroupId;
    // Exits are written already-approved and never reach this path.
    if (toGroupId === null) throw new ConflictError("Austritte werden nicht freigegeben.");

    // Read once, before authorization: guards against deciding a request
    // whose member is no longer pending/active, and — on approval — tells an
    // applicant's first acceptance apart from a transfer. Not read from
    // `fromGroupId` alone: an active member who left their group and
    // reapplies also has `fromGroupId === null` on the rejoin, and that is
    // not an acceptance.
    const memberRows = await tx
      .select({ status: members.status, joinedAt: members.joinedAt })
      .from(members)
      .where(eq(members.id, req.memberId))
      .limit(1);
    const member = memberRows[0];
    if (!member) throw new Error("decideGroupChange: member row missing");
    const memberStatus = member.status as MemberStatus;
    if (memberStatus !== "pending" && memberStatus !== "active") {
      throw new ConflictError("Dieses Mitglied ist nicht mehr aktiv.");
    }

    const hasLocalBoard = await groupHasActiveLocalBoard(tx, toGroupId);
    if (!canDecideJoinRequest(actor.grants, toGroupId, hasLocalBoard)) {
      throw new ForbiddenError("Über den Wechsel entscheidet der Vorstand der Zielgruppe.");
    }

    const now = new Date();
    const [updated] = await tx
      .update(memberGroupChangeRequests)
      .set({
        status: decision,
        decidedAt: now,
        decidedBy: actor.userId,
        reasonCategory: decision === "rejected" ? (reason?.category ?? null) : null,
        reasonMessage: decision === "rejected" ? (reason?.message?.trim() || null) : null,
      })
      .where(
        and(
          eq(memberGroupChangeRequests.id, requestId),
          eq(memberGroupChangeRequests.status, "pending"),
        ),
      )
      .returning();
    if (!updated) throw new ConflictError("Über diesen Antrag wurde bereits entschieden.");

    // Applicant vs. transfer is decided by the member's actual status, not by
    // `from_group_id` alone — an active member who exited also has a null
    // `from_group_id` on a rejoin request, and that is not an acceptance.
    let isFirstAcceptance = false;
    if (decision === "approved") {
      isFirstAcceptance = memberStatus === "pending";
      // The transition table (roles.ts) is the single source of truth for
      // which status moves are legal, even though today only pending→active
      // reaches here — do not hardcode that assumption a second time.
      if (isFirstAcceptance && !canTransition(memberStatus, "active")) {
        throw new ConflictError(`Übergang ${memberStatus} → active nicht erlaubt.`);
      }

      const set: Partial<typeof members.$inferInsert> & {
        primaryGroupId: string;
        updatedAt: Date;
      } = { primaryGroupId: toGroupId, updatedAt: now };
      if (isFirstAcceptance) {
        set.status = "active";
        if (member.joinedAt === null) set.joinedAt = now;
      }
      await tx.update(members).set(set).where(eq(members.id, req.memberId));
      if (req.fromGroupId !== null) {
        await revokeGroupScopedGrants(tx, req.memberId, req.fromGroupId, actor.userId);
      }
    }

    if (isFirstAcceptance) {
      const statusEvent: StatusChanged = {
        type: "members.status.changed",
        memberId: req.memberId,
        from: "pending",
        to: "active",
        actorUserId: actor.userId,
        at: now,
      };
      await getEventBus().publish(statusEvent);
    }

    const event: GroupChangeDecided = {
      type: "members.group_change.decided",
      requestId,
      memberId: req.memberId,
      fromGroupId: req.fromGroupId,
      toGroupId,
      decision,
      actorUserId: actor.userId,
      at: now,
    };
    await getEventBus().publish(event);

    return row2request(updated);
  });
}

/** The member's own open request (used by /account — the member is the caller). */
export async function getOpenGroupChange(
  db: Db,
  memberId: string,
): Promise<GroupChangeRequest | null> {
  const rows = await db
    .select()
    .from(memberGroupChangeRequests)
    .where(
      and(
        eq(memberGroupChangeRequests.memberId, memberId),
        eq(memberGroupChangeRequests.status, "pending"),
      ),
    )
    .limit(1);
  return rows[0] ? row2request(rows[0]) : null;
}

/** The groups a local_board / local_board_lead actor is scoped to. */
function scopedGroupIds(actor: Actor): string[] {
  return actor.grants
    .filter(
      (g): g is { role: "local_board" | "local_board_lead"; groupId: string } =>
        (g.role === "local_board" || g.role === "local_board_lead") && g.groupId !== null,
    )
    .map((g) => g.groupId);
}

/**
 * Open transfer requests the actor can see, each flagged with whether the actor
 * may *decide* it. Federal board sees all. A local board sees requests INTO its
 * group (which it decides) and OUT of its group (which it may only watch — the
 * origin group has no veto, ADR 0022).
 */
export async function listOpenGroupChanges(db: Db, actor: Actor): Promise<OpenGroupChange[]> {
  const federal = isFederalBoard(actor.grants);
  const scoped = scopedGroupIds(actor);
  if (!federal && scoped.length === 0) return [];

  const rows = await db
    .select()
    .from(memberGroupChangeRequests)
    .where(eq(memberGroupChangeRequests.status, "pending"))
    .orderBy(desc(memberGroupChangeRequests.requestedAt));

  const visible = federal
    ? rows
    : rows.filter(
        (r) =>
          (r.toGroupId !== null && scoped.includes(r.toGroupId)) ||
          (r.fromGroupId !== null && scoped.includes(r.fromGroupId)),
      );

  // canDecide needs to know whether each destination group has a board of its
  // own (the federal fallback in ADR 0021). One probe per distinct destination.
  const destinations = [
    ...new Set(visible.map((r) => r.toGroupId).filter((g): g is string => g !== null)),
  ];
  const hasBoard = new Map<string, boolean>();
  for (const g of destinations) {
    hasBoard.set(g, await groupHasActiveLocalBoard(db, g));
  }

  return visible.map((r) => ({
    ...row2request(r),
    canDecide:
      r.toGroupId !== null &&
      canDecideJoinRequest(actor.grants, r.toGroupId, hasBoard.get(r.toGroupId) ?? false),
  }));
}

/**
 * One group's inbound queue, newest first: the members of *other* groups who
 * have applied to join `toGroupId`. Hydrated with the applicant, because they
 * are not in that group's member list yet — `listMembers({ groupId })` matches
 * on the member's *current* group, so the board would otherwise have a request
 * it may decide and nobody to attach it to.
 *
 * Empty for anyone but the federal board or a board of `toGroupId`; it does not
 * throw, an unauthorized board simply has no queue. `canDecide` keeps ADR 0021's
 * federal fallback for a destination group with no active board seat.
 */
export async function listIncomingGroupChanges(
  db: Db,
  toGroupId: string,
  actor: Actor,
): Promise<IncomingGroupChange[]> {
  if (!isFederalBoard(actor.grants) && !canManageGroup(actor.grants, toGroupId)) return [];

  const rows = await db
    .select({ request: memberGroupChangeRequests, member: members })
    .from(memberGroupChangeRequests)
    .innerJoin(members, eq(members.id, memberGroupChangeRequests.memberId))
    .where(
      and(
        eq(memberGroupChangeRequests.status, "pending"),
        eq(memberGroupChangeRequests.toGroupId, toGroupId),
      ),
    )
    .orderBy(desc(memberGroupChangeRequests.requestedAt));

  const canDecide = canDecideJoinRequest(
    actor.grants,
    toGroupId,
    await groupHasActiveLocalBoard(db, toGroupId),
  );

  return rows.map((r) => ({
    ...row2request(r.request),
    canDecide,
    member: row2member(r.member),
  }));
}

/**
 * One member's full movement history, newest first. Visible to federal board, to
 * a board of the member's current group, and to a board of any group involved in
 * one of their requests (the destination board must see what it decided).
 */
export async function getGroupChangeHistory(
  db: Db,
  memberId: string,
  actor: Actor,
): Promise<GroupChangeRequest[]> {
  const memberRows = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  const member = memberRows[0];
  if (!member) throw new NotFoundError("Mitglied nicht gefunden.");

  const rows = await db
    .select()
    .from(memberGroupChangeRequests)
    .where(eq(memberGroupChangeRequests.memberId, memberId))
    .orderBy(desc(memberGroupChangeRequests.requestedAt));

  const involved = new Set<string>();
  if (member.primaryGroupId !== null) involved.add(member.primaryGroupId);
  for (const r of rows) {
    if (r.fromGroupId !== null) involved.add(r.fromGroupId);
    if (r.toGroupId !== null) involved.add(r.toGroupId);
  }

  const allowed =
    isFederalBoard(actor.grants) || [...involved].some((g) => canManageGroup(actor.grants, g));
  if (!allowed) throw new ForbiddenError("Nur Vorstände dürfen den Gruppenverlauf sehen.");

  return rows.map(row2request);
}
