import { NextResponse } from "next/server";

import { getCurrentUser, logout, COOKIE_NAME } from "@bdas/auth";
import { getDb } from "@bdas/db";

import { readSessionCookie } from "../../lib/auth-cookie";

/** POST /abmelden — revoke the current session and clear the cookie. */
export async function POST(): Promise<NextResponse> {
  const cookieValue = readSessionCookie();
  const me = await getCurrentUser(getDb(), cookieValue);
  if (me) {
    await logout(getDb(), { userId: me.id, sessionId: me.sessionId });
  }

  const url = new URL("/", process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000");
  const response = NextResponse.redirect(url);

  // Set the cookie directly on the response object — calling cookies().set()
  // then returning NextResponse.redirect() loses the Set-Cookie header in
  // Next.js Route Handlers.
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
