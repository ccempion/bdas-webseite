"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { createProfile, getCurrentMember, updateProfile } from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";

export type ProfileFormState = {
  readonly error?: string;
  readonly fields?: Record<string, string>;
};

export async function saveProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  requireFlag("members");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return { error: "Anmeldung erforderlich." };

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const groupId = String(formData.get("primaryGroupId") ?? "").trim();
  const primaryGroupId = groupId === "" ? null : groupId;

  try {
    if (me.member) {
      await updateProfile(db, me.member.id, { firstName, lastName, primaryGroupId });
    } else {
      await createProfile(db, {
        userId: me.user.id,
        firstName,
        lastName,
        primaryGroupId,
      });
    }
  } catch (err) {
    if (isAppError(err)) {
      const fields = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return fields ? { error: err.message, fields } : { error: err.message };
    }
    throw err;
  }

  revalidatePath("/account");
  return {};
}
