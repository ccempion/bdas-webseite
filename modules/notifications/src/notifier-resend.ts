/**
 * Resend driver for the Notifier interface. Composition wires it in apps/web
 * if RESEND_API_KEY is set; otherwise consoleNotifier is used.
 */
import { Resend } from "resend";

import type { Notifier, OutboundEmail } from "./notifier";

export type ResendNotifierOptions = {
  readonly apiKey: string;
  readonly from: string;
};

export function createResendNotifier(opts: ResendNotifierOptions): Notifier {
  const client = new Resend(opts.apiKey);
  return {
    async send(email: OutboundEmail): Promise<void> {
      const { error } = await client.emails.send({
        from: opts.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.attachments?.length
          ? {
              attachments: email.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
              })),
            }
          : {}),
      });
      if (error) throw new Error(error.message ?? JSON.stringify(error));
    },
  };
}
