/**
 * @bdas/profile — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to other
 * workspaces. Internal files (schema, services) are private.
 */
export {
  getProfile,
  saveProfile,
  clearProfilePhoto,
  canViewProfile,
  type Db,
} from "./services/profile";
export {
  ABSCHLUSSART_OPTIONS,
  GEFUNDEN_DURCH_OPTIONS,
  UNIVERSITIES,
  SONSTIGE,
  isKnownUniversity,
} from "./data";
export { SaveProfileFields } from "./types";
export type { MemberProfile, SaveProfileInput, ProfileActor } from "./types";
export type { ProfileEvent, ProfileCompleted, ProfileUpdated } from "./events";
