import type { TemplateData, TransactionalTemplate } from "./types";

export type RenderedEmail = {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

/** German transactional copy. One entry per TransactionalTemplate. */
export function render(template: TransactionalTemplate, data: TemplateData): RenderedEmail {
  const { firstName, eventTitle, eventUrl, postTitle, postUrl, reportReason } = data;
  // While the recipient is on the event, offer a link to manage/cancel it.
  const manage = eventUrl
    ? { label: "Du kannst dich jederzeit über die Veranstaltungsseite abmelden:", url: eventUrl }
    : undefined;
  const details = eventUrl
    ? { label: "Alle aktuellen Details findest du hier:", url: eventUrl }
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
    case "event_changed":
      return body(
        "BDAS — Änderung bei einer Veranstaltung",
        firstName,
        `bei „${eventTitle}“ hat sich etwas geändert: ${changeSummary(data.changes)}. Bitte prüfe die aktualisierten Angaben.`,
        details,
      );
    case "event_cancelled":
      return body(
        "BDAS — Veranstaltung abgesagt",
        firstName,
        `leider müssen wir dir mitteilen, dass „${eventTitle}“ abgesagt wurde. Deine Anmeldung ist damit hinfällig — wir bitten um dein Verständnis.`,
      );
    case "event_organizer_message": {
      const subject = data.subject?.trim() || `BDAS — Nachricht zu „${eventTitle}“`;
      return body(subject, firstName, data.messageBody ?? "", details);
    }
    case "event_organizer_granted":
      return body(
        "BDAS — Du bist jetzt Veranstaltungs-Organisator:in",
        firstName,
        `du wurdest als Organisator:in für die Gruppe „${data.groupName ?? "deine Gruppe"}“ eingetragen. Du kannst ab sofort die Veranstaltungen dieser Gruppe anlegen und verwalten.`,
        eventUrl ? { label: "Zur Veranstaltungsverwaltung:", url: eventUrl } : undefined,
      );
    case "event_organizer_revoked":
      return body(
        "BDAS — Organisator:innen-Rolle entzogen",
        firstName,
        `deine Organisator:innen-Rolle für die Gruppe „${data.groupName ?? "deine Gruppe"}“ wurde entzogen. Du kannst die Veranstaltungen dieser Gruppe nicht mehr verwalten.`,
      );
    case "member_application_received":
      return body(
        "BDAS — Neue Bewerbung zur Prüfung",
        firstName,
        `es liegt eine neue Mitgliedsbewerbung${data.applicantName ? ` von ${data.applicantName}` : ""}${
          data.groupName ? ` für ${data.groupName}` : ""
        } vor. Bitte prüfe sie im Vorstandsbereich.`,
      );
    case "member_application_approved":
      return body(
        "BDAS — Du bist aufgenommen",
        firstName,
        "dein lokaler Vorstand hat deine Bewerbung angenommen — willkommen im BDAS! Deine Mitgliedschaft ist ab sofort aktiv.",
      );
    case "member_application_declined":
      // No reason is collected anywhere, so none is implied here.
      return body(
        "BDAS — Entscheidung über deine Bewerbung",
        firstName,
        "dein lokaler Vorstand hat deine Bewerbung geprüft und sie nicht angenommen. Wenn du dazu Fragen hast, wende dich gerne direkt an deine BDAS-Gruppe.",
    case "blog_post_reported":
      return body(
        "BDAS — Beitrag gemeldet",
        firstName,
        `der Beitrag „${postTitle ?? "ein Beitrag"}“ wurde gemeldet${
          reportReason ? ` (Grund: ${reportReason})` : ""
        }. Bitte prüfe ihn im Blog-Bereich.`,
        postUrl ? { label: "Zum Beitrag:", url: postUrl } : undefined,
      );
  }
}

/** German phrasing for which aspects of an event changed. */
function changeSummary(changes: ReadonlyArray<"time" | "location"> | undefined): string {
  const parts = (changes ?? []).map((c) => (c === "time" ? "Datum/Uhrzeit" : "Ort"));
  if (parts.length === 0) return "die Veranstaltungsdaten";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} und ${parts[parts.length - 1]}`;
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
