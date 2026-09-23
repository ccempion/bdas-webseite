import { NextResponse, type NextRequest } from "next/server";

import { hasStagingPassword } from "./lib/staging";

/**
 * Password gate for staging (ADR 0053). Every Vercel preview deployment is
 * staging; production never enters the gate. Fails closed: a preview without
 * STAGING_PASSWORD serves nothing. The browser's Basic-Auth dialog asks for a
 * username too — any value is accepted, only the password is checked.
 */
export function middleware(request: NextRequest): NextResponse {
  if (process.env["VERCEL_ENV"] !== "preview") return NextResponse.next();

  const password = process.env["STAGING_PASSWORD"];
  if (!password) {
    return new NextResponse("Staging ist nicht konfiguriert (STAGING_PASSWORD fehlt).", {
      status: 503,
    });
  }

  if (!hasStagingPassword(request.headers.get("authorization"), password)) {
    return new NextResponse("Passwort erforderlich.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="BDAS Staging", charset="UTF-8"' },
    });
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};
