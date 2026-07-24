import type { Db } from "@bdas/db";
import { createId } from "@bdas/id";

import { getNotifier } from "../notifier";
import { getRecipientResolver } from "../resolver";
import { notificationLog } from "../schema";
import { render } from "../templates";
import type { EventChangeKind, SendResult, TemplateData, TransactionalTemplate } from "../types";

type Extra = {
  readonly eventTitle?: string | undefined;
  readonly eventId?: string | undefined;
  readonly eventUrl?: string | undefined;
  readonly changes?: ReadonlyArray<EventChangeKind> | undefined;
  readonly subject?: string | undefined;
  readonly messageBody?: string | undefined;
  readonly groupName?: string | undefined;
  readonly applicantName?: string | undefined;
};

/** The resolved recipient: a member (memberId set) or a guest (memberId null). */
type Recipient = {
  readonly memberId: string | null;
  readonly email: string;
  readonly firstName: string;
};

/**
 * Render the template, send via the composed Notifier, and write one audit row.
 * Transactional mail is non-optional (spec §16), so no preference check. A send
 * failure is recorded as a 'failed' row rather than thrown, so the common
 * email-delivery error never disrupts the caller.
 */
async function sendToRecipient(
  db: Db,
  template: TransactionalTemplate,
  to: Recipient,
  extra: Extra,
): Promise<SendResult> {
  const data: TemplateData = {
    firstName: to.firstName,
    eventTitle: extra.eventTitle ?? "",
    eventUrl: extra.eventUrl,
    changes: extra.changes,
    subject: extra.subject,
    messageBody: extra.messageBody,
    groupName: extra.groupName,
    applicantName: extra.applicantName,
  };
  const email = render(template, data);
  const id = createId("ntfy");

  let status: "sent" | "failed" = "sent";
  let error: string | null = null;
  try {
    await getNotifier().send({ to: to.email, ...email });
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }

  await db.insert(notificationLog).values({
    id,
    memberId: to.memberId,
    channel: "email",
    template,
    toEmail: to.email,
    subject: email.subject,
    status,
    error,
    eventId: extra.eventId ?? null,
  });

  return { status, logId: id };
}

/**
 * Resolve a member recipient, then send. `extra.eventTitle` supplies the event
 * name for the template; callers that have it (the subscribers) pass it so the
 * service stays free of cross-module reads. `eventId` is stored for correlation.
 *
 * Returns `null` (no send, no log) when the recipient cannot be resolved.
 * (Resolver and DB-insert errors still propagate to direct callers; the bus
 * subscriber wraps each handler in `safe()` so they never escape into the
 * producer — see subscribers.ts.)
 */
export async function sendTransactional(
  db: Db,
  template: TransactionalTemplate,
  toMemberId: string,
  extra: Extra,
): Promise<SendResult | null> {
  const contact = await getRecipientResolver().resolve(db, toMemberId);
  if (!contact) return null; // unresolvable recipient — nothing to send, nothing to log
  return sendToRecipient(
    db,
    template,
    { memberId: toMemberId, email: contact.email, firstName: contact.firstName },
    extra,
  );
}

/**
 * Send to a non-member guest by raw email + name. No resolver (guests aren't in
 * `members`); the audit row is logged with a null `member_id` and `to_email` set
 * to the guest address. Used for event guest registrations (Slice 4).
 */
export async function sendTransactionalToGuest(
  db: Db,
  template: TransactionalTemplate,
  guest: { readonly email: string; readonly name?: string | null | undefined },
  extra: Extra,
): Promise<SendResult> {
  const firstName = (guest.name ?? "").trim() || "Gast";
  return sendToRecipient(db, template, { memberId: null, email: guest.email, firstName }, extra);
}
