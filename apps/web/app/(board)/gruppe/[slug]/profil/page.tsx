import Link from "next/link";

import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroupBySlug } from "@bdas/groups";
import { contentMediaPublicUrl } from "@bdas/storage";

import { requireLeadScope } from "../../../../_dashboard/session";
import { GroupProfileForm } from "../../../_components/GroupProfileForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil" };

/** Master data of the lead's own group (#62). Gated to federal board and the
 *  group's `local_board_lead` — plain `local_board` delegates upward, matching
 *  the page-editing rule in ADR 0026. */
export default async function GroupProfilePage({ params }: { params: { slug: string } }) {
  await requireLeadScope(params.slug);
  const group = await getGroupBySlug(getDb(), params.slug);
  if (!group) return null;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Profil</h1>

      <GroupProfileForm
        groupId={group.id}
        slug={group.slug}
        initial={{
          name: group.name,
          city: group.city,
          contactEmail: group.contactEmail,
          instagramUrl: group.instagramUrl,
          websiteUrl: group.websiteUrl,
          location: group.location,
          imageKey: group.imageKey,
        }}
        initialImageUrl={group.imageKey ? contentMediaPublicUrl(group.imageKey) : null}
        revalidatePath={`/gruppe/${params.slug}/profil`}
      />

      <Card className="flex max-w-2xl flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-bdas-ink">Öffentliche Seite</h2>
          <p className="text-sm text-bdas-ink-body">
            Texte, Bilder und Abschnitte auf <code>/gruppen/{group.slug}</code> gestaltest du im
            Seiteneditor. Name, Stadt, Kontakt und Titelbild kommen aus dem Formular oben.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isFlagOn("content") ? (
            <Link
              href={`/gruppen/${group.slug}/bearbeiten`}
              className="rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface"
            >
              Seite gestalten
            </Link>
          ) : null}
          <Link
            href={`/gruppen/${group.slug}`}
            className="rounded-bdas-sm border border-bdas-strong px-3 py-2 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover"
          >
            Seite ansehen
          </Link>
        </div>
      </Card>
    </section>
  );
}
