import { cookies } from "next/headers";

import { COOKIE_MAX_AGE_SECONDS, COOKIE_NAME } from "@bdas/auth";

export function setSessionCookie(jwt: string): void {
  const isProd = process.env["NODE_ENV"] === "production";
  cookies().set({
    name: COOKIE_NAME,
    value: jwt,
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(): void {
  cookies().set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

export function readSessionCookie(): string | undefined {
  return cookies().get(COOKIE_NAME)?.value;
}
