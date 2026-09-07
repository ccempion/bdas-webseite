import { getDb } from "@bdas/db";
import { listEntries, listTopics } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { assembleFaq, type FaqEntryView } from "../../../../lib/faq/assemble";
import { entriesForContext, flattenSections, popularFrom } from "../../../../lib/faq/help";

export const dynamic = "force-dynamic";

/** How many entries the "Beliebte Fragen" fallback offers (Spec §7). */
const POPULAR_LIMIT = 5;

export type FaqHelpEntry = {
  id: string;
  question: string;
  body: unknown;
  searchText: string;
  youtubeId: string | null;
};

/** Only what the panel renders — topic chips, related links and timestamps
 *  belong to /faq, not to a help sheet. */
function toHelpEntry(e: FaqEntryView): FaqHelpEntry {
  return {
    id: e.id,
    question: e.question,
    body: e.body,
    searchText: e.searchText,
    youtubeId: e.youtubeId,
  };
}

export async function GET(req: Request) {
  if (!isFlagOn("faq_suite")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const db = getDb();

  // The viewer comes from the session cookie only. The `context` query param
  // selects which entries are highlighted; it never widens what is returned.
  const session = readSessionCookie();
  if (!session) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  const me = await getCurrentMember(db, session);
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });

  const context = new URL(req.url).searchParams.get("context");

  const [entries, topics] = await Promise.all([
    listEntries(db, { status: "published" }),
    listTopics(db),
  ]);
  // Same assembly as /faq — one visibility implementation, so the panel can
  // never surface an entry the FAQ page would hide (Spec §7).
  const { sections } = assembleFaq({ entries, topics, grants: me.grants });
  const visible = flattenSections(sections);

  // Ids, not three overlapping arrays of whole entries: both subsets are
  // drawn from `entries`, and an entry carries its full Tiptap body plus the
  // same body again as lowercased `searchText`. The panel resolves them with
  // `pickByIds`.
  return Response.json({
    entries: visible.map(toHelpEntry),
    contextIds: entriesForContext(visible, context).map((e) => e.id),
    popularIds: popularFrom(visible, POPULAR_LIMIT).map((e) => e.id),
  });
}
