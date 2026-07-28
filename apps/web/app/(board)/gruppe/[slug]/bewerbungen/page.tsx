import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroupChangeHistory, listIncomingGroupChanges } from "@bdas/members";
import { ABSCHLUSSART_OPTIONS, GEFUNDEN_DURCH_OPTIONS, getProfile } from "@bdas/profile";

import { requireGroupScope } from "../../../../_dashboard/session";
import { signedProfilePhotoUrl } from "../../../../_profile/photo-url";
import { ApplicationCard } from "../../../_components/ApplicationCard";
import { categoryLabel, REJECTION_CATEGORIES } from "../../../_components/rejection-categories";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bewerbungen" };

/** Stored keys are enum values; the board reads the German label. */
const label = (options: ReadonlyArray<{ value: string; label: string }>, key: string): string =>
  options.find((o) => o.value === key)?.label ?? key;

export default async function BewerbungenPage({ params }: { params: { slug: string } }) {
  const { me, groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const actor = { userId: me.user.id, grants: me.grants };
  const incoming = await listIncomingGroupChanges(db, groupId, actor);
  const profileFlagOn = isFlagOn("profile");

  const cards = await Promise.all(
    incoming.map(async (req) => {
      const profile = profileFlagOn ? await getProfile(db, req.member.userId) : null;
      const history = await getGroupChangeHistory(db, req.member.id, actor);
      const priorRejections = history.filter(
        (h) => h.status === "rejected" && h.toGroupId === groupId,
      );
      return {
        req,
        profile,
        photoUrl: await signedProfilePhotoUrl(profile?.photoStorageKey),
        priorRejections,
      };
    }),
  );

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-bdas-ink">Bewerbungen</h1>
        <p className="text-bdas-ink-body">
          {cards.length === 0
            ? "Zurzeit liegen keine Bewerbungen vor."
            : `${cards.length} offene ${cards.length === 1 ? "Bewerbung" : "Bewerbungen"}.`}
        </p>
      </header>

      {cards.map(({ req, profile, photoUrl, priorRejections }) => (
        <ApplicationCard
          key={req.id}
          requestId={req.id}
          slug={params.slug}
          canDecide={req.canDecide}
          name={`${req.member.firstName} ${req.member.lastName}`}
          isExistingMember={req.member.status === "active"}
          requestedAt={req.requestedAt}
          photoUrl={photoUrl}
          profile={
            profile
              ? {
                  uni: profile.uni,
                  studiengang: profile.studiengang,
                  abschlussart: label(ABSCHLUSSART_OPTIONS, profile.abschlussart),
                  geburtsdatum: profile.geburtsdatum,
                  gefundenDurch: label(GEFUNDEN_DURCH_OPTIONS, profile.gefundenDurch),
                  empfehlerName: profile.empfehlerName,
                }
              : null
          }
          priorRejections={priorRejections.map((r) => ({
            decidedAt: r.decidedAt,
            categoryLabel: categoryLabel(r.reasonCategory),
          }))}
          categories={REJECTION_CATEGORIES}
        />
      ))}
    </main>
  );
}
