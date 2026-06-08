import { consoleNotifier, createResendNotifier, setNotifier } from "@bdas/auth";

let booted = false;

/**
 * Idempotent bootstrap. Called once per process from the auth Server Actions
 * before any service is invoked. Wires the Notifier driver based on env.
 */
export function bootAuth(): void {
  if (booted) return;
  booted = true;

  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM_EMAIL"];

  setNotifier(apiKey && from ? createResendNotifier({ apiKey, from }) : consoleNotifier);
}
