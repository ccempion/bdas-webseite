/**
 * @bdas/events-module — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to other
 * workspaces. Internal files are not importable.
 *
 * NB: the package is `@bdas/events-module`, not `@bdas/events` — that name is
 * taken by the core event bus (core/events). See the module README.
 */

export { listUpcomingEvents, listManagedEvents, type ListOpts } from "./services/list";
export { getEvent, canView, canManage, ANON, type Viewer } from "./services/get";
export { createEvent, updateEvent, publishEvent, cancelEvent, EventInput } from "./services/manage";
export { registerMember, cancelRegistration, getMyRegistration } from "./services/registration";

export { renderEventContentHtml, plainTextToDoc } from "./content";
export type { TiptapDoc, EventContent } from "./types";

export type {
  EventItem,
  EventRegistration,
  EventStatus,
  EventVisibility,
  RegistrationResult,
  EventWithCounts,
} from "./types";
export type {
  EventsEvent,
  EventPublished,
  EventCancelled,
  EventRegistered,
  EventDeregistered,
  WaitlistPromoted,
} from "./events";
