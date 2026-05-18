"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { archiveGroup, createGroup, updateGroup } from "@bdas/groups";
import { getCurrentMember, requireFederalBoard } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

export type GroupFormState = {
  readonly error?: string;
  readonly fields?: Record<string, string>;
};

async function requireBoard() {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  requireFederalBoard(me);
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v === "" ? null : v;
}

/**
 * Single create/edit action, branching on the presence of a `groupId` —
 * mirrors the members module's `saveProfileAction` pattern.
 */
export async function saveGroupAction(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  requireFlag("groups");
  await requireBoard();
  const db = getDb();

  const groupId = str(formData, "groupId");
  const profile = {
    name: str(formData, "name"),
    city: str(formData, "city"),
    contactEmail: optional(formData, "contactEmail"),
    instagramUrl: optional(formData, "instagramUrl"),
    websiteUrl: optional(formData, "websiteUrl"),
    status: str(formData, "status") || "active",
  };

  try {
    if (groupId) {
      await updateGroup(db, groupId, profile);
    } else {
      await createGroup(db, { ...profile, slug: str(formData, "slug") });
    }
  } catch (err) {
    if (isAppError(err)) {
      const fields = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return fields ? { error: err.message, fields } : { error: err.message };
    }
    throw err;
  }

  revalidatePath("/admin/gruppen");
  redirect("/admin/gruppen");
}

export async function archiveGroupAction(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  requireFlag("groups");
  await requireBoard();

  const groupId = str(formData, "groupId");
  try {
    await archiveGroup(getDb(), groupId);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  revalidatePath("/admin/gruppen");
  redirect("/admin/gruppen");
}
