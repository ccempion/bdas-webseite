"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { archiveGroup, createGroup } from "@bdas/groups";
import { getCurrentMember, requireFederalBoard } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

async function assertFederal() {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  requireFederalBoard(me); // throws ForbiddenError if not federal_board
}

/** The public `/gruppen` list is statically renderable, so a created or
 *  archived group stays visible/invisible there until the next deploy without
 *  this. `/gruppen/[slug]` is force-dynamic and needs no revalidation. */
function revalidateGroupViews(): void {
  revalidatePath("/federal/groups");
  revalidatePath("/gruppen");
}

export async function createGroupAction(input: {
  name: string;
  city: string;
  slug: string;
}): Promise<void> {
  await assertFederal();
  await createGroup(getDb(), input);
  revalidateGroupViews();
}

export async function archiveGroupAction(groupId: string): Promise<void> {
  await assertFederal();
  await archiveGroup(getDb(), groupId);
  revalidateGroupViews();
}
