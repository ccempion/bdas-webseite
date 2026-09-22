"use server";

import { revalidatePath } from "next/cache";

import { deleteAccount, getUserEmails } from "@bdas/auth";
import { canSeeFederalScope } from "@bdas/dashboard-shell";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { acceptWithoutGroup, getCurrentMember, getMemberByUserId } from "@bdas/members";
import { getProfile } from "@bdas/profile";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { bootNewsletter } from "../../../../lib/newsletter-bootstrap";
import { isDeletableApplicant } from "./deletable";

export type DeleteApplicantResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes a groupless applicant without a profile — in practice, a bot
 * (ADR 0044). Every rule is checked again here, against the database as it is
 * now: the page's button is a convenience, not the gate.
 */
export async function deleteApplicantAction(userId: string): Promise<DeleteApplicantResult> {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me || !canSeeFederalScope(me.grants)) return { ok: false, error: "Keine Berechtigung." };

  const [member, emails] = await Promise.all([
    getMemberByUserId(db, userId),
    getUserEmails(db, [userId]),
  ]);
  const verdict = await isDeletableApplicant(db, {
    member,
    email: emails.get(userId) ?? null,
    actorUserId: me.user.id,
  });
  if (!verdict.ok) return verdict;

  // The newsletter's `auth.user.deleted` handler has to be on the bus before
  // the event fires; this action may run in a bundle where nothing wired it.
  bootNewsletter();
  await deleteAccount(db, userId);
  revalidatePath("/federal/pool");
  return { ok: true };
}

export type AcceptResult = { ok: true } | { ok: false; error: string };

/**
 * Nimmt eine Person ohne Gruppe auf. Die Rolle hängt am Nutzertyp: Ehemalige
 * werden als `alumnus` markiert, Studierende ohne Gruppe vor Ort bekommen keine
 * Rolle. Der Dienst prüft jede Regel noch einmal, der Knopf ist Bequemlichkeit,
 * kein Tor.
 */
export async function acceptWithoutGroupAction(userId: string): Promise<AcceptResult> {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me || !canSeeFederalScope(me.grants)) return { ok: false, error: "Keine Berechtigung." };

  const member = await getMemberByUserId(db, userId);
  if (!member) return { ok: false, error: "Person nicht gefunden." };
  if (member.status !== "pending")
    return { ok: false, error: "Diese Person ist bereits aufgenommen." };

  const profile = await getProfile(db, userId);
  const role = profile?.nutzertyp === "alumnus" ? "alumnus" : null;

  try {
    await acceptWithoutGroup(db, member.id, { userId: me.user.id, grants: me.grants }, role);
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/federal/pool");
  return { ok: true };
}
