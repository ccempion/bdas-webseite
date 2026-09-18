import { PASSWORD_RULE_HINT } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { getMemberByUserId } from "@bdas/members";
import { loadFlowEnv } from "@bdas/onboarding";
import { UNIVERSITIES, universityCity } from "@bdas/profile";

import { legalUrls } from "../../lib/legal";
import { loadViewer } from "../_dashboard/session";
import { newsletterEnabled } from "../_newsletter/flag";
import { defaultEntryDeps, resolveEntryContext } from "./entry";
import { resolveOnboardingLanding } from "./landing";
import { cityMatches } from "./place-search";
import type { WizardProps } from "./types";

export async function loadWizardProps(from: string | string[] | undefined): Promise<WizardProps> {
  const env = await loadFlowEnv(getDb());
  const universities = UNIVERSITIES.flatMap((u): Array<readonly [string, string]> => {
    const city = universityCity(u);
    return city && env.groups.some((g) => cityMatches(g.city, city)) ? [[u, city]] : [];
  });
  return {
    env,
    entry: await resolveEntryContext(
      typeof from === "string" ? from : undefined,
      defaultEntryDeps(),
    ),
    universities,
    privacyUrl: legalUrls().privacy,
    passwordHint: PASSWORD_RULE_HINT,
    newsletterOn: newsletterEnabled(),
  };
}

export type MitmachenView =
  | { readonly kind: "redirect"; readonly to: string }
  | { readonly kind: "wizard"; readonly props: WizardProps };

/** Was `/mitmachen` zeigt — für Besucher den Wizard, für Angemeldete ihren Stand. */
export async function loadMitmachen(from: string | string[] | undefined): Promise<MitmachenView> {
  const viewer = await loadViewer();
  if (!viewer) return { kind: "wizard", props: await loadWizardProps(from) };

  const db = getDb();
  const landing = await resolveOnboardingLanding(db, viewer.id);
  if (landing !== "/mitmachen") return { kind: "redirect", to: landing ?? "/account" };

  const member = await getMemberByUserId(db, viewer.id);
  if (!member) return { kind: "redirect", to: "/account" };
  return {
    kind: "wizard",
    props: {
      ...(await loadWizardProps(from)),
      resume: { firstName: member.firstName, lastName: member.lastName },
    },
  };
}
