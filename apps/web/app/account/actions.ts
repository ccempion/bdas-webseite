"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import {
  changePrimaryGroup,
  createProfile,
  getCurrentMember,
  updateProfile,
  withdrawGroupChange,
} from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";

export type ProfileFormState = {
  /** Set only on a successful write. `useFormState` cannot otherwise tell an
   *  empty success apart from its own initial state, and the /account edit
   *  toggle needs that distinction to collapse back to the summary. */
  readonly ok?: true;
  readonly error?: string;
  readonly notice?: string;
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
    if (!me.member) {
      await createProfile(db, { userId: me.user.id, firstName, lastName, primaryGroupId });
      revalidatePath("/account");
      return { ok: true };
    }

    await updateProfile(db, me.member.id, { firstName, lastName });

    // The group moves only through the transfer path (ADR 0022): a pending
    // member's choice is applied, an active member's becomes a request the
    // destination board decides. Submitting the current group is a no-op that
    // also clears any open request — the "never mind" affordance.
    const res = await changePrimaryGroup(db, me.member.id, primaryGroupId, {
      userId: me.user.id,
      grants: me.grants,
    });
    revalidatePath("/account");
    return res.kind === "requested"
      ? { ok: true, notice: "Dein Wechselantrag wurde eingereicht und wartet auf die Zielgruppe." }
      : { ok: true };
  } catch (err) {
    if (isAppError(err)) {
      const fields = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return fields ? { error: err.message, fields } : { error: err.message };
    }
    throw err;
  }
}

/** The member cancels their own open transfer request. */
export async function withdrawGroupChangeAction(): Promise<{ ok: boolean; error?: string }> {
  requireFlag("members");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { ok: false, error: "Anmeldung erforderlich." };

  try {
    await withdrawGroupChange(db, me.member.id, { userId: me.user.id, grants: me.grants });
    revalidatePath("/account");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fehler" };
  }
}
