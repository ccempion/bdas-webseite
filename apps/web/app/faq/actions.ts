"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError, UnauthorizedError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { createSubmission, upsertFeedback } from "@bdas/faq";
import { getCurrentMember, type CurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";
import { FAQ_CONTEXTS } from "../../lib/faq/contexts";

export type FaqActionResult = { ok: true } | { ok: false; error: string };

/**
 * The two writes Spec §4 opens to every signed-in member. Unlike the board
 * actions in (board)/federal/faq/actions.ts there is no role check — but the
 * actor id always comes from the session, never from the caller's payload.
 */
async function requireSignedIn(): Promise<CurrentMember> {
  requireFlag("faq_suite");
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) throw new UnauthorizedError("Bitte melde dich an.");
  return me;
}

function errorResult(err: unknown): FaqActionResult {
  if (isAppError(err)) return { ok: false, error: err.message };
  throw err;
}

export async function submitQuestionAction(input: {
  question: string;
  details?: string;
  context?: string;
}): Promise<FaqActionResult> {
  try {
    const me = await requireSignedIn();
    // The module caps `context` at 200 characters but otherwise trusts the
    // caller; the write side additionally requires a known registry key so a
    // client can't persist an arbitrary string that later renders as a pill
    // on the board's triage page. The read side stays tolerant of unknown
    // keys (submission-view.ts) for rows written before a key is retired.
    if (input.context && !FAQ_CONTEXTS.some((c) => c.key === input.context)) {
      return { ok: false, error: "Unbekannter Kontext." };
    }
    await createSubmission(getDb(), {
      question: input.question,
      ...(input.details ? { details: input.details } : {}),
      ...(input.context ? { context: input.context } : {}),
      submittedBy: me.user.id,
    });
    // The board's triage queue and its overview counter both read open
    // submissions server-side; neither is on this member's own route.
    revalidatePath("/federal/faq");
    revalidatePath("/federal/overview");
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function voteEntryAction(entryId: string, helpful: boolean): Promise<FaqActionResult> {
  try {
    const me = await requireSignedIn();
    // userId is the session's, never the client's — one vote per member per
    // entry, and no member can write another's row (Spec §4).
    await upsertFeedback(getDb(), { entryId, userId: me.user.id, helpful });
    revalidatePath("/federal/faq");
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}
