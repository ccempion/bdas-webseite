"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getCurrentUser } from "@bdas/auth";
import { getDb } from "@bdas/db";
import {
  declineForUser,
  subscribeAsUser,
  subscribeAtRegistration,
  unsubscribeAsUser,
  type NewsletterSource,
} from "@bdas/newsletter";

import { readSessionCookie } from "../../lib/auth-cookie";
import { bootNewsletter } from "../../lib/newsletter-bootstrap";
import { newsletterEnabled } from "./flag";
import { clearSignupCookie, readSignupCookie } from "./signup-cookie";

export type NewsletterActionState = { readonly ok?: boolean; readonly error?: string };

const GENERIC_ERROR = "Das hat gerade nicht geklappt. Versuch es bitte noch einmal.";

/** IP and user agent for the consent log (Art. 7 (1) GDPR proof, spec §10). */
function consentContext() {
  const h = headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  };
}

async function currentUserId(): Promise<string | null> {
  const user = await getCurrentUser(getDb(), readSessionCookie());
  return user?.id ?? null;
}

/** One-click subscribe for a signed-in account. No confirmation mail (§3.1). */
export async function subscribeMeAction(
  _prev: NewsletterActionState,
  formData: FormData,
): Promise<NewsletterActionState> {
  if (!newsletterEnabled()) return { error: GENERIC_ERROR };
  bootNewsletter();

  const userId = await currentUserId();
  if (!userId) return { error: GENERIC_ERROR };

  // The surface names itself; an unknown value is a bug, not user input.
  const source = String(formData.get("source") ?? "konto") as NewsletterSource;
  const sourcePath = String(formData.get("sourcePath") ?? "") || null;

  try {
    await subscribeAsUser(getDb(), { userId, source, sourcePath, context: consentContext() });
  } catch (err) {
    console.error("[newsletter] subscribeAsUser failed:", err);
    return { error: GENERIC_ERROR };
  }

  // Deliberately NOT revalidating /account: the C1 banner lives there and
  // stops qualifying the moment this succeeds, so a revalidate would unmount
  // it mid-answer and swallow the "Du bist dabei" confirmation (spec §13.2).
  // /account is dynamic, so the next load renders without the banner anyway.
  revalidatePath("/account/einstellungen");
  return { ok: true };
}

/** The only way off the list for an account holder (spec §3.4). */
export async function unsubscribeMeAction(
  _prev: NewsletterActionState,
  _formData: FormData,
): Promise<NewsletterActionState> {
  if (!newsletterEnabled()) return { error: GENERIC_ERROR };
  bootNewsletter();

  const userId = await currentUserId();
  if (!userId) return { error: GENERIC_ERROR };

  try {
    await unsubscribeAsUser(getDb(), { userId, context: consentContext() });
  } catch (err) {
    console.error("[newsletter] unsubscribeAsUser failed:", err);
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/account");
  revalidatePath("/account/einstellungen");
  return { ok: true };
}

/** "Not now" — the fortnight timer, capped at three (spec §6.1). */
export async function dismissPromptAction(
  _prev: NewsletterActionState,
  _formData: FormData,
): Promise<NewsletterActionState> {
  if (!newsletterEnabled()) return { error: GENERIC_ERROR };
  bootNewsletter();

  const userId = await currentUserId();
  if (!userId) return { error: GENERIC_ERROR };

  try {
    await declineForUser(getDb(), { userId, context: consentContext() });
  } catch (err) {
    console.error("[newsletter] declineForUser failed:", err);
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/account");
  return { ok: true };
}

/**
 * The second attempt on /registrieren/erfolg. Reads the account out of the
 * httpOnly cookie — never out of the request — and writes a `pending` row that
 * the pending verification mail will confirm (§3.3). The cookie is spent
 * either way, so the offer is made exactly once.
 */
export async function subscribeAfterRegistrationAction(
  _prev: NewsletterActionState,
  _formData: FormData,
): Promise<NewsletterActionState> {
  if (!newsletterEnabled()) return { error: GENERIC_ERROR };
  bootNewsletter();

  const signup = readSignupCookie();
  clearSignupCookie();
  if (!signup) return { error: GENERIC_ERROR };

  try {
    await subscribeAtRegistration(getDb(), {
      userId: signup.userId,
      email: signup.email,
      source: "registrierung_erfolg",
      sourcePath: "/registrieren/erfolg",
      context: consentContext(),
    });
  } catch (err) {
    console.error("[newsletter] subscribeAtRegistration failed:", err);
    return { error: GENERIC_ERROR };
  }

  return { ok: true };
}
