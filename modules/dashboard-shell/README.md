# dashboard-shell

Pure logic for the board cockpit (Phase 3). Owns **no tables** (spec §13). Provides:

- `Scope` + `boardScopes(grants, groups)` — the scopes a user can switch between.
- `canAdministerBoard` / `canSeeFederalScope` / `canSeeGroupScope` — access predicates the `(board)` route-group layouts in `apps/web` call before rendering.

The React shell (sidebar, scope-switcher) and the `(board)` route group live in `apps/web/app/(board)/` and consume this module. Gated by the `dashboard` feature flag.
