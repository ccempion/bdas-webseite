import { headers } from "next/headers";

import { buildVerifyUrl, getNotifier } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { subscribeAtRegistration } from "@bdas/newsletter";

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
