/**
 * Member self-service registration with capacity → waitlist, and one-click
 * cancellation that auto-promotes the head of the waitlist.
 *
 * All capacity/waitlist mutations run inside a single transaction so concurrent
 * registrations can't oversubscribe. Domain events are published *after* the
 * transaction commits, so a rollback never emits a phantom event.
 */
import { and, asc, count, eq, gt, isNotNull, isNull, max, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ConflictError, NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { EventDeregistered, EventRegistered, EventsEvent, WaitlistPromoted } from "../events";
import { eventRegistrations, events } from "../schema";
import type { EventRegistration, RegistrationResult, RosterRow } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

function toReg(r: typeof eventRegistrations.$inferSelect): EventRegistration {
  return {
    id: r.id,
    eventId: r.eventId,
    memberId: r.memberId,
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    registeredAt: r.registeredAt,
    cancelledAt: r.cancelledAt,
    waitlistPosition: r.waitlistPosition,
  };
}

/** The member's active registration for an event, or null. */
export async function getMyRegistration(
  db: Db,
  eventId: string,
  memberId: string,
): Promise<EventRegistration | null> {
  const rows = await db
    .select()
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.memberId, memberId),
        isNull(eventRegistrations.cancelledAt),
      ),
    )
    .limit(1);
  return rows[0] ? toReg(rows[0]) : null;
}

/** The active roster for an event: confirmed first, then the waitlist in rank
 *  order. Identity is resolved by the caller (rule 1 — events owns only memberId). */
export async function listRegistrations(db: Db, eventId: string): Promise<RosterRow[]> {
  const rows = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), isNull(eventRegistrations.cancelledAt)))
    .orderBy(
      sql`${eventRegistrations.waitlistPosition} asc nulls first`,
      asc(eventRegistrations.registeredAt),
    );
  return rows.map((r) => ({
    registrationId: r.id,
    memberId: r.memberId,
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    status: r.waitlistPosition === null ? "confirmed" : "waitlisted",
    waitlistPosition: r.waitlistPosition,
    registeredAt: r.registeredAt,
  }));
}

/** Register the member: confirmed if capacity allows, else waitlisted. */
export async function registerMember(
  db: Db,
  eventId: string,
  memberId: string,
): Promise<RegistrationResult> {
  const { result, event } = await db.transaction(async (tx) => {
    const ev = (await tx.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
    if (!ev) throw new NotFoundError("Veranstaltung nicht gefunden.");
    if (ev.status !== "published") {
      throw new ConflictError("Anmeldung ist nur für veröffentlichte Veranstaltungen möglich.");
    }
    if (ev.startsAt <= new Date()) {
      throw new ConflictError("Die Veranstaltung hat bereits begonnen.");
    }

    const active = await tx
      .select()
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.memberId, memberId),
          isNull(eventRegistrations.cancelledAt),
        ),
      )
      .limit(1);
    if (active[0]) throw new ConflictError("Du bist bereits angemeldet.");

    const waitlistPosition = await nextWaitlistPosition(tx, eventId, ev.capacity);

    await tx
      .insert(eventRegistrations)
      .values({ id: createId("ereg"), eventId, memberId, waitlistPosition });

    const event: EventRegistered = {
      type: "events.event.registered",
      eventId,
      memberId,
      waitlisted: waitlistPosition !== null,
      at: new Date(),
    };
    const result: RegistrationResult = {
      status: waitlistPosition === null ? "registered" : "waitlisted",
      waitlistPosition,
    };
    return { result, event };
  });

  await getEventBus().publish(event);
  return result;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type RegRow = typeof eventRegistrations.$inferSelect;
type EventRow = typeof events.$inferSelect;

/** Confirmed (null) if capacity allows, else the next waitlist rank. Shared by
 *  member and guest registration; runs inside the caller's transaction. */
async function nextWaitlistPosition(
  tx: Tx,
  eventId: string,
  capacity: number | null,
): Promise<number | null> {
  if (capacity === null) return null;
  const confirmed = await tx
    .select({ n: count() })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, eventId),
        isNull(eventRegistrations.cancelledAt),
        isNull(eventRegistrations.waitlistPosition),
      ),
    );
  if (Number(confirmed[0]?.n ?? 0) < capacity) return null;
  const maxPos = await tx
    .select({ m: max(eventRegistrations.waitlistPosition) })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, eventId),
        isNull(eventRegistrations.cancelledAt),
        isNotNull(eventRegistrations.waitlistPosition),
      ),
    );
  return Number(maxPos[0]?.m ?? 0) + 1;
}

/**
 * Register a non-member guest by name + email. Only permitted on published,
 * publicly-viewable events that opted in (`allowGuestRegistration`). Capacity /
 * waitlist behaves exactly as the member path; a single-use `guestCancelToken`
 * is minted so the confirmation email can carry a self-cancel link.
 */
export async function registerGuest(
  db: Db,
  eventId: string,
  guest: { name: string; email: string },
): Promise<RegistrationResult> {
  const name = guest.name.trim();
  const email = guest.email.trim();
  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ValidationError("Bitte gib einen Namen und eine gültige E-Mail-Adresse an.");
  }

  const { result, event } = await db.transaction(async (tx) => {
    const ev = (await tx.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
    if (!ev) throw new NotFoundError("Veranstaltung nicht gefunden.");
    if (ev.status !== "published") {
      throw new ConflictError("Anmeldung ist nur für veröffentlichte Veranstaltungen möglich.");
    }
    if (!ev.allowGuestRegistration || ev.visibility !== "public") {
      throw new ConflictError("Gastanmeldung ist für diese Veranstaltung nicht möglich.");
    }
    if (ev.startsAt <= new Date()) {
      throw new ConflictError("Die Veranstaltung hat bereits begonnen.");
    }
    if (ev.registrationDeadline && ev.registrationDeadline <= new Date()) {
      throw new ConflictError("Die Anmeldefrist ist abgelaufen.");
    }

    const active = await tx
      .select()
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          isNull(eventRegistrations.cancelledAt),
          sql`lower(${eventRegistrations.guestEmail}) = lower(${email})`,
        ),
      )
      .limit(1);
    if (active[0]) {
      throw new ConflictError("Mit dieser E-Mail-Adresse bist du bereits angemeldet.");
    }

    const waitlistPosition = await nextWaitlistPosition(tx, eventId, ev.capacity);
    const cancelToken = createId("gtok");

    await tx.insert(eventRegistrations).values({
      id: createId("ereg"),
      eventId,
      guestName: name,
      guestEmail: email,
      guestCancelToken: cancelToken,
      waitlistPosition,
    });

    const event: EventRegistered = {
      type: "events.event.registered",
      eventId,
      memberId: null,
      guestEmail: email,
      guestName: name,
      guestCancelToken: cancelToken,
      waitlisted: waitlistPosition !== null,
      at: new Date(),
    };
    const result: RegistrationResult = {
      status: waitlistPosition === null ? "registered" : "waitlisted",
      waitlistPosition,
    };
    return { result, event };
  });

  await getEventBus().publish(event);
  return result;
}

/** Soft-cancel one registration and rebalance the waitlist, returning the events
 *  to publish. Shared by member self-cancel and organizer cancel-for. */
async function cancelRegistrationRow(tx: Tx, ev: EventRow, reg: RegRow): Promise<EventsEvent[]> {
  const now = new Date();
  await tx
    .update(eventRegistrations)
    .set({ cancelledAt: now })
    .where(eq(eventRegistrations.id, reg.id));

  const emit: EventsEvent[] = [];
  if (reg.waitlistPosition === null) {
    // A confirmed seat opened — promote the head of the waitlist.
    if (ev.startsAt > now) {
      const head = (
        await tx
          .select()
          .from(eventRegistrations)
          .where(
            and(
              eq(eventRegistrations.eventId, ev.id),
              isNull(eventRegistrations.cancelledAt),
              isNotNull(eventRegistrations.waitlistPosition),
            ),
          )
          .orderBy(asc(eventRegistrations.waitlistPosition))
          .limit(1)
      )[0];
      if (head) {
        const headPos = head.waitlistPosition ?? 0;
        await tx
          .update(eventRegistrations)
          .set({ waitlistPosition: null })
          .where(eq(eventRegistrations.id, head.id));
        await tx
          .update(eventRegistrations)
          .set({ waitlistPosition: sql`${eventRegistrations.waitlistPosition} - 1` })
          .where(
            and(
              eq(eventRegistrations.eventId, ev.id),
              isNull(eventRegistrations.cancelledAt),
              isNotNull(eventRegistrations.waitlistPosition),
              gt(eventRegistrations.waitlistPosition, headPos),
            ),
          );
        emit.push({
          type: "events.waitlist.promoted",
          eventId: ev.id,
          memberId: head.memberId,
          guestEmail: head.guestEmail,
          guestName: head.guestName,
          guestCancelToken: head.guestCancelToken,
          at: now,
        } satisfies WaitlistPromoted);
      }
    }
  } else {
    // A waitlisted spot freed — close the gap for those behind it.
    await tx
      .update(eventRegistrations)
      .set({ waitlistPosition: sql`${eventRegistrations.waitlistPosition} - 1` })
      .where(
        and(
          eq(eventRegistrations.eventId, ev.id),
          isNull(eventRegistrations.cancelledAt),
          isNotNull(eventRegistrations.waitlistPosition),
          gt(eventRegistrations.waitlistPosition, reg.waitlistPosition),
        ),
      );
  }

  emit.push({
    type: "events.event.deregistered",
    eventId: ev.id,
    memberId: reg.memberId,
    guestEmail: reg.guestEmail,
    guestName: reg.guestName,
    at: now,
  } satisfies EventDeregistered);
  return emit;
}

/** Cancel the member's own registration; auto-promote the waitlist head if a
 *  confirmed seat opened before the event starts. */
export async function cancelRegistration(db: Db, eventId: string, memberId: string): Promise<void> {
  const toEmit = await db.transaction(async (tx) => {
    const ev = (await tx.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
    if (!ev) throw new NotFoundError("Veranstaltung nicht gefunden.");

    const reg = (
      await tx
        .select()
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, eventId),
            eq(eventRegistrations.memberId, memberId),
            isNull(eventRegistrations.cancelledAt),
          ),
        )
        .limit(1)
    )[0];
    if (!reg) throw new NotFoundError("Keine aktive Anmeldung gefunden.");

    return cancelRegistrationRow(tx, ev, reg);
  });

  for (const e of toEmit) await getEventBus().publish(e);
}

/** Organizer cancel-for: cancel a specific registration by id. The `eventId`
 *  binds the registration to the event the caller is authorized for — a
 *  registration belonging to another event is treated as not found. */
export async function cancelRegistrationById(
  db: Db,
  eventId: string,
  registrationId: string,
): Promise<void> {
  const toEmit = await db.transaction(async (tx) => {
    const reg = (
      await tx
        .select()
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.id, registrationId),
            eq(eventRegistrations.eventId, eventId),
            isNull(eventRegistrations.cancelledAt),
          ),
        )
        .limit(1)
    )[0];
    if (!reg) throw new NotFoundError("Keine aktive Anmeldung gefunden.");

    const ev = (await tx.select().from(events).where(eq(events.id, reg.eventId)).limit(1))[0];
    if (!ev) throw new NotFoundError("Veranstaltung nicht gefunden.");

    return cancelRegistrationRow(tx, ev, reg);
  });

  for (const e of toEmit) await getEventBus().publish(e);
}

/**
 * Guest self-cancellation via the single-use token from their confirmation
 * email. `eventId` binds the token to the event the public cancel page is for.
 * Auto-promotes the waitlist head, same as any cancellation. Throws if the token
 * is unknown or the registration was already cancelled.
 */
export async function cancelGuestByToken(db: Db, eventId: string, token: string): Promise<void> {
  const toEmit = await db.transaction(async (tx) => {
    const reg = (
      await tx
        .select()
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.eventId, eventId),
            eq(eventRegistrations.guestCancelToken, token),
            isNull(eventRegistrations.cancelledAt),
          ),
        )
        .limit(1)
    )[0];
    if (!reg)
      throw new NotFoundError("Dieser Abmeldelink ist ungültig oder wurde bereits verwendet.");

    const ev = (await tx.select().from(events).where(eq(events.id, reg.eventId)).limit(1))[0];
    if (!ev) throw new NotFoundError("Veranstaltung nicht gefunden.");

    return cancelRegistrationRow(tx, ev, reg);
  });

  for (const e of toEmit) await getEventBus().publish(e);
}
