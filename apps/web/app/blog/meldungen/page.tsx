import { notFound, redirect } from "next/navigation";

import { listOpenReports } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { isFederalBoard } from "@bdas/members";

import { requireBlogFlag } from "../../_blog/flag";
import { loadBlogMe } from "../../_blog/access";
import { DeletePostButton } from "../../_blog/DeletePostButton";
import { DismissReportButton } from "../../_blog/DismissReportButton";
import { formatDate } from "../../../lib/format";

export const metadata = { title: "Gemeldete Beiträge" };

export default async function ReportedPostsPage() {
  requireBlogFlag();

  const me = await loadBlogMe();
  if (!me) redirect("/anmelden");
  if (!isFederalBoard(me.grants)) notFound();

  const db = getDb();
  const reports = await listOpenReports(db);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Gemeldete Beiträge</h1>

      {reports.length === 0 ? (
        <Alert variant="info" title="Keine offenen Meldungen">
          Aktuell liegen keine Meldungen zur Prüfung vor.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-4">
          {reports.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-2 p-6">
                <a
                  href={`/blog/${r.postSlug}`}
                  className="font-semibold text-bdas-ink hover:text-bdas-red"
                >
                  {r.postTitle}
                </a>
                <p className="text-sm text-bdas-ink-muted">
                  Gemeldet am {formatDate(r.createdAt)}
                  {r.reason ? ` · Grund: ${r.reason}` : ""}
                </p>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <DeletePostButton postId={r.postId} />
                  <DismissReportButton reportId={r.id} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
