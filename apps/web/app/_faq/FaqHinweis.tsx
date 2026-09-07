import Link from "next/link";

import { getDb } from "@bdas/db";
import { listEntriesByContext, listTopics } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";

import { loadCurrentMember } from "../_dashboard/session";
import { assembleFaq } from "../../lib/faq/assemble";
import { flattenSections } from "../../lib/faq/help";
import { FaqRichText } from "../faq/FaqRichText";

/** Spec §7: "kompaktes Accordion, max. 2–3 Einträge". */
const MAX_ENTRIES = 3;

/**
 * Targeted inline help beside a specific form. Use sparingly — the floating
 * panel is the standard way in (Spec §7). Renders nothing when the flag is
 * off, the viewer is signed out, or no visible entry is pinned to `context`.
 */
export async function FaqHinweis({ context }: { context: string }) {
  if (!isFlagOn("faq_suite")) return null;
  const me = await loadCurrentMember();
  if (!me) return null;

  const db = getDb();
  const [entries, topics] = await Promise.all([listEntriesByContext(db, context), listTopics(db)]);
  if (entries.length === 0) return null;

  // Same assembly as /faq and the help route — visibility is decided in one
  // place only (Spec §7).
  const { sections } = assembleFaq({ entries, topics, grants: me.grants });
  const visible = flattenSections(sections).slice(0, MAX_ENTRIES);
  if (visible.length === 0) return null;

  return (
    <aside className="rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card">
      <h2 className="mb-2 text-sm font-bold text-bdas-ink">Hilfe zu dieser Seite</h2>
      <div className="flex flex-col gap-2">
        {visible.map((e) => (
          <details key={e.id} className="bdas-accordion">
            <summary>{e.question}</summary>
            <div>
              <FaqRichText doc={e.body} />
            </div>
          </details>
        ))}
      </div>
      <Link
        href="/faq"
        className="mt-3 inline-block text-sm font-semibold text-bdas-red transition-colors duration-bdas-quick ease-bdas hover:underline"
      >
        Mehr im FAQ
      </Link>
    </aside>
  );
}
