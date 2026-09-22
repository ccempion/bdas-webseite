import { NextResponse } from "next/server";

import { cancelAccountDeletion } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";

/**
 * GET /konto-reaktivieren/<token> — cancels a pending deletion.
 *
 * Deliberately does not set a session cookie, unlike /verifizieren/[token]:
 * this link is meant to be opened from whatever device has the mailbox, not
 * necessarily the device that requested the deletion, and the whole point of
 * the check is that the requesting browser might not be the account owner.
 * Handing back a live session here would undo that.
 */
export async function GET(
  request: Request,
  { params }: { params: { token: string } },
): Promise<NextResponse> {
  if (!isFlagOn("account_deletion")) return new NextResponse("Not Found", { status: 404 });

  const base = process.env["PUBLIC_SITE_URL"] ?? new URL(request.url).origin;

  try {
    await cancelAccountDeletion(getDb(), params.token);
  } catch {
    return NextResponse.redirect(new URL("/konto-reaktivieren?status=ungueltig", base));
  }

  return NextResponse.redirect(new URL("/konto-reaktivieren?status=aktiv", base));
}
