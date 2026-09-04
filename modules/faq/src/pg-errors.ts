/**
 * Private to the faq module — not re-exported from index.ts.
 *
 * postgres-js puts the SQLSTATE in `code`; `23503` is foreign_key_violation.
 * Services map it to a German NotFoundError so a stale related-entry id or an
 * unknown topic id never escapes as a raw Postgres error.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string };
  return e.code === "23503";
}
