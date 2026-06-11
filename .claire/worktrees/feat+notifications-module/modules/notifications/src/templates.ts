import type { TemplateData, TransactionalTemplate } from "./types";

export type RenderedEmail = {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

/** German transactional copy. One entry per TransactionalTemplate. */
export function render(template: TransactionalTemplate, data: TemplateData): RenderedEmail {
  const { firstName, eventTitle } = data;
  switch (template) {
    case "event_registration_confirmed":
      return body(
        "BDAS — Anmeldung bestätigt",
        firstName,
        `deine Anmeldung für „${eventTitle}" ist bestätigt. Wir freuen uns auf dich!`,
      );
    case "event_waitlisted":
      return body(
        "BDAS — Auf der Warteliste",
        firstName,
        `„${eventTitle}" ist aktuell ausgebucht. Du stehst auf der Warteliste und rückst automatisch nach, sobald ein Platz frei wird.`,
      );
    case "event_deregistration_confirmed":
      return body(
        "BDAS — Abmeldung bestätigt",
        firstName,
        `deine Abmeldung von „${eventTitle}" ist eingegangen. Schade, dass es nicht klappt — vielleicht beim nächsten Mal.`,
      );
    case "event_waitlist_promoted":
      return body(
        "BDAS — Platz frei geworden",
        firstName,
        `gute Nachrichten: Bei „${eventTitle}" ist ein Platz frei geworden und du bist nachgerückt. Deine Teilnahme ist jetzt bestätigt.`,
      );
  }
}

function body(subject: string, firstName: string, line: string): RenderedEmail {
  const text = `Hallo ${firstName},\n\n${line}\n\nViele Grüße\nDein BDAS-Team\n`;
  const html =
    `<p>Hallo ${firstName},</p>` + `<p>${line}</p>` + `<p>Viele Grüße<br>Dein BDAS-Team</p>`;
  return { subject, text, html };
}
