import { notFound, redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { listEntries, listTopics } from "@bdas/faq";

import { SECTIONS } from "../../content/faq";
import { assembleFaq } from "../../lib/faq/assemble";
import { faqEnabled } from "../../lib/faq/enabled";
import { highlightedVorstandSubgroups, orderSections } from "../../lib/faq/order";
import { isVisibleTo, narrowSubgroups } from "../../lib/faq/visibility";
import { loadCurrentMember } from "../_dashboard/session";
import { FaqExplorer } from "./FaqExplorer";
import { FaqSectionView } from "./FaqSection";

// Reads the per-request session to order sections by role; must render at
// request time (mirrors the root layout's rationale).
export const dynamic = "force-dynamic";

type Me = NonNullable<Awaited<ReturnType<typeof loadCurrentMember>>>;

function StaticFaq({ me }: { me: Me }) {
  // Only the sections/subgroups the viewer's own grants admit — see
  // lib/faq/visibility.ts. Ordering (and which of the visible sections opens
  // by default) is unaffected: orderSections still runs over all four keys,
  // we just drop the ones visibility disallows before rendering.
  const ordered = orderSections(me.grants).filter(({ key }) =>
    isVisibleTo(SECTIONS[key].visibleTo, me.grants),
  );
  const highlighted = highlightedVorstandSubgroups(me.grants);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-bdas-ink">FAQ &amp; Hilfe</h1>
        <p className="mt-2 text-bdas-ink-muted">
          Wie die Plattform funktioniert — nach Rollen gegliedert. Dein Bereich steht oben und ist
          bereits geöffnet.
        </p>
      </header>

      <div>
        {ordered.map(({ key, defaultOpen }) => (
          <FaqSectionView
            key={key}
            section={narrowSubgroups(SECTIONS[key], me.grants)}
            defaultOpen={defaultOpen}
            highlightedSubgroups={highlighted}
          />
        ))}
      </div>
    </main>
  );
}

export default async function FaqPage() {
  if (!faqEnabled()) notFound();

  const me = await loadCurrentMember();
  if (!me) redirect("/anmelden");

  if (!isFlagOn("faq_suite")) return <StaticFaq me={me} />;

  const db = getDb();
  const [entries, topics] = await Promise.all([
    listEntries(db, { status: "published" }),
    listTopics(db),
  ]);
  const { sections, topics: usedTopics } = assembleFaq({ entries, topics, grants: me.grants });

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-bdas-ink">FAQ &amp; Hilfe</h1>
        <p className="mt-2 text-bdas-ink-muted">
          Wie die Plattform funktioniert — durchsuchbar, nach Rollen gegliedert.
        </p>
      </header>
      <FaqExplorer sections={sections} topics={usedTopics} />
    </main>
  );
}
