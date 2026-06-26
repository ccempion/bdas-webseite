import type { TemplateData, TransactionalTemplate } from "./types";

export type RenderedEmail = {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

/** German transactional copy. One entry per TransactionalTemplate. */
export function render(template: TransactionalTemplate, data: TemplateData): RenderedEmail {
  const { firstName, eventTitle, eventUrl } = data;
  // While the recipient is on the event, offer a link to manage/cancel it.
  const manage = eventUrl
    ? { label: "Du kannst dich jederzeit über die Veranstaltungsseite abmelden:", url: eventUrl }
    : undefined;
  switch (template) {
    case "event_registration_confirmed":
      return body(
        "BDAS — Anmeldung bestätigt",
        firstName,
        `deine Anmeldung für „${eventTitle}“ ist bestätigt. Wir freuen uns auf dich!`,
        manage,
      );
    case "event_waitlisted":
      return body(
        "BDAS — Auf der Warteliste",
        firstName,
        `„${eventTitle}“ ist aktuell ausgebucht. Du stehst auf der Warteliste und rückst automatisch nach, sobald ein Platz frei wird.`,
        manage,
      );
    case "event_deregistration_confirmed":
      return body(
        "BDAS — Abmeldung bestätigt",
        firstName,
        `deine Abmeldung von „${eventTitle}“ ist eingegangen. Schade, dass es nicht klappt — vielleicht beim nächsten Mal.`,
      );
    case "event_waitlist_promoted":
      return body(
        "BDAS — Platz frei geworden",
        firstName,
        `gute Nachrichten: Bei „${eventTitle}“ ist ein Platz frei geworden und du bist nachgerückt. Deine Teilnahme ist jetzt bestätigt.`,
        manage,
      );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function body(
  subject: string,
  firstName: string,
  line: string,
  action?: { label: string; url: string },
): RenderedEmail {
  const actionText = action ? `\n\n${action.label}\n${action.url}` : "";
  const text = `Hallo ${firstName},\n\n${line}${actionText}\n\nViele Grüße\nDein BDAS-Team\n`;
  const actionHtml = action
    ? `<p>${escapeHtml(action.label)}<br><a href="${escapeHtml(action.url)}">${escapeHtml(action.url)}</a></p>`
    : "";
  const html =
    `<p>Hallo ${escapeHtml(firstName)},</p>` +
    `<p>${escapeHtml(line)}</p>` +
    actionHtml +
    `<p>Viele Grüße<br>Dein BDAS-Team</p>`;
  return { subject, text, html };
}
