/**
 * Public surface of the files module (CLAUDE.md §1 rule 8). Only symbols
 * re-exported here are visible outside the module; everything else is private.
 */
export {
  ensureFolders,
  listFolders,
  getFolder,
  getFolderRights,
  listFolderTree,
} from "./services/folders";
export { createFolder, renameFolder, deleteFolder } from "./services/folder-writes";
export {
  requestUpload,
  confirmUpload,
  listFiles,
  folderFileCounts,
  getDownloadUrl,
  deleteFile,
  sweepStalePendingUploads,
} from "./services/files";
export {
  grantFolderAccess,
  revokeFolderAccess,
  listFolderAccess,
  listAllFolderGrants,
  type FolderGrant,
} from "./services/folder-access";
export { registerFilesSubscribers, unregisterFilesSubscribers } from "./subscribers";
export { canRead as canReadFolder, mayDeleteFile, type FolderRights } from "./permissions";
export { getMemberIdResolver, setMemberIdResolver, type MemberIdResolver } from "./resolver";
export {
  ALLOWED_MIME,
  MAX_FILE_BYTES,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME_LENGTH,
} from "./constants";
export type {
  Folder,
  FileMeta,
  FolderScope,
  FileStatus,
  AccessAction,
  UploadRequest,
} from "./types";
