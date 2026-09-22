import { headers } from "next/headers";

import { buildVerifyUrl, getNotifier, VERIFICATION_TTL_MS } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { subscribeAtRegistration } from "@bdas/newsletter";

import { setVerifyCookie } from "../../lib/auth-cookie";
import { bootNewsletter } from "../../lib/newsletter-bootstrap";
import { newsletterEnabled } from "../_newsletter/flag";

export function clientIp(): string {
  const h = headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "0.0.0.0";
}

/**
 * Alles nach `register`, was beide Registrierungswege teilen: Bestätigungsmail
 * und Newsletter. Wirft nie — das Konto existiert bereits, und eine gescheiterte
 * Mail hat mit „Erneut senden" einen eigenen Rettungsweg.
 */
export async function finishRegistration(input: {
  userId: string;
  email: string;
  verifyToken: string;
  newsletter: boolean;
  sourcePath: string;
  ip: string;
}): Promise<void> {
  const verifyUrl = buildVerifyUrl(
    process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
    input.verifyToken,
  );
  // Merkt sich, dass dieser Browser die Registrierung begonnen hat; nur hier
  // meldet der Bestätigungslink gleich an (ADR 0051).
  setVerifyCookie(input.verifyToken, Math.floor(VERIFICATION_TTL_MS / 1000));
  try {
    await getNotifier().send({ kind: "verify", to: input.email, verifyUrl });
  } catch (err) {
    console.error("[auth] verify email send failed:", err);
  }

  if (!newsletterEnabled() || !input.newsletter) return;
  try {
    bootNewsletter();
    await subscribeAtRegistration(getDb(), {
      userId: input.userId,
      email: input.email,
      source: "registrierung",
      sourcePath: input.sourcePath,
      context: { ip: input.ip },
    });
  } catch (err) {
    console.error("[newsletter] registration signup failed:", err);
  }
}
