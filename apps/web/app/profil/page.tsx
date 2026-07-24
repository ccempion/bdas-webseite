import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { requireAuthFlag } from "../_auth/flag";
import { requireProfileFlag } from "../_profile/flag";
import { isProfileComplete } from "../_profile/complete";
import { readSessionCookie } from "../../lib/auth-cookie";
import { Wizard } from "./Wizard";

export const metadata = { title: "Profil vervollständigen" };

export default async function ProfilPage() {
  requireAuthFlag();
  requireProfileFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");
  if (await isProfileComplete(db, me.user.id)) redirect("/account");

  // Wizard is onboarding for pending members only. Active/inactive/alumni with
  // missing profile data backfill via /account (edit form), not the wizard.
  if (me.member?.status !== "pending") redirect("/account");

  const groups = await listGroups(db, { status: "active" });
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-bdas-ink">Profil vervollständigen</h1>
        <p className="text-bdas-ink-body">
          Nur noch ein paar Angaben, dann geht deine Bewerbung an deinen lokalen Vorstand.
        </p>
      </header>
      <Wizard groups={groups.map((g) => ({ id: g.id, name: g.name, city: g.city }))} />
    </main>
  );
}
