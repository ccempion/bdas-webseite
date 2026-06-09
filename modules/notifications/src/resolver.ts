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

let _resolver: RecipientResolver = unconfigured;

export function getRecipientResolver(): RecipientResolver {
  return _resolver;
}

/** Composition-time wiring. apps/web calls this at boot. */
export function setRecipientResolver(r: RecipientResolver): void {
  _resolver = r;
}
