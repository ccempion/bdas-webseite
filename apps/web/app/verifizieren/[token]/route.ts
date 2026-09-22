import { NextResponse } from "next/server";

import { verifyEmail, COOKIE_MAX_AGE_SECONDS, COOKIE_NAME, type VerifyResult } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";

import { onboardingEnabled } from "../../_onboarding/flag";
import { resolveOnboardingLanding } from "../../_onboarding/landing";

/**
 * GET /verifizieren/<token> — löst den Bestätigungslink ein.
 *
 * Ein Route Handler, kein Server Component: die Sitzung wird hier gesetzt, und
 * Next.js lässt `Set-Cookie` nur aus einem Handler oder einer Server Action zu.
 * Alles andere (zweiter Klick, ungültiger Link) landet auf `/verifizieren`.
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

  let result: VerifyResult;
  try {
    result = await verifyEmail(getDb(), params.token, {
      ip,
      ...(userAgent !== undefined ? { userAgent } : {}),
    });
  } catch {
    return NextResponse.redirect(new URL("/verifizieren?status=ungueltig", base));
  }

  if (result.alreadyVerified) {
    return NextResponse.redirect(new URL("/verifizieren?status=bereits", base));
  }

  // Der Link ist einmalig und befristet, also darf er anmelden (ADR 0051).
  // Das Ziel rechnet der Server aus, nichts davon kommt aus der URL.
  const target = onboardingEnabled()
    ? ((await resolveOnboardingLanding(getDb(), result.userId)) ?? "/account")
    : isFlagOn("profile")
      ? "/profil"
      : "/account";

  const response = NextResponse.redirect(new URL(target, base));
  if (result.sessionToken) {
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
  }
  return response;
}
