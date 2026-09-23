/**
 * Test-only capture of the last email sent to each recipient, for e2e specs
 * that need to read a link a real email would carry (the reactivation token
 * in PR3, the data-export attachment in a later PR) without reaching around
 * a deliberate security boundary — this codebase's reactivation and
 * password-reset tokens are hashed at rest, so no DB column has the
 * plaintext to read back.
 *
 * Backed by globalThis (Symbol.for), same reason as notifications' own
 * Notifier/RecipientResolver: Next.js can run a Server Action and a route
 * handler in different module instances of the same server process.
 *
 * Gated on `E2E_EMAIL_CAPTURE`, with `VERCEL_ENV !== "production"` as an
 * independent second guard — `NODE_ENV` is not a safe signal here, since
 * `next start` (which the e2e suite runs against) sets it to `"production"`
 * regardless of environment.
 */
import type { Notifier, OutboundEmail } from "@bdas/notifications";

const CAPTURE_KEY = Symbol.for("@bdas/web:e2e-email-capture");
type CaptureStore = { [CAPTURE_KEY]?: Map<string, OutboundEmail> };

function captureMap(): Map<string, OutboundEmail> {
  const store = globalThis as unknown as CaptureStore;
  return (store[CAPTURE_KEY] ??= new Map());
}

export function e2eEmailCaptureEnabled(): boolean {
  return process.env["E2E_EMAIL_CAPTURE"] === "true" && process.env["VERCEL_ENV"] !== "production";
}

/** No-op passthrough when capture is disabled — zero behavior change in production. */
export function withE2ECapture(notifier: Notifier): Notifier {
  if (!e2eEmailCaptureEnabled()) return notifier;
  return {
    async send(email: OutboundEmail): Promise<void> {
      captureMap().set(email.to.toLowerCase(), email);
      await notifier.send(email);
    },
  };
}

export function getCapturedEmail(to: string): OutboundEmail | undefined {
  return captureMap().get(to.toLowerCase());
}
