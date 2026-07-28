/**
 * Shared helpers for the board's Server Actions.
 *
 * They live outside the `"use server"` files on purpose: every export of such a
 * file becomes a public endpoint, and `safeRevalidate` is not even async, which
 * that boundary forbids.
 */
import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { getCurrentMember, type Actor } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

export async function actor(): Promise<Actor> {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) throw new Error("Nicht angemeldet.");
  return { userId: me.user.id, grants: me.grants };
}

/** Server Actions are public endpoints; only ever revalidate board routes. */
export function safeRevalidate(path: string): void {
  if (path.startsWith("/federal/") || path.startsWith("/gruppe/")) revalidatePath(path);
}
