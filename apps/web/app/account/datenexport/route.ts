import { NextResponse } from "next/server";

import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { requireAuthFlag } from "../../_auth/flag";
import { requireMembersFlag } from "../../_members/flag";
import { readSessionCookie } from "../../../lib/auth-cookie";
import { buildDataExport, principalFrom, toJson, toZip } from "../../../lib/data-export/assemble";
import { realReaders } from "../../../lib/data-export/readers";

/**
 * GET /account/datenexport — GDPR self-service export (ADR 0008).
 *
 * Returns a download (JSON, or ZIP with `?format=zip` while `account_deletion`
 * is on) of everything every module stores about the *authenticated* user.
 * Strictly scoped to the session principal — there is no id parameter, so it
 * cannot return another user's data.
 */
// Route handlers aren't covered by the parent layout's segment config, and this
// one reads the per-request session + DB, so it must opt out of static export.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  requireAuthFlag();
  requireMembersFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) {
    return NextResponse.redirect(
      new URL("/anmelden", process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000"),
    );
  }

  // The only request detail the route reads is `format`. Whose data is exported
  // comes from the session alone, via `principalFrom` — never from the URL.
  const format = new URL(request.url).searchParams.get("format");
  if (format === "zip" && !isFlagOn("account_deletion")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const data = await buildDataExport(realReaders(), principalFrom(me));
  if (format === "zip") {
    return new NextResponse(Buffer.from(toZip(data)), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="bdas-datenexport.zip"',
        "Cache-Control": "no-store",
      },
    });
  }
  return new NextResponse(toJson(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bdas-datenexport.json"',
      "Cache-Control": "no-store",
    },
  });
}
