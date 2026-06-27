/**
 * Events emitted by the projects module via the core event bus (@bdas/events).
 * Subscribers depend on these types, not on the producing services
 * (CLAUDE.md §3). There is no consumer yet.
 */

export type ProjectCreated = {
  readonly type: "projects.project.created";
  readonly projectId: string;
  readonly groupId: string;
  readonly at: Date;
};

export type ProjectUpdated = {
  readonly type: "projects.project.updated";
  readonly projectId: string;
  readonly groupId: string;
  readonly at: Date;
};

export type ProjectAdopted = {
  readonly type: "projects.project.adopted";
  readonly projectId: string;
  readonly groupId: string;
  readonly adoptedFromProjectId: string;
  readonly at: Date;
};

export type ProjectsEvent = ProjectCreated | ProjectUpdated | ProjectAdopted;
