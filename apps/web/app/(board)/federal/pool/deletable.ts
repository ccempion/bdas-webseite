import type { Db } from "@bdas/db";
import { isFederalBoardEmail } from "@bdas/feature-flags";
import type { Member } from "@bdas/members";
import { getProfile } from "@bdas/profile";

export type Verdict = { ok: true } | { ok: false; error: string };

/**
 * Who the board may delete from "Ohne Gruppe" (ADR 0044): an applicant who was
 * never approved, belongs to no group and never filled in the profile — and is
 * neither the board member acting nor on the federal-board allowlist.
 *
 * One function for the page (whether to show the button) and the action
 * (whether to delete), so the two cannot disagree.
 */
export async function isDeletableApplicant(
  db: Db,
  input: { member: Member | null; email: string | null; actorUserId: string },
): Promise<Verdict> {
  const { member, email, actorUserId } = input;
  if (!member || member.status !== "pending" || member.primaryGroupId !== null) {
    return { ok: false, error: "Nur Bewerber:innen ohne Gruppe lassen sich hier löschen." };
  }
  if (member.userId === actorUserId) {
    return { ok: false, error: "Das eigene Konto lässt sich hier nicht löschen." };
  }
  if (email !== null && isFederalBoardEmail(email)) {
    return { ok: false, error: "Konten des Bundesvorstands lassen sich nicht löschen." };
  }
  if ((await getProfile(db, member.userId)) !== null) {
    return { ok: false, error: "Wer ein Profil angelegt hat, lässt sich hier nicht löschen." };
  }
  return { ok: true };
}
