/**
 * Event lifecycle: create (draft) → publish → cancel, plus edit.
 *
 * Authorization is NOT enforced here — callers gate at the app action layer
 * (group-scoped → `canManageGroup`; federation-wide → `isFederalBoard`), the
 * same convention as `groups/services/manage.ts`. This keeps `events` free of
 * an `auth`/`members` dependency (CLAUDE.md §1 rule 2).
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { ConflictError, NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { EventCancelled, EventPublished } from "../events";
import { events } from "../schema";
import type { EventContent, EventItem, EventStatus, EventVisibility } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

export const EventInput = z.object({
  title: z
    .string()
    .min(3, "Titel muss mindestens 3 Zeichen haben")
    .max(160, "Titel darf höchstens 160 Zeichen haben"),
  descriptionMd: z.string().max(10_000).optional().nullable(),
  startsAt: z.coerce.date({ errorMap: () => ({ message: "Ungültiges Startdatum" }) }),
  endsAt: z.coerce.date().optional().nullable(),
  location: z.string().max(240).optional().nullable(),
  locationUrl: z.string().url("Ungültige URL").max(500).optional().nullable(),
  summary: z.string().max(300).optional().nullable(),
  // Opaque Tiptap docs; validated structurally, rendered/sanitized at read time.
  content: z
    .object({
      body: z.any().optional().nullable(),
      agenda: z.any().optional().nullable(),
      directions: z.any().optional().nullable(),
      bring: z.any().optional().nullable(),
    })
    .optional()
    .nullable(),
  coverImageKey: z.string().max(400).optional().nullable(),
  registrationDeadline: z.coerce.date().optional().nullable(),
  locationName: z.string().max(240).optional().nullable(),
  locationAddress: z.string().max(400).optional().nullable(),
  locationLat: z.coerce.number().min(-90).max(90).optional().nullable(),
  locationLng: z.coerce.number().min(-180).max(180).optional().nullable(),
  capacity: z.coerce
    .number()
    .int("Kapazität muss eine ganze Zahl sein")
    .positive("Kapazität muss größer als 0 sein")
    .optional()
    .nullable(),
  visibility: z.enum(["public", "members_only", "group_only"]).default("members_only"),
  // null = federation-wide; a value = that group's event.
  groupId: z.string().min(1).optional().nullable(),
});
export type EventInput = z.infer<typeof EventInput>;

function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[i.path.join(".") || "_"] = i.message;
    throw new ValidationError("Eingabe ungültig", { fields });
  }
  return parsed.data;
}

export function rowToEvent(r: typeof events.$inferSelect): EventItem {
  return {
    id: r.id,
    groupId: r.groupId,
    title: r.title,
    descriptionMd: r.descriptionMd,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    location: r.location,
    locationUrl: r.locationUrl,
    // New event-page fields — Task 2 reads these from the row properly.
    content: (r.content as EventContent | null) ?? null,
    coverImageKey: r.coverImageKey ?? null,
    summary: r.summary ?? null,
    registrationDeadline: r.registrationDeadline ?? null,
    locationName: r.locationName ?? null,
    locationAddress: r.locationAddress ?? null,
    locationLat: r.locationLat ?? null,
    locationLng: r.locationLng ?? null,
    capacity: r.capacity,
    visibility: r.visibility as EventVisibility,
    status: r.status as EventStatus,
    createdBy: r.createdBy,
  };
}

async function loadOrThrow(db: Db, id: string): Promise<typeof events.$inferSelect> {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!rows[0]) throw new NotFoundError("Veranstaltung nicht gefunden.");
  return rows[0];
}

function validateInput(v: EventInput): void {
  if (v.endsAt && v.endsAt < v.startsAt) {
    throw new ValidationError("Eingabe ungültig", {
      fields: { endsAt: "Ende darf nicht vor dem Beginn liegen" },
    });
  }
  // group_only visibility is meaningless without a group.
  if (v.visibility === "group_only" && !v.groupId) {
    throw new ValidationError("Eingabe ungültig", {
      fields: { visibility: "„Nur Gruppe“ erfordert eine Gruppe" },
    });
  }
}

/** Create a new event in `draft`. Publishing is a separate step. */
export async function createEvent(db: Db, input: unknown, createdBy: string): Promise<EventItem> {
  const v = parseOrThrow(EventInput, input);
  validateInput(v);

  const id = createId("evt");
  await db.insert(events).values({
    id,
    groupId: v.groupId ?? null,
    title: v.title,
    descriptionMd: v.descriptionMd ?? null,
    startsAt: v.startsAt,
    endsAt: v.endsAt ?? null,
    location: v.location ?? null,
    locationUrl: v.locationUrl ?? null,
    summary: v.summary ?? null,
    content: v.content ?? null,
    coverImageKey: v.coverImageKey ?? null,
    registrationDeadline: v.registrationDeadline ?? null,
    locationName: v.locationName ?? null,
    locationAddress: v.locationAddress ?? null,
    locationLat: v.locationLat ?? null,
    locationLng: v.locationLng ?? null,
    capacity: v.capacity ?? null,
    visibility: v.visibility,
    status: "draft",
    createdBy,
  });

  return rowToEvent(await loadOrThrow(db, id));
}

/** Edit a draft or published event. Cancelled events are immutable. */
export async function updateEvent(db: Db, id: string, input: unknown): Promise<EventItem> {
  const existing = await loadOrThrow(db, id);
  if (existing.status === "cancelled") {
    throw new ConflictError("Abgesagte Veranstaltungen können nicht bearbeitet werden.");
  }
  const v = parseOrThrow(EventInput, input);
  validateInput(v);

  await db
    .update(events)
    .set({
      title: v.title,
      descriptionMd: v.descriptionMd ?? null,
      startsAt: v.startsAt,
      endsAt: v.endsAt ?? null,
      location: v.location ?? null,
      locationUrl: v.locationUrl ?? null,
      summary: v.summary ?? null,
      content: v.content ?? null,
      coverImageKey: v.coverImageKey ?? null,
      registrationDeadline: v.registrationDeadline ?? null,
      locationName: v.locationName ?? null,
      locationAddress: v.locationAddress ?? null,
      locationLat: v.locationLat ?? null,
      locationLng: v.locationLng ?? null,
      capacity: v.capacity ?? null,
      visibility: v.visibility,
      groupId: v.groupId ?? null,
    })
    .where(eq(events.id, id));

  return rowToEvent(await loadOrThrow(db, id));
}

/** Draft → published. Emits `events.event.published`. */
export async function publishEvent(db: Db, id: string): Promise<EventItem> {
  const existing = await loadOrThrow(db, id);
  if (existing.status === "cancelled") {
    throw new ConflictError("Abgesagte Veranstaltungen können nicht veröffentlicht werden.");
  }
  if (existing.status !== "published") {
    await db.update(events).set({ status: "published" }).where(eq(events.id, id));
    const event: EventPublished = {
      type: "events.event.published",
      eventId: id,
      groupId: existing.groupId,
      at: new Date(),
    };
    await getEventBus().publish(event);
  }
  return rowToEvent(await loadOrThrow(db, id));
}

/** → cancelled. Emits `events.event.cancelled` (notifications informs registrants). */
export async function cancelEvent(db: Db, id: string): Promise<EventItem> {
  const existing = await loadOrThrow(db, id);
  if (existing.status !== "cancelled") {
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, id));
    const event: EventCancelled = {
      type: "events.event.cancelled",
      eventId: id,
      at: new Date(),
    };
    await getEventBus().publish(event);
  }
  return rowToEvent(await loadOrThrow(db, id));
}
