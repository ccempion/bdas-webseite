/**
 * Domain types for the groups module's public surface. The DB row shape
 * (`GroupRow`) is internal — service callers see `Group` / `GroupSummary`.
 */

export type GroupStatus = "active" | "dormant" | "new" | "archived";

export type GroupLocation = {
  readonly name: string;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
};

export type Group = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly contactEmail: string | null;
  readonly instagramUrl: string | null;
  readonly websiteUrl: string | null;
  readonly location: GroupLocation | null;
  /** Storage key of the page banner in the public content-media bucket, or
   *  null. The module stays storage-agnostic: resolving the key to a URL is
   *  the app layer's job (CLAUDE.md §1 rule 2). */
  readonly imageKey: string | null;
  readonly status: GroupStatus;
};

export type GroupSummary = Pick<Group, "id" | "slug" | "name" | "city" | "status" | "location">;

export type JoinPolicy = { readonly required: false };
