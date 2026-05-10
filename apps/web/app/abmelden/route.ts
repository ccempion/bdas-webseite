import { NextResponse } from "next/server";

import { getCurrentUser, logout } from "@bdas/auth";
import { getDb } from "@bdas/db";

import { clearSessionCookie, readSessionCookie } from "../../lib/auth-cookie.js";

/** POST /abmelden — revoke the current session and clear the cookie. */
export async function POST(): Promise<NextResponse> {
  const cookieValue = readSessionCookie();
  const me = await getCurrentUser(getDb(), cookieValue);
  if (me) {
    await logout(getDb(), { userId: me.id, sessionId: me.sessionId });
  }
  clearSessionCookie();
  return NextResponse.redirect(
    new URL("/", process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000"),
  );
}
