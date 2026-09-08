"use server";

import { headers } from "next/headers";

import { getDb } from "@bdas/db";
import { ValidationError } from "@bdas/errors";
import { subscribePublicly, type NewsletterSource } from "@bdas/newsletter";

import { bootNewsletter } from "../../lib/newsletter-bootstrap";
import { newsletterEnabled } from "./flag";
import { HONEYPOT_FIELD } from "./honeypot";

export type PublicSignupState = { readonly ok?: boolean; readonly error?: string };

/**
 * How long a real run takes, roughly. The honeypot path returns without
 * touching the database, which would otherwise make it measurably faster than
 * a real signup — and §13.2 requires the DURATION to reveal as little as the
 * text. Not cryptography: enough to sink the difference below network noise.
 */
const DECOY_DELAY_MS = 120;

/** IP and user agent for the consent log (Art. 7 (1) GDPR proof, spec §10). */
function consentContext() {
  const h = headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
    // Same fallback as every other mail-sending action in the app. An empty
    // base would put a RELATIVE link in the confirmation mail, which is dead
    // the moment it leaves the server.
    siteUrl: process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
  };
}

/**
 * Anonymous signup from a public surface. Answers identically whatever the
 * address turns out to be — new, known, unsubscribed or an account holder
 * (spec §8 no. 4). The only visible failure is a malformed address, because
 * that is the one case the visitor can actually fix.
 */
export async function subscribePubliclyAction(
  _prev: PublicSignupState,
  formData: FormData,
): Promise<PublicSignupState> {
  if (!newsletterEnabled()) return {};
  bootNewsletter();

  // Filled means bot. Same friendly answer as a human gets: an error would
  // teach the bot what tripped it.
  if (String(formData.get(HONEYPOT_FIELD) ?? "").trim() !== "") {
    await new Promise((resolve) => setTimeout(resolve, DECOY_DELAY_MS));
    return { ok: true };
  }

  const email = String(formData.get("email") ?? "");
  const source = String(formData.get("source") ?? "footer") as NewsletterSource;
  const sourcePath = String(formData.get("sourcePath") ?? "") || null;

  try {
    await subscribePublicly(getDb(), {
      email,
      source,
      sourcePath,
      context: consentContext(),
    });
  } catch (err) {
    // A malformed address is the visitor's to fix, so it is named. Anything
    // else is ours, and saying so would leak state about this address.
    if (err instanceof ValidationError) return { error: err.message };
    console.error("[newsletter] public signup failed:", err);
    return { ok: true };
  }

  return { ok: true };
}
