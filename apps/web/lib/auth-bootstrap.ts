import { consoleNotifier, createResendNotifier, setNotifier } from "@bdas/auth";

let booted = false;

/**
 * Idempotent bootstrap. Called once per process from the auth Server Actions
 * before any service is invoked. Wires the Notifier driver based on env.
 */
export function bootAuth(): void {
  if (booted) return;
  booted = true;

  // SSO is cross-domain only when the session cookie is scoped to `.bdas.de`
  // (ADR 0002). If this is unset in production the cookie becomes host-only and
  // WordPress at bdas.de silently never sees it. Fail loudly instead.
  if (process.env["NODE_ENV"] === "production" && !process.env["SSO_COOKIE_DOMAIN"]) {
    throw new Error(
      "SSO_COOKIE_DOMAIN must be set in production (e.g. '.bdas.de') — without it the " +
        "session cookie is host-only and WordPress SSO silently breaks. See ADR 0002.",
    );
  }

  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM_EMAIL"];

  setNotifier(apiKey && from ? createResendNotifier({ apiKey, from }) : consoleNotifier);
}
