/**
 * Outbound email for notifications. The interface is the public contract; the
 * app composes a concrete driver at boot (see notifier-resend.ts). For tests
 * and dev without RESEND_API_KEY, `consoleNotifier` writes to stdout.
 *
 * Unlike auth's Notifier (three fixed message kinds), this carries an
 * already-rendered email — templates.ts produces subject/text/html.
 */

export type OutboundEmail = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

export interface Notifier {
  send(email: OutboundEmail): Promise<void>;
}

export const consoleNotifier: Notifier = {
  async send(email: OutboundEmail): Promise<void> {
    console.log(`[notifications] → ${email.to}: ${email.subject}`);
  },
};

// Backed by globalThis (Symbol.for), not a module-level `let`. Next.js bundles
// `instrumentation.ts` separately from route handlers/server actions, so a
// plain module singleton wired at boot would be invisible to a direct send from
// a Server Action — the same gotcha that forced the event bus onto globalThis.
const NOTIFIER_KEY = Symbol.for("@bdas/notifications:notifier");
type NotifierStore = { [NOTIFIER_KEY]?: Notifier };
function notifierStore(): NotifierStore {
  return globalThis as unknown as NotifierStore;
}

export function getNotifier(): Notifier {
  return notifierStore()[NOTIFIER_KEY] ?? consoleNotifier;
}

/** Composition-time wiring. apps/web calls this at boot. */
export function setNotifier(n: Notifier): void {
  notifierStore()[NOTIFIER_KEY] = n;
}
