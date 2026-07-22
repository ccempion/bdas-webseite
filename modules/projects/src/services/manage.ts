/**
 * Project lifecycle: create, edit, and "Adopt this project" (copy to another
 * group).
 *
 * Authorization is NOT enforced here — callers gate at the app action layer
 * (`canManageGroup(grants, groupId)` for create/edit on the owning group;
 * `canManageGroup(grants, targetGroupId)` for adopt), the same convention as
 * `events`/`groups` manage services. This keeps `projects` free of an
 * `auth`/`members` dependency (CLAUDE.md §1 rule 2).
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { ProjectAdopted, ProjectCreated, ProjectUpdated } from "../events";
import { resolveGroupRef } from "../group-ref";
import { projects } from "../schema";
import type { Project, ProjectStatus } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

// Shared by create and edit. `groupId` is deliberately absent — a project's
// owning group is immutable; moving a project to another group is what "adopt"
// is for (it forks a new row). `adopted_from` is set only by `adoptProject`.
export const ProjectInput = z.object({
  title: z
    .string()
    .min(3, "Titel muss mindestens 3 Zeichen haben")
    .max(160, "Titel darf höchstens 160 Zeichen haben"),
  descriptionMd: z.string().max(20_000).optional().nullable(),
  status: z.enum(["planned", "active", "completed", "archived"]).default("active"),
  topic: z.string().max(80, "Thema darf höchstens 80 Zeichen haben").optional().nullable(),
  contact: z.string().max(240, "Kontakt darf höchstens 240 Zeichen haben").optional().nullable(),
  // References to files already stored via @bdas/files — opaque ids, no bytes.
  artifactFileIds: z
    .array(z.string().min(1).max(100))
    .max(20, "Höchstens 20 Anhänge")
    .default([]),
});
export type ProjectInput = z.infer<typeof ProjectInput>;

// Create additionally requires the owning group.
export const CreateProjectInput = ProjectInput.extend({
  groupId: z.string().min(1, "Gruppe ist erforderlich"),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[i.path.join(".") || "_"] = i.message;
    throw new ValidationError("Eingabe ungültig", { fields });
  }
  return parsed.data;
}

/** Build the public domain object from a row plus its resolved group ref. */
export function rowToProject(
  r: typeof projects.$inferSelect,
  group: { name: string; slug: string },
): Project {
  return {
    id: r.id,
    groupId: r.groupId,
    groupName: group.name,
    groupSlug: group.slug,
    title: r.title,
    descriptionMd: r.descriptionMd,
    status: r.status as ProjectStatus,
    topic: r.topic,
    contact: r.contact,
    artifactFileIds: r.artifactFileIds,
    adoptedFromProjectId: r.adoptedFromProjectId,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  };
}

async function loadOrThrow(db: Db, id: string): Promise<typeof projects.$inferSelect> {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!rows[0]) throw new NotFoundError("Projekt nicht gefunden.");
  return rows[0];
}

/** Create a project owned by `groupId`. The owning group must exist. */
export async function createProject(
  db: Db,
  input: unknown,
  createdBy: string,
): Promise<Project> {
  const v = parseOrThrow(CreateProjectInput, input);
  const group = await resolveGroupRef(db, v.groupId);

  const id = createId("prj");
  await db.insert(projects).values({
    id,
    groupId: v.groupId,
    title: v.title,
    descriptionMd: v.descriptionMd ?? null,
    status: v.status,
    topic: v.topic ?? null,
    contact: v.contact ?? null,
    artifactFileIds: v.artifactFileIds,
    adoptedFromProjectId: null,
    createdBy,
  });

  const event: ProjectCreated = {
    type: "projects.project.created",
    projectId: id,
    groupId: v.groupId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return rowToProject(await loadOrThrow(db, id), group);
}

/** Edit a project. The owning group is immutable (absent from the input). */
export async function updateProject(db: Db, id: string, input: unknown): Promise<Project> {
  const existing = await loadOrThrow(db, id);
  const v = parseOrThrow(ProjectInput, input);

  await db
    .update(projects)
    .set({
      title: v.title,
      descriptionMd: v.descriptionMd ?? null,
      status: v.status,
      topic: v.topic ?? null,
      contact: v.contact ?? null,
      artifactFileIds: v.artifactFileIds,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id));

  const event: ProjectUpdated = {
    type: "projects.project.updated",
    projectId: id,
    groupId: existing.groupId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  const group = await resolveGroupRef(db, existing.groupId);
  return rowToProject(await loadOrThrow(db, id), group);
}

/**
 * "Adopt this project": fork a copy scoped to `targetGroupId`. The copy carries
 * the source's title/description/topic/contact but resets status to the default
 * and starts with no artifacts — the originals reference the source group's
 * `local_board` folder, which the adopting group may not read. `adopted_from`
 * records provenance.
 */
export async function adoptProject(
  db: Db,
  sourceId: string,
  targetGroupId: string,
  adoptedBy: string,
): Promise<Project> {
  const source = await loadOrThrow(db, sourceId);
  const group = await resolveGroupRef(db, targetGroupId);

  const id = createId("prj");
  await db.insert(projects).values({
    id,
    groupId: targetGroupId,
    title: source.title,
    descriptionMd: source.descriptionMd,
    status: "active",
    topic: source.topic,
    contact: source.contact,
    artifactFileIds: [],
    adoptedFromProjectId: sourceId,
    createdBy: adoptedBy,
  });

  const event: ProjectAdopted = {
    type: "projects.project.adopted",
    projectId: id,
    groupId: targetGroupId,
    adoptedFromProjectId: sourceId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return rowToProject(await loadOrThrow(db, id), group);
}
