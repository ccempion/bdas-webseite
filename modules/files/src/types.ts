/**
 * Public types for the files module. `storage_key` is deliberately NOT exposed
 * on FileMeta — it is an internal object-store address, never handed to callers.
 */
export type FolderScope = "members_all" | "group_members" | "local_board" | "federal_board";
export type FileStatus = "pending" | "ready";
export type AccessAction = "download" | "upload" | "delete";

export type Folder = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly scope: FolderScope;
  readonly groupId: string | null;
  readonly parentId: string | null;
  readonly depth: number;
  readonly description: string;
  readonly createdAt: Date;
  readonly createdBy: string | null;
};

export type FileMeta = {
  readonly id: string;
  readonly folderId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly status: FileStatus;
  readonly uploadedBy: string;
  readonly uploadedAt: Date;
  readonly lastModifiedAt: Date;
};

export type UploadRequest = {
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
};
