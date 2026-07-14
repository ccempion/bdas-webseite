"use client";

import { useFormState, useFormStatus } from "react-dom";

import type { PostVisibility, TiptapDoc } from "@bdas/blog";
import { Alert, Button, Field, Form, Input } from "@bdas/design-system";

import {
  createPostAction,
  updatePostAction,
  type PostFormState,
} from "../blog/actions";
import { PostEditor } from "./PostEditor";

const SELECT_CLASS =
  "block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2.5 " +
  "text-base text-bdas-ink focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20";

const initialState: PostFormState = {};

/**
 * One form for both "new post" and "edit post". Kept deliberately minimal —
 * title, a rich body, and a visibility choice — so publishing is quick. When
 * `post` is given it edits in place (hidden postId + updatePostAction); the
 * slug never changes.
 */
export function PostForm({
  post,
}: {
  post?: {
    id: string;
    title: string;
    content: TiptapDoc;
    visibility: PostVisibility;
  };
}) {
  const editing = post !== undefined;
  const [state, action] = useFormState(
    editing ? updatePostAction : createPostAction,
    initialState,
  );
  const err = (k: string) => (state.fields?.[k] ? { error: state.fields[k] } : {});

  return (
    <Form action={action}>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {editing ? <input type="hidden" name="postId" value={post.id} /> : null}

      <Field label="Titel" htmlFor="title" {...err("title")}>
        <Input id="title" name="title" required defaultValue={post?.title ?? ""} maxLength={160} />
      </Field>

      <Field label="Beitrag" htmlFor="content" {...err("content")}>
        <PostEditor name="content" defaultDoc={post?.content ?? null} />
      </Field>

      <Field label="Sichtbarkeit" htmlFor="visibility" {...err("visibility")}>
        <select
          id="visibility"
          name="visibility"
          defaultValue={post?.visibility ?? "public"}
          className={SELECT_CLASS}
        >
          <option value="public">Öffentlich — für alle sichtbar</option>
          <option value="members">Nur Mitglieder</option>
          <option value="board">Nur Vorstände</option>
        </select>
      </Field>

      <SubmitButton editing={editing} />
    </Form>
  );
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending
        ? "Wird gespeichert…"
        : editing
          ? "Änderungen speichern"
          : "Veröffentlichen"}
    </Button>
  );
}
