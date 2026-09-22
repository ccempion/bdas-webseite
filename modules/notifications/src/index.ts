/**
 * @bdas/notifications — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to other
 * workspaces. Internal files (schema, templates, services) are private.
 */

export { sendTransactional, sendTransactionalToGuest } from "./services/send";
export {
  sendOrganizerMessage,
  listBroadcastsForEvent,
  type OrganizerMessage,
  type BroadcastResult,
  type BroadcastLogEntry,
} from "./services/broadcast";
export { exportForUser, deleteLogForMember, type NotificationLogExportRow } from "./services/gdpr";
export { registerNotificationSubscribers } from "./subscribers";

export {
  consoleNotifier,
  getNotifier,
  setNotifier,
  type Notifier,
  type OutboundEmail,
  type EmailAttachment,
} from "./notifier";
export { createResendNotifier, type ResendNotifierOptions } from "./notifier-resend";
export {
  getRecipientResolver,
  setRecipientResolver,
  type RecipientResolver,
  getMemberIdResolver,
  setMemberIdResolver,
  type MemberIdResolver,
} from "./resolver";

export type { TransactionalTemplate, TemplateData, SendResult, RecipientContact } from "./types";
