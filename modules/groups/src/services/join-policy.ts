import type { JoinPolicy } from "../types";

/**
 * Phase 1 stub per build plan §3 Sprint 2 — every group has no join fee
 * required. Phase 6 (payments) replaces this with a per-group lookup
 * against `groups.join_fee_*` columns added in a later migration.
 */
export function getJoinPolicy(_groupId: string): JoinPolicy {
  return { required: false };
}
