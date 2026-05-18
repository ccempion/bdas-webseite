import { cookies } from "next/headers";

import { COOKIE_MAX_AGE_SECONDS, COOKIE_NAME } from "@bdas/auth";

export function setSessionCookie(jwt: string): void {
  const isProd = process.env["NODE_ENV"] === "production";
  const domain = process.env["SSO_COOKIE_DOMAIN"] || undefined;
  cookies().set({
    name: COOKIE_NAME,
    value: jwt,
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    ...(domain ? { domain } : {}),
  });
}

export function clearSessionCookie(): void {
  const domain = process.env["SSO_COOKIE_DOMAIN"] || undefined;
  cookies().set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
    ...(domain ? { domain } : {}),
  });
}

export function readSessionCookie(): string | undefined {
  return cookies().get(COOKIE_NAME)?.value;
}
