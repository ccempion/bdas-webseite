import { PASSWORD_RULE_HINT } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { loadFlowEnv, parseEntryContext } from "@bdas/onboarding";
import { UNIVERSITIES, universityCity } from "@bdas/profile";

import { legalUrls } from "../../lib/legal";
import { newsletterEnabled } from "../_newsletter/flag";
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
    entry: parseEntryContext(typeof from === "string" ? from : undefined),
    universities,
    privacyUrl: legalUrls().privacy,
    passwordHint: PASSWORD_RULE_HINT,
    newsletterOn: newsletterEnabled(),
  };
}
