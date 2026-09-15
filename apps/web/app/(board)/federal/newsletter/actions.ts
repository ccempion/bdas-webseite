"use server";

import { revalidatePath } from "next/cache";

import { canSeeFederalScope } from "@bdas/dashboard-shell";
import { getDb, type Db } from "@bdas/db";
import { getCurrentMember } from "@bdas/members";
import { purgeStalePending, removeSubscriber } from "@bdas/newsletter";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { bootNewsletter } from "../../../../lib/newsletter-bootstrap";
import { newsletterEnabled } from "../../../_newsletter/flag";

export type RemoveResult = { ok: true; removed: number } | { ok: false; error: string };

const DENIED: RemoveResult = { ok: false, error: "Keine Berechtigung." };

/** Same gate as the page and the export: the federal board, flag on. The
 *  resolver is wired here too, because `removeSubscriber` matches duplicates on
 *  the resolved address. */
async function federalDb(): Promise<Db | null> {
  if (!newsletterEnabled()) return null;
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me || !canSeeFederalScope(me.grants)) return null;
  bootNewsletter();
  return db;
}

export async function removeSubscriberAction(id: string): Promise<RemoveResult> {
  const db = await federalDb();
  if (!db) return DENIED;
  await removeSubscriber(db, id);
  revalidatePath("/federal/newsletter");
  return { ok: true, removed: 1 };
}

export async function purgeStalePendingAction(): Promise<RemoveResult> {
  const db = await federalDb();
  if (!db) return DENIED;
  const removed = await purgeStalePending(db);
  revalidatePath("/federal/newsletter");
  return { ok: true, removed };
}
