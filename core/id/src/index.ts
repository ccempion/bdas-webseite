import { nanoid } from "nanoid";

const PREFIX_PATTERN = /^[a-z]{2,5}$/;

/**
 * Generate an opaque ID with a 2-5 char lowercase prefix.
 * Example: createId("mem") → "mem_kFdL9Rk23mPx..."
 *
 * Convention: each module picks a prefix and uses it consistently
 * (mem = members, grp = groups, evt = events, fil = files, etc).
 */
export function createId(prefix: string, size = 21): string {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(
      `Invalid id prefix '${prefix}': must be 2-5 lowercase ASCII letters`,
    );
  }
  return `${prefix}_${nanoid(size)}`;
}

/** Type guard: checks whether an id has the expected prefix. */
export function hasPrefix<P extends string>(
  id: string,
  prefix: P,
): id is `${P}_${string}` {
  return id.startsWith(`${prefix}_`);
}
