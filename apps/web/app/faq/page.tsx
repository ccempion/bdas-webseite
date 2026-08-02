import { notFound, redirect } from "next/navigation";

import { SECTIONS } from "../../content/faq";
import { faqEnabled } from "../../lib/faq/enabled";
import { highlightedVorstandSubgroups, orderSections } from "../../lib/faq/order";
import { loadCurrentMember } from "../_dashboard/session";
import { FaqSectionView } from "./FaqSection";

// Reads the per-request session to order sections by role; must render at
// request time (mirrors the root layout's rationale).
export const dynamic = "force-dynamic";

export const metadata = { title: "FAQ & Hilfe" };

export default async function FaqPage() {
  if (!faqEnabled()) notFound();

  const me = await loadCurrentMember();
  if (!me) redirect("/anmelden");

  const ordered = orderSections(me.grants);
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
            section={SECTIONS[key]}
            defaultOpen={defaultOpen}
            highlightedSubgroups={highlighted}
          />
        ))}
      </div>
    </main>
  );
}
