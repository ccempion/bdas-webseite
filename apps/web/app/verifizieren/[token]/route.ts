import { NextResponse } from "next/server";

import { verifyEmail, COOKIE_MAX_AGE_SECONDS, COOKIE_NAME, type VerifyResult } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";

import { VERIFY_COOKIE_NAME } from "../../../lib/auth-cookie";
import { onboardingEnabled } from "../../_onboarding/flag";
import { resolveOnboardingLanding } from "../../_onboarding/landing";

/**
 * GET /verifizieren/<token> — löst den Bestätigungslink ein.
 *
 * Ein Route Handler, kein Server Component: die Sitzung wird hier gesetzt, und
 * Next.js lässt `Set-Cookie` nur aus einem Handler oder einer Server Action zu.
 * Alles andere (zweiter Klick, ungültiger Link, Bestätigung in einem anderen
 * Browser) landet auf `/verifizieren`.
 */
export async function GET(
  request: Request,
  { params }: { params: { token: string } },
): Promise<NextResponse> {
  if (!isFlagOn("auth")) return new NextResponse("Not Found", { status: 404 });

  const base = process.env["PUBLIC_SITE_URL"] ?? new URL(request.url).origin;
  const h = request.headers;
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "0.0.0.0";
  const userAgent = h.get("user-agent") ?? undefined;
  // Der Token, den dieser Browser bei der Registrierung bekommen hat. Stimmt er
  // mit dem Link überein, meldet die Bestätigung an; sonst nicht (ADR 0051).
  const browserToken = readVerifyCookie(h);

  let result: VerifyResult;
  try {
    result = await verifyEmail(getDb(), params.token, {
      ip,
      ...(userAgent !== undefined ? { userAgent } : {}),
      ...(browserToken !== undefined ? { browserToken } : {}),
    });
  } catch {
    return NextResponse.redirect(new URL("/verifizieren?status=ungueltig", base));
  }

  if (result.alreadyVerified) {
    return NextResponse.redirect(new URL("/verifizieren?status=bereits", base));
  }

  if (result.sessionToken === null) {
    // Bestätigt, aber in einem anderen Browser als dem der Registrierung: die
    // Anmeldung führt von dort weiter, auf jedem Gerät.
    return clearVerifyCookie(NextResponse.redirect(new URL("/verifizieren?status=aktiv", base)));
  }

  // Das Ziel rechnet der Server aus, nichts davon kommt aus der URL.
  const target = onboardingEnabled()
    ? ((await resolveOnboardingLanding(getDb(), result.userId)) ?? "/account")
    : isFlagOn("profile")
      ? "/profil"
      : "/account";

  const response = clearVerifyCookie(NextResponse.redirect(new URL(target, base)));
  // Direkt auf der Antwort setzen: `cookies().set()` plus
  // `NextResponse.redirect()` verliert den Set-Cookie-Header (siehe
  // `app/abmelden/route.ts`).
  response.cookies.set({
    name: COOKIE_NAME,
    value: result.sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

function readVerifyCookie(h: Headers): string | undefined {
  const raw = h.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === VERIFY_COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Der Token ist verbraucht, also hat der Browser ihn nicht mehr zu behalten. */
function clearVerifyCookie(response: NextResponse): NextResponse {
  response.cookies.set({ name: VERIFY_COOKIE_NAME, value: "", path: "/", maxAge: 0 });
  return response;
}
