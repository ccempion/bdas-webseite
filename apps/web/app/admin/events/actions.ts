"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { ForbiddenError, isAppError } from "@bdas/errors";
import {
  canManage,
  cancelEvent,
  cancelRegistrationById,
  createEvent,
  deleteEvent,
  getEvent,
  listRegistrations,
  publishEvent,
  updateEvent,
} from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { sendOrganizerMessage } from "@bdas/notifications";

import { readSessionCookie } from "../../../lib/auth-cookie";
import { viewerFrom } from "../../../lib/event-viewer";
import { berlinLocalToUtc } from "../../lib/datetime";

export type EventFormState = {
  readonly error?: string;
  readonly fields?: Record<string, string>;
};
export type ActionState = { readonly error?: string };
export type EmailRegistrantsState = {
  readonly error?: string;
  readonly ok?: boolean;
  readonly count?: number;
};

/** Public base URL for links in outbound email; mirrors the bootstrap default. */
function eventPublicUrl(eventId: string): string {
  const base = process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/events/${encodeURIComponent(eventId)}`;
}

async function currentMember() {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) throw new ForbiddenError("Anmeldung erforderlich.");
  return me;
}
function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
function opt(fd: FormData, k: string): string | null {
  const v = s(fd, k);
  return v === "" ? null : v;
}
function jsonOpt(fd: FormData, k: string): unknown {
  const v = s(fd, k);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
function numOpt(fd: FormData, k: string): string | null {
  const v = s(fd, k);
  return v === "" ? null : v;
}
/** datetime-local field → UTC instant, interpreting the wall time as Europe/Berlin. */
function berlinDate(fd: FormData, k: string): Date {
  return berlinLocalToUtc(s(fd, k));
}
function berlinDateOpt(fd: FormData, k: string): Date | null {
  const v = s(fd, k);
  return v === "" ? null : berlinLocalToUtc(v);
}

function eventFieldsFromForm(fd: FormData, groupId: string | null) {
  return {
    title: s(fd, "title"),
    summary: opt(fd, "summary"),
    content: {
      body: jsonOpt(fd, "content.body"),
      agenda: jsonOpt(fd, "content.agenda"),
      directions: jsonOpt(fd, "content.directions"),
      bring: jsonOpt(fd, "content.bring"),
    },
    coverImageKey: opt(fd, "coverImageKey"),
    startsAt: berlinDate(fd, "startsAt"),
    endsAt: berlinDateOpt(fd, "endsAt"),
    registrationDeadline: berlinDateOpt(fd, "registrationDeadline"),
    locationName: opt(fd, "locationName"),
    locationAddress: opt(fd, "locationAddress"),
    locationLat: numOpt(fd, "locationLat"),
    locationLng: numOpt(fd, "locationLng"),
    capacity: opt(fd, "capacity"),
    visibility: s(fd, "visibility") || "members_only",
    groupId,
  };
}

/** Authorize the caller may target this group for an event write: federal (null
 *  group) or board/organizer of the group. Mirrors events `canManage`. */
function groupAuthError(
  me: Awaited<ReturnType<typeof currentMember>>,
  groupId: string | null,
): string | null {
  if (canManage(viewerFrom(me), { groupId })) return null;
  return groupId
    ? "Du darfst für diese Gruppe keine Veranstaltung anlegen."
    : "Nur der Bundesvorstand darf föderationsweite Veranstaltungen anlegen.";
}

/** Create (as draft). Authorization: federal board or organizer/board of the group; federation-wide → federal only. */
export async function createEventAction(
  _prev: EventFormState,
  fd: FormData,
): Promise<EventFormState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const me = await currentMember();
  const groupId = opt(fd, "groupId");

  const gErr = groupAuthError(me, groupId);
  if (gErr) return { error: gErr };

  // New events may not start in the past. (Editing keeps past starts editable.)
  const startsAt = berlinDate(fd, "startsAt");
  if (!Number.isNaN(startsAt.getTime()) && startsAt.getTime() < Date.now()) {
    const msg = "Startdatum darf nicht in der Vergangenheit liegen.";
    return { error: msg, fields: { startsAt: msg } };
  }

  let createdId: string;
  try {
    const created = await createEvent(getDb(), eventFieldsFromForm(fd, groupId), me.user.id);
    createdId = created.id;
  } catch (err) {
    if (isAppError(err)) {
      const fields = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return fields ? { error: err.message, fields } : { error: err.message };
    }
    throw err;
  }

  // Land on the edit page so the organizer can add cover + inline images
  // against the now-existing event id.
  revalidatePath("/admin/events");
  revalidatePath("/events");
  redirect(`/admin/events/${createdId}/edit`);
}

export async function updateEventAction(
  _prev: EventFormState,
  fd: FormData,
): Promise<EventFormState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = s(fd, "eventId");
  try {
    const me = await assertManageable(eventId);
    const groupId = opt(fd, "groupId");
    const gErr = groupAuthError(me, groupId);
    if (gErr) return { error: gErr };
    await updateEvent(getDb(), eventId, eventFieldsFromForm(fd, groupId));
  } catch (err) {
    if (isAppError(err)) {
      const fields = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return fields ? { error: err.message, fields } : { error: err.message };
    }
    throw err;
  }
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  redirect(`/admin/events/${eventId}`);
}

/** Authorize that the caller may manage this event; returns the loaded member. */
async function assertManageable(
  eventId: string,
): Promise<Awaited<ReturnType<typeof currentMember>>> {
  const me = await currentMember();
  const viewer = viewerFrom(me);
  const event = await getEvent(getDb(), eventId, viewer);
  if (!event || !canManage(viewer, event)) {
    throw new ForbiddenError("Du darfst diese Veranstaltung nicht verwalten.");
  }
  return me;
}

export async function publishEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = s(fd, "eventId");
  try {
    await assertManageable(eventId);
    await publishEvent(getDb(), eventId);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/events");
  revalidatePath("/events");
  return {};
}

export async function cancelEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = s(fd, "eventId");
  try {
    await assertManageable(eventId);
    await cancelEvent(getDb(), eventId);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/events");
  revalidatePath("/events");
  return {};
}

/** Hard-delete a draft event, then return to the list (the event page is gone). */
export async function deleteEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = s(fd, "eventId");
  try {
    await assertManageable(eventId);
    await deleteEvent(getDb(), eventId);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/events");
  revalidatePath("/events");
  redirect("/admin/events");
}

/** Organizer cancels a registration on a registrant's behalf. The event id is
 *  authorized via `assertManageable`; passing it to the service binds the
 *  registration to that event so a foreign registration id is rejected. */
export async function cancelRegistrationAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = s(fd, "eventId");
  const registrationId = s(fd, "registrationId");
  try {
    await assertManageable(eventId);
    await cancelRegistrationById(getDb(), eventId, registrationId);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  revalidatePath(`/admin/events/${eventId}`);
  return {};
}

/** Email all confirmed registrants a one-off organizer message. */
export async function emailRegistrantsAction(
  _prev: EmailRegistrantsState,
  fd: FormData,
): Promise<EmailRegistrantsState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = s(fd, "eventId");
  const subject = s(fd, "subject");
  const messageBody = s(fd, "body");
  if (!subject || !messageBody) {
    return { error: "Betreff und Nachricht dürfen nicht leer sein." };
  }
  try {
    const me = await assertManageable(eventId);
    const db = getDb();
    const event = await getEvent(db, eventId, viewerFrom(me));
    if (!event) return { error: "Veranstaltung nicht gefunden." };

    const confirmed = (await listRegistrations(db, eventId))
      .filter((r) => r.status === "confirmed")
      .map((r) => r.memberId);
    if (confirmed.length === 0) {
      return { error: "Es gibt keine bestätigten Teilnehmenden." };
    }

    const result = await sendOrganizerMessage(db, {
      memberIds: confirmed,
      eventTitle: event.title,
      eventId,
      eventUrl: eventPublicUrl(eventId),
      subject,
      body: messageBody,
    });
    return { ok: true, count: result.sent };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}
