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

export async function createGroupAction(input: { name: string; city: string; slug: string }): Promise<void> {
  await assertFederal();
  await createGroup(getDb(), input);
  revalidatePath("/federal/groups");
}

export async function archiveGroupAction(groupId: string): Promise<void> {
  await assertFederal();
  await archiveGroup(getDb(), groupId);
  revalidatePath("/federal/groups");
}
