/**
 * @bdas/notifications — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to other
 * workspaces. Internal files are not importable.
 *
 * Outbound communication: subscribes to module bus events (@bdas/events) and
 * sends transactional email through a composition-time Notifier. Owns the
 * `notification_log` table only.
 */

export {}; // populated as services land; final surface defined in Task 8
