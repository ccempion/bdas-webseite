import { NextResponse } from "next/server";

import { e2eEmailCaptureEnabled, getCapturedEmail } from "../../../../lib/e2e-email-capture";

/**
 * Test-only. Returns the last captured email sent to `?to=`, or 404 if
 * capture is disabled (always the case outside the e2e suite's own env —
 * see e2e-email-capture.ts) or nothing has been captured for that address.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!e2eEmailCaptureEnabled()) return new NextResponse("Not Found", { status: 404 });

  const to = new URL(request.url).searchParams.get("to");
  if (!to) return NextResponse.json({ error: "missing ?to=" }, { status: 400 });

  const email = getCapturedEmail(to);
  if (!email) return NextResponse.json({ error: "no captured email" }, { status: 404 });

  return NextResponse.json(email);
}
