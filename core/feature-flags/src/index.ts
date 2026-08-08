import { AppError } from "@bdas/errors";

/**
 * Every business module declares its flag here. Routes that belong to a
 * module call `requireFlag(name)` so half-built modules can be merged
 * to main without exposing routes in production. Default is OFF.
 *
 * Env var format: BDAS_FLAG_<NAME_UPPER>=true
 */
export const FLAGS = [
  "auth",
  "members",
  "groups",
  "events",
  "files",
  "notifications",
  "projects",
  "blog",
  "blog_comments",
  "handover",
  "payments",
  "dashboard",
  "public_shell",
  "group_map",
  "content",
  "profile",
] as const;

export type FlagName = (typeof FLAGS)[number];

const FLAG_PREFIX = "BDAS_FLAG_";
const FEDERAL_BOARD_ENV = "BDAS_FEDERAL_BOARD_EMAILS";

/** Returns true if the env var for this flag is "true" or "1". */
export function isFlagOn(flag: FlagName): boolean {
  const raw = process.env[`${FLAG_PREFIX}${flag.toUpperCase()}`];
  return raw === "true" || raw === "1";
}

/** Throws a 404-equivalent error if the flag is off. Use at the route layer. */
export function requireFlag(flag: FlagName): void {
  if (!isFlagOn(flag)) {
    throw new AppError({
      code: "FEATURE_OFF",
      message: `Feature '${flag}' is not available`,
      statusCode: 404,
    });
  }
}

/**
 * Federal-board bootstrap allowlist.
 *
 * Emails on this list automatically receive the `federal_board` role grant
 * on first email-verified login. This is the bootstrap mechanism for
 * production: the very first board member gains access without any other
 * privileged user having to grant it. See docs/decisions/0001 follow-ups.
 *
 * Env: BDAS_FEDERAL_BOARD_EMAILS — comma-separated; whitespace trimmed,
 * comparison is case-insensitive.
 */
export function federalBoardEmailAllowlist(): ReadonlySet<string> {
  const raw = process.env[FEDERAL_BOARD_ENV] ?? "";
  if (!raw.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isFederalBoardEmail(email: string): boolean {
  return federalBoardEmailAllowlist().has(email.toLowerCase().trim());
}
