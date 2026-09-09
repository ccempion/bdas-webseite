import { canSeeFederalScope } from "@bdas/dashboard-shell";
import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { getCurrentMember, listMembers } from "@bdas/members";
import { listSubscribers } from "@bdas/newsletter";

import { readSessionCookie } from "../../../../../lib/auth-cookie";
import { groupNamesByUserId } from "../../../../../lib/member-groups";
import { bootNewsletter } from "../../../../../lib/newsletter-bootstrap";
import { subscribersToCsv } from "../../../../../lib/subscribers-csv";
import { newsletterEnabled } from "../../../../_newsletter/flag";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * The subscriber list as a download, board-only (spec §8).
 *
 * Checks for itself instead of leaning on `requireFederalScope()`: that one
 * *redirects* to /account, and answering a file request with an HTML page is
 * the wrong answer. Every refusal here is a bare 404, like `roster.csv`.
 *
 * Always the whole list, never the filtered view — the filter lives in the
 * browser, and the program that opens this file can filter by itself.
 */
export async function GET(): Promise<Response> {
  if (!newsletterEnabled()) return notFound();
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me || !canSeeFederalScope(me.grants)) return notFound();

  // See the page: the resolver is wired here, not by `instrumentation.ts`.
  bootNewsletter();
  const [rows, members, groups] = await Promise.all([
    listSubscribers(db, {}),
    listMembers(db, {}),
    listGroups(db),
  ]);

  const day = new Date().toISOString().slice(0, 10);
  return new Response(subscribersToCsv(rows, groupNamesByUserId(members, groups)), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="newsletter-${day}.csv"`,
    },
  });
}
