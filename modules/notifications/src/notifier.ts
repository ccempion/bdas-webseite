/**
 * Outbound email for notifications. The interface is the public contract; the
 * app composes a concrete driver at boot (see notifier-resend.ts). For tests
 * and dev without RESEND_API_KEY, `consoleNotifier` writes to stdout.
 *
 * Unlike auth's Notifier (two fixed message kinds), this carries an
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

let _notifier: Notifier = consoleNotifier;

export function getNotifier(): Notifier {
  return _notifier;
}

/** Composition-time wiring. apps/web calls this at boot. */
export function setNotifier(n: Notifier): void {
  _notifier = n;
}
