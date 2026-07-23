/**
 * @bdas/projects — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to other
 * workspaces. Internal files (schema, group-ref) are not importable.
 */

export {
  createProject,
  updateProject,
  adoptProject,
  ProjectInput,
  CreateProjectInput,
} from "./services/manage";
export { getProject } from "./services/get";
export { listProjects, type ListOpts } from "./services/list";

export type { Project, ProjectSummary, ProjectStatus } from "./types";
export type { ProjectsEvent, ProjectCreated, ProjectUpdated, ProjectAdopted } from "./events";
