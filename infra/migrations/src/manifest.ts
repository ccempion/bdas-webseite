/**
 * Per CLAUDE.md §3 (rule 7), each module owns its migrations under
 * modules/<name>/migrations/. The aggregator runs them in the order
 * declared *here* — never by directory walk. New modules append entries.
 *
 * Each entry is a module name (matching the `modules/<name>` folder).
 * Within a module, files are run in lexical order by filename
 * (so prefix them `0001_init.sql`, `0002_add_x.sql`, ...).
 *
 * Order is significant when one module's table is referenced by another's
 * foreign key (auth → members → groups → events → ...). When in doubt,
 * keep the dependency order from the spec's §10 ERD.
 */
export const MIGRATION_MANIFEST: ReadonlyArray<string> = [
  // Phase 1
  "auth",
  "groups",
  "members",
  // Phase 2
  "files",
  "notifications",
  "events",
  // Phase 3 onward — append as modules land.
  "content",
];
