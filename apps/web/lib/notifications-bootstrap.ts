import { getUserExport } from "@bdas/auth";
import { getDb, type Db } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getMember } from "@bdas/members";
import {
  consoleNotifier,
  createResendNotifier,
  registerNotificationSubscribers,
  setNotifier,
  setRecipientResolver,
  type RecipientContact,
} from "@bdas/notifications";

let booted = false;

/**
 * Idempotent bootstrap. Wires the notifications Notifier + RecipientResolver
 * and subscribes to the event bus — but only when the `notifications` flag is
 * on, so the module is inert in production until acceptance-complete (rule 6
 * applied to a non-route module).
 */
export function bootNotifications(): void {
  if (booted) return;
  booted = true;

  if (!isFlagOn("notifications")) return;

  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM_EMAIL"];
  setNotifier(apiKey && from ? createResendNotifier({ apiKey, from }) : consoleNotifier);

  setRecipientResolver({
    async resolve(db: Db, memberId: string): Promise<RecipientContact | null> {
      const member = await getMember(db, memberId);
      if (!member) return null;
      // `getUserExport` is reused as a contact lookup for this slice; it returns
      // the full GDPR-export shape. Follow-up: add a dedicated
      // `auth.getUserContact` when auth email is reconciled into notifications.
      const user = await getUserExport(db, member.userId);
      if (!user) return null;
      return { email: user.email, firstName: member.firstName };
    },
  });

  registerNotificationSubscribers(getDb());
}
