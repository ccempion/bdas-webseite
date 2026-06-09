"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { ForbiddenError, isAppError } from "@bdas/errors";
import { canManage, cancelEvent, createEvent, getEvent, publishEvent } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { canManageGroup, getCurrentMember, isFederalBoard } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";
import { viewerFrom } from "../../../lib/event-viewer";

export type EventFormState = {
  readonly error?: string;
  readonly fields?: Record<string, string>;
};
export type ActionState = { readonly error?: string };

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

/** Create (as draft). group-scoped → canManageGroup; federation-wide → federal. */
export async function createEventAction(
  _prev: EventFormState,
  fd: FormData,
): Promise<EventFormState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const me = await currentMember();
  const groupId = opt(fd, "groupId");

  if (groupId) {
    if (!canManageGroup(me.grants, groupId)) {
      return { error: "Du darfst für diese Gruppe keine Veranstaltung anlegen." };
    }
  } else if (!isFederalBoard(me.grants)) {
    return { error: "Nur der Bundesvorstand darf föderationsweite Veranstaltungen anlegen." };
  }

  try {
    await createEvent(
      getDb(),
      {
        title: s(fd, "title"),
        descriptionMd: opt(fd, "descriptionMd"),
        startsAt: s(fd, "startsAt"),
        endsAt: opt(fd, "endsAt"),
        location: opt(fd, "location"),
        locationUrl: opt(fd, "locationUrl"),
        capacity: opt(fd, "capacity"),
        visibility: s(fd, "visibility") || "members_only",
        groupId,
      },
      me.user.id,
    );
  } catch (err) {
    if (isAppError(err)) {
      const fields = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return fields ? { error: err.message, fields } : { error: err.message };
    }
    throw err;
  }

  revalidatePath("/admin/events");
  revalidatePath("/events");
  redirect("/admin/events");
}

/** Authorize that the caller may manage this event, returning nothing. */
async function assertManageable(eventId: string): Promise<void> {
  const me = await currentMember();
  const viewer = viewerFrom(me);
  const event = await getEvent(getDb(), eventId, viewer);
  if (!event || !canManage(viewer, event)) {
    throw new ForbiddenError("Du darfst diese Veranstaltung nicht verwalten.");
  }
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
