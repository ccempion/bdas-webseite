/**
 * Resolves account ids to their *current* login address.
 *
 * Email is owned by `modules/auth` and identity by `modules/members`
 * (CLAUDE.md §1 rule 1), so this module depends on a composition-time
 * interface rather than importing either. apps/web wires the concrete
 * resolver at boot. Batched on purpose: the board list and the CSV export
 * resolve hundreds of rows and must not fan out into N+1 queries.
 *
 * Backed by globalThis (Symbol.for) for the same reason as the event bus in
 * `965b043`: Next bundles `instrumentation.ts` separately from route handlers,
 * so a module-level `let` written at boot is invisible to a Server Action.
 */
import type { Db } from "@bdas/db";

export interface AccountEmailResolver {
  resolve(db: Db, userIds: readonly string[]): Promise<Map<string, string>>;
}

/** No resolver wired (flag off, or boot skipped): resolve nothing. Callers
 *  then fall back to the stored duplicate key, which is never wrong, only
 *  possibly stale. */
const unconfigured: AccountEmailResolver = {
  async resolve(): Promise<Map<string, string>> {
    return new Map();
  },
};

const RESOLVER_KEY = Symbol.for("@bdas/newsletter:account-email-resolver");
type ResolverStore = { [RESOLVER_KEY]?: AccountEmailResolver };
function resolverStore(): ResolverStore {
  return globalThis as unknown as ResolverStore;
}

export function getAccountEmailResolver(): AccountEmailResolver {
  return resolverStore()[RESOLVER_KEY] ?? unconfigured;
}

/** Composition-time wiring. apps/web calls this at boot. */
export function setAccountEmailResolver(r: AccountEmailResolver): void {
  resolverStore()[RESOLVER_KEY] = r;
}

/** Convenience for the single-row case. Returns null when unresolvable. */
export async function resolveOne(db: Db, userId: string): Promise<string | null> {
  const map = await getAccountEmailResolver().resolve(db, [userId]);
  return map.get(userId) ?? null;
}
