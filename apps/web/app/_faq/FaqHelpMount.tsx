import { isFlagOn } from "@bdas/feature-flags";

import { loadCurrentMember } from "../_dashboard/session";
import { FaqHelpLauncher } from "./FaqHelpLauncher";

/**
 * The session half of Spec §7's gate. `loadCurrentMember` is `cache()`d per
 * request and the root layout already resolves the session for the header, so
 * this adds no extra database read.
 */
export async function FaqHelpMount() {
  if (!isFlagOn("faq_suite")) return null;
  const me = await loadCurrentMember();
  if (!me) return null;
  return <FaqHelpLauncher />;
}
