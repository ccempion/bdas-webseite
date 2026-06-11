import { describe, expect, it } from "vitest";

import { ALLOWED_MIME, FOLDER_QUOTA_BYTES, MAX_FILE_BYTES } from "./constants";

describe("files constants", () => {
  it("caps a single file at 25 MB and a folder at 5 GB", () => {
    expect(MAX_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(FOLDER_QUOTA_BYTES).toBe(5 * 1024 * 1024 * 1024);
  });

  it("allows common document/image types and rejects executables", () => {
    expect(ALLOWED_MIME.has("application/pdf")).toBe(true);
    expect(ALLOWED_MIME.has("image/png")).toBe(true);
    expect(ALLOWED_MIME.has("application/x-msdownload")).toBe(false);
    expect(ALLOWED_MIME.has("application/octet-stream")).toBe(false);
  });
});
