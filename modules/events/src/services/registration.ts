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

import { ConflictError, NotFoundError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { EventDeregistered, EventRegistered, EventsEvent, WaitlistPromoted } from "../events";
import { eventRegistrations, events } from "../schema";
import type { EventRegistration, RegistrationResult } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

function toReg(r: typeof eventRegistrations.$inferSelect): EventRegistration {
  return {
    id: r.id,
    eventId: r.eventId,
    memberId: r.memberId,
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

    let waitlistPosition: number | null = null;
    if (ev.capacity !== null) {
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
      if (Number(confirmed[0]?.n ?? 0) >= ev.capacity) {
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
        waitlistPosition = Number(maxPos[0]?.m ?? 0) + 1;
      }
    }

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

/** Cancel the member's registration; auto-promote the waitlist head if a
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
                eq(eventRegistrations.eventId, eventId),
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
                eq(eventRegistrations.eventId, eventId),
                isNull(eventRegistrations.cancelledAt),
                isNotNull(eventRegistrations.waitlistPosition),
                gt(eventRegistrations.waitlistPosition, headPos),
              ),
            );
          const promoted: WaitlistPromoted = {
            type: "events.waitlist.promoted",
            eventId,
            memberId: head.memberId,
            at: now,
          };
          emit.push(promoted);
        }
      }
    } else {
      // A waitlisted spot freed — close the gap for those behind it.
      await tx
        .update(eventRegistrations)
        .set({ waitlistPosition: sql`${eventRegistrations.waitlistPosition} - 1` })
        .where(
          and(
            eq(eventRegistrations.eventId, eventId),
            isNull(eventRegistrations.cancelledAt),
            isNotNull(eventRegistrations.waitlistPosition),
            gt(eventRegistrations.waitlistPosition, reg.waitlistPosition),
          ),
        );
    }

    const deregistered: EventDeregistered = {
      type: "events.event.deregistered",
      eventId,
      memberId,
      at: now,
    };
    emit.push(deregistered);
    return emit;
  });

  for (const e of toEmit) await getEventBus().publish(e);
}
