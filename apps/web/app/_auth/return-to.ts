/**
 * Support for "return to the originally requested page after login."
 *
 * `sanitizeReturnTo` is the open-redirect guard: only a same-origin path may
 * ever be honored, never a scheme-qualified or protocol-relative URL. Both
 * `/anmelden` (reflecting `?returnTo=` into the login form) and the login
 * Server Action (which sees raw form data an attacker could post directly)
 * call it independently — neither trusts the other's validation.
 */
const SAFE_INTERNAL_PATH = /^\/(?!\/)[^\s"'<>\\\p{C}]*$/u;

export function sanitizeReturnTo(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && SAFE_INTERNAL_PATH.test(raw) ? raw : null;
}

/** Build the `/anmelden` URL that carries a guard's own path as `returnTo`. */
export function buildAnmeldenUrl(path: string): string {
  return `/anmelden?returnTo=${encodeURIComponent(path)}`;
}
