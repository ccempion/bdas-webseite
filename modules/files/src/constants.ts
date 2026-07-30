/** Spec §11: 25 MB per-file cap, 5 GB per-folder quota. Code constants for v1; */
/** per-scope override (federal board) is a Phase 3 dashboard concern (YAGNI). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const FOLDER_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * Conservative MIME allowlist enforced at requestUpload. Documents, images,
 * plain text/CSV, and zip archives. Executables and unknown binary types are
 * rejected. The federation can widen this later.
 */
export const ALLOWED_MIME: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/zip",
]);

/**
 * Folder tree limits. Depth 0 is a system-provisioned root; a folder at
 * MAX_FOLDER_DEPTH accepts no children. Enforced in the service AND by the
 * trigger in 0003_folder_nesting.sql.
 */
export const MAX_FOLDER_DEPTH = 5;
export const MAX_FOLDER_NAME_LENGTH = 80;
