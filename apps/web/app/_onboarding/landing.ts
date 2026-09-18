import type { Db } from "@bdas/db";
import { getMemberByUserId, getOpenGroupChange } from "@bdas/members";
import { getJourneyForUser } from "@bdas/onboarding";

import { isProfileComplete } from "../_profile/complete";

export type LandingInput = {
  readonly memberStatus: "pending" | "active" | null;
  readonly journeyStatus: "details_offen" | "abgeschickt" | null;
  readonly hasOpenApplication: boolean;
  readonly profileComplete: boolean;
};

export type Landing = "/mitmachen/angaben" | "/mitmachen";

/**
 * Wohin eine angemeldete Person gehört, solange sie sich bewirbt (Spec §5.3,
 * §6). Eine einzige Stelle für Login, Bestätigungslink, `/profil` und
 * `/mitmachen`, damit die Einstiege nicht auseinanderlaufen.
 */
export function onboardingLanding(i: LandingInput): Landing | null {
  if (i.memberStatus !== "pending") return null;
  if (i.journeyStatus === "details_offen") return "/mitmachen/angaben";
  if (i.journeyStatus === "abgeschickt") return null;
  if (i.hasOpenApplication || i.profileComplete) return null;
  return "/mitmachen";
}

export async function resolveOnboardingLanding(db: Db, userId: string): Promise<Landing | null> {
  const member = await getMemberByUserId(db, userId);
  if (member?.status !== "pending") return null;
  const journey = await getJourneyForUser(db, userId);
  const open = journey ? null : await getOpenGroupChange(db, member.id);
  const profileComplete = journey ? false : await isProfileComplete(db, userId);
  return onboardingLanding({
    memberStatus: member.status,
    journeyStatus: journey?.status ?? null,
    hasOpenApplication: open !== null,
    profileComplete,
  });
}
