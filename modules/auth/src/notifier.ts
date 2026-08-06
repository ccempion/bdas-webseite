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

/** Sent after a signed-in user changes their password. Carries no link:
 *  by definition this mail also reaches someone whose account was taken
 *  over, and a token in it would be a fresh attack surface. */
export type PasswordChangedMessage = {
  readonly kind: "changed";
  readonly to: string;
};

export type AuthMessage = VerifyEmailMessage | ResetPasswordMessage | PasswordChangedMessage;

export interface Notifier {
  send(message: AuthMessage): Promise<void>;
}

export const consoleNotifier: Notifier = {
  async send(message: AuthMessage): Promise<void> {
    if (message.kind === "verify") {
      console.log(`[auth] verify ${message.to} → ${message.verifyUrl}`);
    } else if (message.kind === "reset") {
      console.log(`[auth] reset  ${message.to} → ${message.resetUrl}`);
    } else {
      console.log(`[auth] changed ${message.to}`);
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
