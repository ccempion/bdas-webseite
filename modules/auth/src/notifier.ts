/**
 * Outbound email used by auth flows. The interface is the public contract;
 * the app composes a concrete driver at boot. For tests and dev without
 * RESEND_API_KEY, `consoleNotifier` writes to stdout.
 */

export type VerifyEmailMessage = {
  readonly kind: "verify";
  readonly to: string;
  readonly verifyUrl: string;
};

export type ResetPasswordMessage = {
  readonly kind: "reset";
  readonly to: string;
  readonly resetUrl: string;
};

export type AuthMessage = VerifyEmailMessage | ResetPasswordMessage;

export interface Notifier {
  send(message: AuthMessage): Promise<void>;
}

export const consoleNotifier: Notifier = {
  async send(message: AuthMessage): Promise<void> {
    if (message.kind === "verify") {
      console.log(`[auth] verify ${message.to} → ${message.verifyUrl}`);
    } else {
      console.log(`[auth] reset  ${message.to} → ${message.resetUrl}`);
    }
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
