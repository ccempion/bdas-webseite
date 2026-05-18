/**
 * Domain types for the groups module's public surface. The DB row shape
 * (`GroupRow`) is internal — service callers see `Group` / `GroupSummary`.
 */

export type GroupStatus = "active" | "dormant" | "new" | "archived";

export type Group = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly contactEmail: string | null;
  readonly instagramUrl: string | null;
  readonly websiteUrl: string | null;
  readonly status: GroupStatus;
};

export type GroupSummary = Pick<Group, "id" | "slug" | "name" | "city" | "status">;

export type JoinPolicy = { readonly required: false };
