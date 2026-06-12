"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { approveMember, getCurrentMember, transitionStatus } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

async function actor() {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) throw new Error("Nicht angemeldet.");
  return { userId: me.user.id, grants: me.grants };
}

/** Server Actions are public endpoints; only ever revalidate board routes. */
function safeRevalidate(path: string): void {
  if (path.startsWith("/federal/") || path.startsWith("/gruppe/")) revalidatePath(path);
}

/** Approve a pending member. Authority is enforced inside approveMember. */
export async function approveMemberAction(memberId: string, revalidate: string): Promise<void> {
  await approveMember(getDb(), memberId, await actor());
  safeRevalidate(revalidate);
}

/** Reject a pending member → inactive. */
export async function rejectMemberAction(memberId: string, revalidate: string): Promise<void> {
  await transitionStatus(getDb(), memberId, "inactive", await actor());
  safeRevalidate(revalidate);
}
