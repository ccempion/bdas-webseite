/**
 * Resolves a userId (the identity the account-deletion orchestrator holds)
 * to this member's id (the identity `files`/`folders`/`file_access_log`
 * actually key on). `files` doesn't read `members` directly (CLAUDE.md §1
 * rule 1) — apps/web composes the real resolver at boot from
 * members.getMemberByUserId, same shape as
 * modules/notifications/src/resolver.ts's MemberIdResolver.
 */
import type { Db } from "@bdas/db";

export interface MemberIdResolver {
  resolveMemberId(db: Db, userId: string): Promise<string | null>;
}

const unconfigured: MemberIdResolver = {
  async resolveMemberId(): Promise<string | null> {
    return null;
  },
};

// Backed by globalThis (Symbol.for) for the same reason as the notifications
// resolver: a direct call from a cron route runs in a different module
// instance than the `instrumentation.ts` boot that wired this, so a
// module-level `let` would read `unconfigured` and silently no-op every purge.
const RESOLVER_KEY = Symbol.for("@bdas/files:member-id-resolver");
type ResolverStore = { [RESOLVER_KEY]?: MemberIdResolver };
function resolverStore(): ResolverStore {
  return globalThis as unknown as ResolverStore;
}

export function getMemberIdResolver(): MemberIdResolver {
  return resolverStore()[RESOLVER_KEY] ?? unconfigured;
}

/** Composition-time wiring. apps/web calls this at boot. */
export function setMemberIdResolver(r: MemberIdResolver): void {
  resolverStore()[RESOLVER_KEY] = r;
}
