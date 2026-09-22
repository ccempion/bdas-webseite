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

/**
 * Der Bestätigungstoken im Browser, der die Registrierung begonnen hat. Nur
 * wenn der Link in genau diesem Browser eingelöst wird, meldet die Bestätigung
 * an (ADR 0051): ein weitergegebener Link darf keine fremde Person in das Konto
 * seines Absenders setzen.
 */
export const VERIFY_COOKIE_NAME = "bdas_verify";

export function setVerifyCookie(token: string, ttlSeconds: number): void {
  cookies().set({
    name: VERIFY_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: ttlSeconds,
  });
}
