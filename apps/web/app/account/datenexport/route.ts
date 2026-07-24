import { NextResponse } from "next/server";

import { getUserExport } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { getProfile } from "@bdas/profile";

import { requireAuthFlag } from "../../_auth/flag";
import { requireMembersFlag } from "../../_members/flag";
import { readSessionCookie } from "../../../lib/auth-cookie";

/**
 * GET /account/datenexport — GDPR self-service export (ADR 0008).
 *
 * Returns a JSON download of everything the platform currently stores about
 * the *authenticated* user: their auth account row, member profile, and
 * effective role grants. Strictly scoped to the session principal — there is
 * no id parameter, so it cannot return another user's data. Phase-1 stub:
 * covers only the modules that exist (auth + members); the payload says so.
 */
// Route handlers aren't covered by the parent layout's segment config, and this
// one reads the per-request session + DB, so it must opt out of static export.
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  requireAuthFlag();
  requireMembersFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) {
    return NextResponse.redirect(
      new URL("/anmelden", process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000"),
    );
  }

  const account = await getUserExport(db, me.user.id);
  const profileData = isFlagOn("profile") ? await getProfile(db, me.user.id) : null;

  const payload = {
    exportedAt: new Date().toISOString(),
    notice:
      "Dieser Export enthält alle Daten, die die BDAS-Plattform derzeit über dich " +
      "gespeichert hat (Phase 1: Konto und Mitgliedsprofil). Weitere Module folgen.",
    account,
    profile: me.member,
    profileData,
    roleGrants: me.grants,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bdas-datenexport.json"',
      "Cache-Control": "no-store",
    },
  });
}
