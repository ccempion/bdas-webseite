import type { Db } from "@bdas/db";
import { createId } from "@bdas/id";

import { getNotifier } from "../notifier";
import { getRecipientResolver } from "../resolver";
import { notificationLog } from "../schema";
import { render } from "../templates";
import type { EventChangeKind, SendResult, TemplateData, TransactionalTemplate } from "../types";

/**
 * Resolve the recipient, render the template, send via the composed Notifier,
 * and write one audit row. Transactional mail is non-optional (spec §16), so
 * no preference check. A send failure is recorded as a 'failed' row rather than
 * thrown, so the common email-delivery error never disrupts the caller.
 * (Resolver and DB-insert errors still propagate to direct callers; the bus
 * subscriber wraps each handler in `safe()` so they never escape into the
 * producer — see subscribers.ts.)
 *
 * `extra.eventTitle` supplies the event name for the template; callers that
 * have it (the subscribers) pass it so the service stays free of cross-module
 * reads. `eventId` is stored for correlation only.
 *
 * Returns `null` (no send, no log) when the recipient cannot be resolved.
 */
export async function sendTransactional(
  db: Db,
  template: TransactionalTemplate,
  toMemberId: string,
  extra: {
    readonly eventTitle?: string | undefined;
    readonly eventId?: string | undefined;
    readonly eventUrl?: string | undefined;
    readonly changes?: ReadonlyArray<EventChangeKind> | undefined;
    readonly subject?: string | undefined;
    readonly messageBody?: string | undefined;
    readonly groupName?: string | undefined;
  },
): Promise<SendResult | null> {
  const contact = await getRecipientResolver().resolve(db, toMemberId);
  if (!contact) return null; // unresolvable recipient — nothing to send, nothing to log

  const data: TemplateData = {
    firstName: contact.firstName,
    eventTitle: extra.eventTitle ?? "",
    eventUrl: extra.eventUrl,
    changes: extra.changes,
    subject: extra.subject,
    messageBody: extra.messageBody,
    groupName: extra.groupName,
  };
  const email = render(template, data);
  const id = createId("ntfy");

  let status: "sent" | "failed" = "sent";
  let error: string | null = null;
  try {
    await getNotifier().send({ to: contact.email, ...email });
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }

  await db.insert(notificationLog).values({
    id,
    memberId: toMemberId,
    channel: "email",
    template,
    toEmail: contact.email,
    subject: email.subject,
    status,
    error,
    eventId: extra.eventId ?? null,
  });

  return { status, logId: id };
}
