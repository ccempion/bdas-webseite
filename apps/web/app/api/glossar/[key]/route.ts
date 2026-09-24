import { getDb } from "@bdas/db";
import { listEntriesByContext, listTopics } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { assembleFaq } from "../../../../lib/faq/assemble";
import { BEGRIFF_CONTEXT_PREFIX } from "../../../../lib/faq/contexts";
import { flattenSections } from "../../../../lib/faq/help";
import { glossarEintrag } from "../../../../lib/glossar/eintraege";

export const dynamic = "force-dynamic";

/**
 * The "Mehr dazu" target of one glossary term: the first FAQ entry pinned to
 * `begriff.<key>` that this viewer may see, or `null`. Fetched when a bubble
 * opens, not on page load (Spec 2026-09-24 §5). Signed-out viewers get
 * `null` — the FAQ itself is signed-in only.
 */
export async function GET(_req: Request, { params }: { params: { key: string } }) {
  const none = Response.json({ href: null });
  if (!isFlagOn("glossar") || !isFlagOn("faq_suite")) return none;
  if (!glossarEintrag(params.key)) return Response.json({ href: null }, { status: 404 });

  const session = readSessionCookie();
  if (!session) return none;
  const db = getDb();
  const me = await getCurrentMember(db, session);
  if (!me) return none;

  const [entries, topics] = await Promise.all([
    listEntriesByContext(db, `${BEGRIFF_CONTEXT_PREFIX}${params.key}`),
    listTopics(db),
  ]);
  // Same visibility as /faq and <FaqHinweis>: a board entry never becomes a
  // member's "Mehr dazu".
  const [first] = flattenSections(assembleFaq({ entries, topics, grants: me.grants }).sections);
  return Response.json({ href: first ? `/faq#${first.id}` : null });
}
