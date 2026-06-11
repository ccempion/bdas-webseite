/**
 * @bdas/notifications — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to other
 * workspaces. Internal files (schema, templates, services) are private.
 */

export { sendTransactional } from "./services/send";
export { registerNotificationSubscribers } from "./subscribers";

export {
  consoleNotifier,
  getNotifier,
  setNotifier,
  type Notifier,
  type OutboundEmail,
} from "./notifier";
export { createResendNotifier, type ResendNotifierOptions } from "./notifier-resend";
export { getRecipientResolver, setRecipientResolver, type RecipientResolver } from "./resolver";

export type { TransactionalTemplate, TemplateData, SendResult, RecipientContact } from "./types";
