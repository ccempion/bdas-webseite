/**
 * @bdas/dashboard-shell — pure board-cockpit logic (scope model + access
 * predicates). Owns no tables (spec §13). The React shell and route-group
 * layouts live in apps/web and consume this surface.
 */
export { boardScopes, type Scope } from "./scope";
export { canAdministerBoard, canSeeFederalScope, canSeeGroupScope } from "./access";
