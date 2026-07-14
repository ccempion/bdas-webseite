/**
 * Resolves a memberId to the contact details needed to send email. Email is
 * owned by `auth` and identity by `members` (CLAUDE.md §1 rule 1), so this
 * module depends on a composition-time interface rather than reading those
 * tables. apps/web wires the concrete resolver at boot from members.getMember
 * + auth.getUserExport.
 */
import type { Db } from "@bdas/db";

import type { RecipientContact } from "./types";

export interface RecipientResolver {
  resolve(db: Db, memberId: string): Promise<RecipientContact | null>;
}

const unconfigured: RecipientResolver = {
  async resolve(): Promise<RecipientContact | null> {
    // No resolver wired (e.g. flag off, or boot skipped). Treat as "cannot
    // resolve" so sends are skipped rather than throwing.
    return null;
  },
};

// Backed by globalThis (Symbol.for) for the same reason as the Notifier: a
// direct send from a Server Action runs in a different module instance than the
// `instrumentation.ts` boot that wired this, so a module-level `let` would read
// `unconfigured` and silently skip every send.
const RESOLVER_KEY = Symbol.for("@bdas/notifications:resolver");
type ResolverStore = { [RESOLVER_KEY]?: RecipientResolver };
function resolverStore(): ResolverStore {
  return globalThis as unknown as ResolverStore;
}

export function getRecipientResolver(): RecipientResolver {
  return resolverStore()[RESOLVER_KEY] ?? unconfigured;
}

/** Composition-time wiring. apps/web calls this at boot. */
export function setRecipientResolver(r: RecipientResolver): void {
  resolverStore()[RESOLVER_KEY] = r;
}
