/**
 * Post lifecycle: create, edit, delete.
 *
 * Authorization is NOT enforced here — callers gate at the app action layer
 * (any signed-in user may create; author or federal board may edit/delete via
 * `canModeratePost`). This keeps `blog` free of an `auth`/`members` dependency
 * (CLAUDE.md §1 rule 2), the same convention as `events`/`projects`.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { PostDeleted, PostPublished, PostUpdated } from "../events";
import { posts } from "../schema";
import { buildSlug } from "../slug";
import type { Post, PostVisibility, TiptapDoc } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

// A Tiptap doc must at least be `{ type: "doc" }`; deeper node validation is the
// editor's job, sanitization happens at render (content.ts).
const TiptapDocSchema = z
  .object({ type: z.literal("doc") })
  .passthrough()
  .refine((d) => "content" in d, { message: "Beitrag darf nicht leer sein" });

export const PostInput = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Titel muss mindestens 3 Zeichen haben")
    .max(160, "Titel darf höchstens 160 Zeichen haben"),
  content: TiptapDocSchema,
  visibility: z.enum(["public", "members", "board"]).default("public"),
});
export type PostInput = z.infer<typeof PostInput>;

function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[i.path.join(".") || "_"] = i.message;
    throw new ValidationError("Eingabe ungültig", { fields });
  }
  return parsed.data;
}

export function rowToPost(r: typeof posts.$inferSelect): Post {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    content: r.content as TiptapDoc,
    visibility: r.visibility as PostVisibility,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function loadOrThrow(db: Db, id: string): Promise<typeof posts.$inferSelect> {
  const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!rows[0]) throw new NotFoundError("Beitrag nicht gefunden.");
  return rows[0];
}

/** Create a post authored by `authorId` (an auth user id). */
export async function createPost(db: Db, input: unknown, authorId: string): Promise<Post> {
  const v = parseOrThrow(PostInput, input);

  const id = createId("post");
  const slug = buildSlug(v.title);
  await db.insert(posts).values({
    id,
    slug,
    title: v.title,
    content: v.content as TiptapDoc,
    visibility: v.visibility,
    createdBy: authorId,
  });

  const event: PostPublished = {
    type: "blog.post.published",
    postId: id,
    slug,
    visibility: v.visibility,
    authorId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return rowToPost(await loadOrThrow(db, id));
}

/** Edit a post. Slug and author are immutable; title/content/visibility change. */
export async function updatePost(db: Db, id: string, input: unknown): Promise<Post> {
  await loadOrThrow(db, id);
  const v = parseOrThrow(PostInput, input);

  await db
    .update(posts)
    .set({
      title: v.title,
      content: v.content as TiptapDoc,
      visibility: v.visibility,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id));

  const event: PostUpdated = { type: "blog.post.updated", postId: id, at: new Date() };
  await getEventBus().publish(event);

  return rowToPost(await loadOrThrow(db, id));
}

/** Delete a post. */
export async function deletePost(db: Db, id: string): Promise<void> {
  await loadOrThrow(db, id);
  await db.delete(posts).where(eq(posts.id, id));

  const event: PostDeleted = { type: "blog.post.deleted", postId: id, at: new Date() };
  await getEventBus().publish(event);
}
