import { desc, eq, sql } from "drizzle-orm";

import { NotFoundError, ValidationError } from "@bdas/errors";

import { faqSubmissions } from "../schema";
import { newId, type FaqSubmission, type FaqSubmissionStatus } from "../types";
import type { Db } from "./topics";

const MAX_QUESTION = 300;
const MAX_DETAILS = 2000;

function checkQuestion(question: string): string {
  const q = question.trim();
  if (q.length === 0 || q.length > MAX_QUESTION) {
    throw new ValidationError("Ungültige Frage.");
  }
  return q;
}

function checkDetails(details: string | undefined): string | null {
  if (details === undefined) return null;
  const d = details.trim();
  if (d.length > MAX_DETAILS) {
    throw new ValidationError("Details zu lang.");
  }
  return d.length === 0 ? null : d;
}

function rowToSubmission(r: typeof faqSubmissions.$inferSelect): FaqSubmission {
  return {
    id: r.id,
    question: r.question,
    details: r.details,
    context: r.context,
    submittedBy: r.submittedBy,
    status: r.status as FaqSubmissionStatus,
    entryId: r.entryId,
    createdAt: r.createdAt,
  };
}

export async function createSubmission(
  db: Db,
  input: { question: string; details?: string; context?: string; submittedBy: string },
): Promise<FaqSubmission> {
  const question = checkQuestion(input.question);
  const details = checkDetails(input.details);
  const [row] = await db
    .insert(faqSubmissions)
    .values({
      id: newId(),
      question,
      details,
      context: input.context ?? null,
      submittedBy: input.submittedBy,
    })
    .returning();
  return rowToSubmission(row!);
}

export async function listSubmissions(
  db: Db,
  opts?: { status?: FaqSubmissionStatus },
): Promise<FaqSubmission[]> {
  const rows = opts?.status
    ? await db
        .select()
        .from(faqSubmissions)
        .where(eq(faqSubmissions.status, opts.status))
        .orderBy(desc(faqSubmissions.createdAt))
    : await db.select().from(faqSubmissions).orderBy(desc(faqSubmissions.createdAt));
  return rows.map(rowToSubmission);
}

export async function openSubmissionCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(faqSubmissions)
    .where(eq(faqSubmissions.status, "open"));
  return row?.count ?? 0;
}

export async function discardSubmission(
  db: Db,
  input: { id: string; decidedBy: string },
): Promise<void> {
  const [row] = await db
    .update(faqSubmissions)
    .set({ status: "discarded", decidedBy: input.decidedBy, decidedAt: new Date() })
    .where(eq(faqSubmissions.id, input.id))
    .returning({ id: faqSubmissions.id });
  if (!row) throw new NotFoundError("Anfrage nicht gefunden.");
}
