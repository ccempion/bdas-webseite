"use server";

import { revalidatePath } from "next/cache";

import { deleteAccount, getUserEmails } from "@bdas/auth";
import { canSeeFederalScope } from "@bdas/dashboard-shell";
import { getDb } from "@bdas/db";
import { getCurrentMember, getMemberByUserId } from "@bdas/members";

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
