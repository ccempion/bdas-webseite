/**
 * Runs once before the suite. Clears the groups left behind by previous runs
 * so a local database that survives between runs behaves like CI's empty one —
 * see `deleteSeededGroups` for what accumulates and why it breaks unrelated
 * specs.
 *
 * Deliberately not a teardown: leaving the rows in place after a failure keeps
 * them available for inspection, and the next run starts clean either way.
 */
import { deleteSeededGroups } from "./helpers/db";

export default async function globalSetup(): Promise<void> {
  await deleteSeededGroups();
}
