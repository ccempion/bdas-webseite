import { runAccountDeletionSweep } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";

import { newsletterEnabled } from "../../../_newsletter/flag";
import { buildDeletionSteps, completionMail } from "../../../../lib/account-deletion-composition";
import { bootFiles } from "../../../../lib/files-bootstrap";
import { bootNewsletter } from "../../../../lib/newsletter-bootstrap";
import { bootNotifications } from "../../../../lib/notifications-bootstrap";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily hard purge of accounts whose 30-day grace period has run out. Triggered
 * by Vercel Cron, which sends `Authorization: Bearer ${CRON_SECRET}`; without a
 * matching secret nothing runs. Due-ness, leases and resumption live in the
 * engine, so this handler only wires the modules and reports the outcome.
 *
 * The response carries request ids and step names only — never an address, a
 * name or an error message. A failed request answers 500 so the cron run shows
 * red instead of silently retrying tomorrow.
 */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isFlagOn("account_deletion")) {
    return Response.json({ skipped: "account_deletion flag off" });
  }
  // A module whose flag is off is not wired here: its step would resolve no
  // member and "succeed" without purging (files → orphaned storage objects),
  // e-mail C would only reach the console yet count as sent, and the
  // newsletter row would survive `auth.user.deleted`. Refuse to start rather
  // than erase an account half-way and mark it done.
  const missing = [
    !isFlagOn("files") && "files",
    !isFlagOn("notifications") && "notifications",
    !newsletterEnabled() && "newsletter",
  ].filter((m): m is string => m !== false);
  if (missing.length > 0) {
    return Response.json({ error: "prerequisite flags off", missing }, { status: 500 });
  }
  await bootFiles(); // storage driver + MemberIdResolver
  bootNotifications(); // Notifier + resolvers
  bootNewsletter(); // erases the subscription on auth.user.deleted
  const result = await runAccountDeletionSweep(getDb(), {
    steps: buildDeletionSteps(),
    completionMail,
  });
  return Response.json(result, { status: result.failed.length > 0 ? 500 : 200 });
}
