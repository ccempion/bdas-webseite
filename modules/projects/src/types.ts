/**
 * Domain types for the projects module's public surface. The DB row shape
 * (`ProjectRow`) is internal — service callers see `Project` / `ProjectSummary`.
 *
 * `groupName` / `groupSlug` are resolved through @bdas/groups' public interface
 * (never a direct table read) so cross-group browsing can show the owning group.
 */

export type ProjectStatus = "planned" | "active" | "completed" | "archived";

export type Project = {
  readonly id: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly groupSlug: string;
  readonly title: string;
  readonly descriptionMd: string | null;
  readonly status: ProjectStatus;
  readonly topic: string | null;
  readonly contact: string | null;
  /** Ids of files stored via @bdas/files; resolved to URLs at the app layer. */
  readonly artifactFileIds: ReadonlyArray<string>;
  /** Source project this was adopted from; null for originals. */
  readonly adoptedFromProjectId: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
};

export type ProjectSummary = Pick<
  Project,
  "id" | "groupId" | "groupName" | "groupSlug" | "title" | "status" | "topic" | "createdAt"
>;
