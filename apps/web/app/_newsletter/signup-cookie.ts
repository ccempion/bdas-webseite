import { cookies } from "next/headers";

/**
 * The account that just registered, kept for exactly one page: the second,
 * softer attempt on /registrieren/erfolg (spec §6).
 *
 * httpOnly, server-set, path-scoped to /registrieren and 15 minutes old at
 * most. Carries the user id as well as the address, so the second attempt can
 * write a `pending` row for THAT account and nothing else — see the reasoning
 * against a `?email=` parameter in ADR 0035's capture rules.
 *
 * Set only when the registration checkbox was left unticked.
 */
export const SIGNUP_COOKIE = "bdas_nl_signup";
const PATH = "/registrieren";
const MAX_AGE_S = 15 * 60;

export type PendingSignup = { readonly userId: string; readonly email: string };

export function setSignupCookie(signup: PendingSignup): void {
  cookies().set(SIGNUP_COOKIE, `${signup.userId}|${signup.email}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: PATH,
    maxAge: MAX_AGE_S,
  });
}

export function readSignupCookie(): PendingSignup | null {
  const raw = cookies().get(SIGNUP_COOKIE)?.value;
  if (!raw) return null;
  const at = raw.indexOf("|");
  if (at <= 0 || at === raw.length - 1) return null;
  return { userId: raw.slice(0, at), email: raw.slice(at + 1) };
}

/** Deleting needs the same path the cookie was written with. */
export function clearSignupCookie(): void {
  cookies().delete({ name: SIGNUP_COOKIE, path: PATH });
}
