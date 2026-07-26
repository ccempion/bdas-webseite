"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canModeratePost, createPost, deletePost, getPostById, updatePost } from "@bdas/blog";
import { getDb } from "@bdas/db";
import { ForbiddenError, isAppError, NotFoundError } from "@bdas/errors";
import { isFlagOn } from "@bdas/feature-flags";

import { blogViewer, canAuthor, loadBlogMe } from "../_blog/access";

export type PostFormState = {
  readonly error?: string;
  readonly fields?: Record<string, string>;
};
export type ActionState = { readonly error?: string };

function s(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
function jsonOpt(fd: FormData, k: string): unknown {
  const v = s(fd, k);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function fieldsFromForm(fd: FormData) {
  return {
    title: s(fd, "title"),
    content: jsonOpt(fd, "content"),
    visibility: s(fd, "visibility") || "public",
    category: s(fd, "category") || "sonstiges",
  };
}

function appErr(err: unknown): PostFormState {
  if (isAppError(err)) {
    const fields = "fields" in err && (err as { fields?: Record<string, string> }).fields;
    return fields ? { error: err.message, fields } : { error: err.message };
  }
  throw err;
}

/** Create a post. Any eligible (active member or alumnus) user may author one. */
export async function createPostAction(_prev: PostFormState, fd: FormData): Promise<PostFormState> {
  if (!isFlagOn("blog")) return { error: "Nicht verfügbar." };
  const me = await loadBlogMe();
  if (!me) return { error: "Anmeldung erforderlich." };
  if (!canAuthor(me)) {
    return { error: "Nur aktive Mitglieder oder Alumni dürfen Beiträge veröffentlichen." };
  }

  let slug: string;
  try {
    const post = await createPost(getDb(), fieldsFromForm(fd), me.user.id);
    slug = post.slug;
  } catch (err) {
    return appErr(err);
  }

  revalidatePath("/blog");
  redirect(`/blog/${slug}`);
}

/** Load a post and assert the caller (author or federal board) may moderate it. */
async function assertModerable(postId: string) {
  const me = await loadBlogMe();
  if (!me) throw new ForbiddenError("Anmeldung erforderlich.");
  const post = await getPostById(getDb(), postId);
  if (!post) throw new NotFoundError("Beitrag nicht gefunden.");
  if (!canModeratePost(blogViewer(me), post)) {
    throw new ForbiddenError("Du darfst diesen Beitrag nicht bearbeiten.");
  }
  return post;
}

export async function updatePostAction(_prev: PostFormState, fd: FormData): Promise<PostFormState> {
  if (!isFlagOn("blog")) return { error: "Nicht verfügbar." };
  const postId = s(fd, "postId");
  let slug: string;
  try {
    await assertModerable(postId);
    const updated = await updatePost(getDb(), postId, fieldsFromForm(fd));
    slug = updated.slug;
  } catch (err) {
    return appErr(err);
  }

  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  redirect(`/blog/${slug}`);
}

export async function deletePostAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!isFlagOn("blog")) return { error: "Nicht verfügbar." };
  const postId = s(fd, "postId");
  try {
    await assertModerable(postId);
    await deletePost(getDb(), postId);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  revalidatePath("/blog");
  redirect("/blog");
}
