/**
 * Resend driver for the Notifier interface. Composition wires it in
 * `apps/web` if RESEND_API_KEY is set; otherwise consoleNotifier is used.
 */
import { Resend } from "resend";

import type { AuthMessage, Notifier } from "./notifier";

export type ResendNotifierOptions = {
  readonly apiKey: string;
  readonly from: string;
};

export function createResendNotifier(opts: ResendNotifierOptions): Notifier {
  const client = new Resend(opts.apiKey);
  return {
    async send(message: AuthMessage): Promise<void> {
      const { subject, html, text } = render(message);
      const { error } = await client.emails.send({
        from: opts.from,
        to: message.to,
        subject,
        html,
        text,
      });
      if (error) throw new Error(error.message ?? JSON.stringify(error));
    },
  };
}

function render(message: AuthMessage): { subject: string; html: string; text: string } {
  if (message.kind === "verify") {
    return {
      subject: "BDAS — E-Mail bestätigen",
      text: `Hallo,\n\nbitte bestätige deine E-Mail-Adresse über den folgenden Link:\n\n${message.verifyUrl}\n\nDer Link ist 24 Stunden gültig.\n`,
      html: `<p>Hallo,</p><p>bitte bestätige deine E-Mail-Adresse über den folgenden Link:</p><p><a href="${message.verifyUrl}">${message.verifyUrl}</a></p><p>Der Link ist 24 Stunden gültig.</p>`,
    };
  }
  if (message.kind === "changed") {
    return {
      subject: "BDAS — Passwort geändert",
      text: `Hallo,\n\ndein BDAS-Passwort wurde soeben geändert. Alle anderen Geräte wurden abgemeldet.\n\nWarst du das nicht? Dann setze dein Passwort sofort über „Passwort vergessen“ auf der Anmeldeseite zurück und melde dich bei deinem lokalen Vorstand.\n`,
      html: `<p>Hallo,</p><p>dein BDAS-Passwort wurde soeben geändert. Alle anderen Geräte wurden abgemeldet.</p><p>Warst du das nicht? Dann setze dein Passwort sofort über &bdquo;Passwort vergessen&ldquo; auf der Anmeldeseite zurück und melde dich bei deinem lokalen Vorstand.</p>`,
    };
  }
  if (message.kind === "reset") {
    return {
      subject: "BDAS — Passwort zurücksetzen",
      text: `Hallo,\n\nüber den folgenden Link kannst du ein neues Passwort vergeben:\n\n${message.resetUrl}\n\nDer Link ist 1 Stunde gültig. Wenn du keine Zurücksetzung angefordert hast, kannst du diese E-Mail ignorieren.\n`,
      html: `<p>Hallo,</p><p>über den folgenden Link kannst du ein neues Passwort vergeben:</p><p><a href="${message.resetUrl}">${message.resetUrl}</a></p><p>Der Link ist 1 Stunde gültig. Wenn du keine Zurücksetzung angefordert hast, kannst du diese E-Mail ignorieren.</p>`,
    };
  }
  if (message.kind === "email-change-verify") {
    return {
      subject: "BDAS — Neue E-Mail-Adresse bestätigen",
      text: `Hallo,\n\nfür dein BDAS-Konto wurde eine neue Login-E-Mail-Adresse angefordert. Bestätige sie über den folgenden Link:\n\n${message.confirmUrl}\n\nDer Link ist 1 Stunde gültig. Danach wirst du auf allen Geräten abgemeldet und musst dich mit der neuen Adresse erneut anmelden.\n`,
      html: `<p>Hallo,</p><p>für dein BDAS-Konto wurde eine neue Login-E-Mail-Adresse angefordert. Bestätige sie über den folgenden Link:</p><p><a href="${message.confirmUrl}">${message.confirmUrl}</a></p><p>Der Link ist 1 Stunde gültig. Danach wirst du auf allen Geräten abgemeldet und musst dich mit der neuen Adresse erneut anmelden.</p>`,
    };
  }
  return {
    subject: "BDAS — Änderung der Login-E-Mail angefordert",
    text: `Hallo,\n\nfür dein BDAS-Konto wurde eine Änderung der Login-E-Mail-Adresse auf ${message.newEmail} angefordert.\n\nWarst du das nicht? Dann ändere dein Passwort sofort über „Passwort vergessen“ auf der Anmeldeseite und melde dich bei deinem lokalen Vorstand. Ohne Bestätigung über den Link an die neue Adresse ändert sich nichts an deinem Konto.\n`,
    html: `<p>Hallo,</p><p>für dein BDAS-Konto wurde eine Änderung der Login-E-Mail-Adresse auf ${message.newEmail} angefordert.</p><p>Warst du das nicht? Dann ändere dein Passwort sofort über &bdquo;Passwort vergessen&ldquo; auf der Anmeldeseite und melde dich bei deinem lokalen Vorstand. Ohne Bestätigung über den Link an die neue Adresse ändert sich nichts an deinem Konto.</p>`,
  };
}
