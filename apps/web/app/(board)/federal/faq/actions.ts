"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import {
  createEntry,
  createTopic,
  deleteEntry,
  deleteTopic,
  publishEntry,
  renameTopic,
  reorderEntries,
  reorderTopics,
  unpublishEntry,
  updateEntry,
  type FaqSectionKey,
  type FaqSubgroupKey,
} from "@bdas/faq";
import { getCurrentMember, requireFederalBoard, type CurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/** Every write here is federal-board only (Spec §4) — no group scope exists
 *  for the FAQ, so there is nothing weaker to fall back to. */
async function assertFederal(): Promise<CurrentMember> {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  requireFederalBoard(me);
  return me;
}

function revalidateFaq(): void {
  revalidatePath("/federal/faq");
  revalidatePath("/faq");
}

function errorResult(err: unknown): ActionResult {
  if (isAppError(err)) return { ok: false, error: err.message };
  throw err;
}

export async function saveEntryAction(input: {
  id?: string;
  section: FaqSectionKey;
  subgroup: FaqSubgroupKey | null;
  topicId: string | null;
  question: string;
  body: unknown;
  youtubeId: string | null;
  relatedIds: string[];
  contexts: string[];
  submissionId?: string;
  publish: boolean;
}): Promise<ActionResult> {
  try {
    const me = await assertFederal();
    const db = getDb();
    const base = {
      section: input.section,
      subgroup: input.subgroup,
      topicId: input.topicId,
      question: input.question,
      body: input.body,
      youtubeId: input.youtubeId,
      relatedIds: input.relatedIds,
      contexts: input.contexts,
    };
    const saved = input.id
      ? await updateEntry(db, { ...base, id: input.id, updatedBy: me.user.id })
      : await createEntry(db, {
          ...base,
          updatedBy: me.user.id,
          ...(input.submissionId ? { submissionId: input.submissionId } : {}),
        });
    if (input.publish && saved.status !== "published") {
      await publishEntry(db, { id: saved.id, updatedBy: me.user.id });
    }
    revalidateFaq();
    return { ok: true, id: saved.id };
  } catch (err) {
    return errorResult(err);
  }
}

export async function publishEntryAction(id: string): Promise<ActionResult> {
  try {
    const me = await assertFederal();
    await publishEntry(getDb(), { id, updatedBy: me.user.id });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function unpublishEntryAction(id: string): Promise<ActionResult> {
  try {
    const me = await assertFederal();
    await unpublishEntry(getDb(), { id, updatedBy: me.user.id });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function deleteEntryAction(id: string): Promise<ActionResult> {
  try {
    await assertFederal();
    await deleteEntry(getDb(), { id });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function reorderEntriesAction(
  section: FaqSectionKey,
  subgroup: FaqSubgroupKey | null,
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    await assertFederal();
    await reorderEntries(getDb(), { section, subgroup, orderedIds });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function createTopicAction(name: string): Promise<ActionResult> {
  try {
    await assertFederal();
    const topic = await createTopic(getDb(), { name });
    revalidateFaq();
    return { ok: true, id: topic.id };
  } catch (err) {
    return errorResult(err);
  }
}

export async function renameTopicAction(id: string, name: string): Promise<ActionResult> {
  try {
    await assertFederal();
    await renameTopic(getDb(), { id, name });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function deleteTopicAction(id: string): Promise<ActionResult> {
  try {
    await assertFederal();
    await deleteTopic(getDb(), { id });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function reorderTopicsAction(orderedIds: string[]): Promise<ActionResult> {
  try {
    await assertFederal();
    await reorderTopics(getDb(), { orderedIds });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}
