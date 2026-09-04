import { and, desc, eq, sql } from "drizzle-orm";

import { NotFoundError, ValidationError } from "@bdas/errors";

import { faqSubmissions } from "../schema";
import { newId, type FaqSubmission, type FaqSubmissionStatus } from "../types";
import type { Db } from "./topics";

const MAX_QUESTION = 300;
const MAX_DETAILS = 2000;
/** A context is a route key like "dateien" — 200 chars is ample. */
const MAX_CONTEXT = 200;

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

function checkContext(context: string | undefined): string | null {
  if (context === undefined) return null;
  const c = context.trim();
  if (c.length > MAX_CONTEXT) {
    throw new ValidationError("Kontext zu lang.");
  }
  return c.length === 0 ? null : c;
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
  const context = checkContext(input.context);
  const [row] = await db
    .insert(faqSubmissions)
    .values({
      id: newId(),
      question,
      details,
      context,
      submittedBy: input.submittedBy,
    })
    .returning();
  return rowToSubmission(row!);
}

/**
 * Newest first, with `id` as a tie-breaker so two submissions written inside
 * the same clock tick still come back in a stable order.
 */
const SUBMISSION_ORDER = [desc(faqSubmissions.createdAt), desc(faqSubmissions.id)];

export async function listSubmissions(
  db: Db,
  opts?: { status?: FaqSubmissionStatus },
): Promise<FaqSubmission[]> {
  const rows = opts?.status
    ? await db
        .select()
        .from(faqSubmissions)
        .where(eq(faqSubmissions.status, opts.status))
        .orderBy(...SUBMISSION_ORDER)
    : await db
        .select()
        .from(faqSubmissions)
        .orderBy(...SUBMISSION_ORDER);
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
  // Guarded on `open`, like createEntry's submission link: discarding an
  // already-answered submission would clobber decided_by/decided_at while
  // entry_id still points at a live published entry.
  const [row] = await db
    .update(faqSubmissions)
    .set({ status: "discarded", decidedBy: input.decidedBy, decidedAt: new Date() })
    .where(and(eq(faqSubmissions.id, input.id), eq(faqSubmissions.status, "open")))
    .returning({ id: faqSubmissions.id });
  if (!row) throw new NotFoundError("Offene Anfrage nicht gefunden.");
}
