"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { ForbiddenError, isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { approveMember, getCurrentMember, transitionStatus } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

export type AdminActionState = { readonly error?: string };

/**
 * Authentication only — per-member authorization (federal_board, or
 * local_board of the member's group) is enforced by the service per ADR 0007.
 */
async function actor() {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) throw new ForbiddenError("Anmeldung erforderlich.");
  return { userId: me.user.id, grants: me.grants };
}

export async function approveAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  requireFlag("members");
  const memberId = String(formData.get("memberId") ?? "");
  try {
    await approveMember(getDb(), memberId, await actor());
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/pending-members");
  return {};
}

export async function declineAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  requireFlag("members");
  const memberId = String(formData.get("memberId") ?? "");
  try {
    await transitionStatus(getDb(), memberId, "inactive", await actor());
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/pending-members");
  return {};
}
