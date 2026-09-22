"use server";

import { buildVerifyUrl, getNotifier, resendVerification, VERIFICATION_TTL_MS } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { requireFlag } from "@bdas/feature-flags";

import { bootAuth } from "../../lib/auth-bootstrap";
import { setVerifyCookie } from "../../lib/auth-cookie";

export type ResendFormState = {
  readonly sent?: boolean;
};

export async function resendAction(
  _prev: ResendFormState,
  formData: FormData,
): Promise<ResendFormState> {
  requireFlag("auth");
  bootAuth();

  const email = String(formData.get("email") ?? "");

  try {
    const result = await resendVerification(getDb(), email);
    if (result) {
      const verifyUrl = buildVerifyUrl(
        process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
        result.verifyToken,
      );
      // Der neue Link gehört zu diesem Browser (ADR 0051).
      setVerifyCookie(result.verifyToken, Math.floor(VERIFICATION_TTL_MS / 1000));
      try {
        await getNotifier().send({ kind: "verify", to: email, verifyUrl });
      } catch (err) {
        console.error("[auth] resend-verification email send failed:", err);
      }
    }
  } catch {
    // Always return "sent" — do not reveal whether the email exists.
  }

  return { sent: true };
}
