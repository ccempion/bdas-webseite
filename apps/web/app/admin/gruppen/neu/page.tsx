import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { getCurrentMember, requireFederalBoard } from "@bdas/members";

import { requireAuthFlag } from "../../../_auth/flag";
import { requireGroupsFlag } from "../../../_groups/flag";
import { requireMembersFlag } from "../../../_members/flag";
import { readSessionCookie } from "../../../../lib/auth-cookie";
import { GroupForm } from "../GroupForm";

export const metadata = { title: "Neue Gruppe" };

const EMPTY = {
  slug: "",
  name: "",
  city: "",
  contactEmail: "",
  instagramUrl: "",
  websiteUrl: "",
  status: "active",
};

export default async function NeueGruppePage() {
  requireAuthFlag();
  requireMembersFlag();
  requireGroupsFlag();

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) redirect("/anmelden");
  requireFederalBoard(me);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <p className="text-sm text-bdas-ink-muted">
        <Link href="/admin/gruppen" className="hover:underline">
          ← Zurück zur Übersicht
        </Link>
      </p>
      <h1 className="text-2xl font-semibold text-bdas-ink">Neue Gruppe anlegen</h1>
      <GroupForm initial={EMPTY} />
    </main>
  );
}
