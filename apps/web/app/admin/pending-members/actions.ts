"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import {
  approveMember,
  getCurrentMember,
  requireFederalBoard,
  transitionStatus,
} from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie.js";

export type AdminActionState = { readonly error?: string };

async function actor() {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  requireFederalBoard(me);
  return { userId: me.user.id, effectiveRoles: me.effectiveRoles };
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
