"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { buildVerifyUrl, getNotifier, register } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError, ValidationError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { createProfile } from "@bdas/members";
import { subscribeAtRegistration } from "@bdas/newsletter";

import { bootAuth } from "../../lib/auth-bootstrap";
import { bootNewsletter } from "../../lib/newsletter-bootstrap";
import { newsletterEnabled } from "../_newsletter/flag";
import { setSignupCookie } from "../_newsletter/signup-cookie";

export type RegisterFormState = {
  readonly error?: string;
  readonly fields?: Record<string, string>;
};

export async function registerAction(
  _prev: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  requireFlag("auth");
  bootAuth();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const consent = formData.get("consent") === "true";
  const ip = clientIp();

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const nameErrors: Record<string, string> = {};
  if (!firstName) nameErrors["firstName"] = "Bitte gib deinen Vornamen an.";
  if (!lastName) nameErrors["lastName"] = "Bitte gib deinen Nachnamen an.";
  if (Object.keys(nameErrors).length > 0) {
    return { error: "Bitte fülle alle Pflichtfelder aus.", fields: nameErrors };
  }

  let result;
  try {
    result = await register(
      getDb(),
      { email, password, consent },
      {
        ip,
        publicSiteUrl: process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
      },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return err.fields ? { error: err.message, fields: err.fields } : { error: err.message };
    }
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  try {
    await createProfile(getDb(), {
      userId: result.userId,
      firstName,
      lastName,
    });
  } catch (err) {
    // Account already exists; the /account profile form is the recovery path.
    // Never fail the response for a member-row hiccup — log and continue.
    console.error("[auth] createProfile after register failed:", err);
  }

  const verifyUrl = buildVerifyUrl(
    process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
    result.verifyToken,
  );
  try {
    await getNotifier().send({ kind: "verify", to: email, verifyUrl });
  } catch (err) {
    // Account is already created; the resend-verification flow is the recovery
    // path. Don't fail the response — surface the failure in logs instead.
    console.error("[auth] verify email send failed:", err);
  }

  // A newsletter hiccup must never cost someone their account: log and move on.
  // Deliberately outside the redirect below — Next implements redirect() as a
  // throw, and an enclosing catch would swallow the navigation.
  if (newsletterEnabled()) {
    try {
      bootNewsletter();
      if (formData.get("newsletter") === "true") {
        await subscribeAtRegistration(getDb(), {
          userId: result.userId,
          email,
          source: "registrierung",
          sourcePath: "/registrieren",
          context: { ip },
        });
      } else {
        // Unticked: keep the address for the one softer second attempt on the
        // success page. Ticked means done — nobody gets asked twice (§6).
        setSignupCookie({ userId: result.userId, email: email.trim().toLowerCase() });
      }
    } catch (err) {
      console.error("[newsletter] registration signup failed:", err);
    }
  }

  redirect("/registrieren/erfolg");
}

function clientIp(): string {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "0.0.0.0";
}
