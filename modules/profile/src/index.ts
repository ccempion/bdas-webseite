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
  setProfilePhoto,
  canViewProfile,
  type Db,
} from "./services/profile";
export {
  ABSCHLUSSART_OPTIONS,
  BDAJ_FUNKTION_OPTIONS,
  GEFUNDEN_DURCH_OPTIONS,
  STUDIENFACH_KATEGORIEN,
  STUDIENFACH_KATEGORIE_NAMES,
  UNIVERSITIES,
  SONSTIGE,
  canonicalUniversity,
  faecherIn,
  universityCity,
} from "./data";
export {
  AlumnusProfileFields,
  BdajProfileFields,
  FIELD_SETS,
  FoerdererProfileFields,
  isNutzertyp,
  MAX_INTERESSE,
  MAX_VORSTELLUNG,
  NUTZERTYPEN,
  PROFILE_FIELD_SCHEMAS,
  SaveProfileFields,
  StudentProfileFields,
} from "./types";
export type {
  AnyProfileFields,
  MemberProfile,
  Nutzertyp,
  ProfileActor,
  ProfileField,
  SaveProfileInput,
  SaveProfileResult,
} from "./types";
export type { ProfileEvent, ProfileCompleted, ProfileUpdated } from "./events";
