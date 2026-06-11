/**
 * Public surface of the files module (CLAUDE.md §1 rule 8). Only symbols
 * re-exported here are visible outside the module; everything else is private.
 */
export { ensureFolders, listFolders } from "./services/folders";
export {
  requestUpload,
  confirmUpload,
  listFiles,
  getDownloadUrl,
  deleteFile,
  sweepStalePendingUploads,
} from "./services/files";
export { registerFilesSubscribers, unregisterFilesSubscribers } from "./subscribers";
export type { Folder, FileMeta, FolderScope, FileStatus, AccessAction, UploadRequest } from "./types";
