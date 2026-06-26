import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  confirmUploadAction,
  deleteFileAction,
  getDownloadUrlAction,
  requestUploadAction,
} from "./file-actions";

// The flag-off branch returns before touching the session or database, so it is
// hermetic. The member + permission paths are exercised by the files module's
// integration suite (request/confirm/delete against Docker Postgres + fake
// storage).
describe("file actions flag gate", () => {
  beforeEach(() => {
    delete process.env["BDAS_FLAG_FILES"];
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_FILES"];
  });

  it("getDownloadUrlAction refuses when the files flag is off", async () => {
    expect(await getDownloadUrlAction("fil_whatever")).toEqual({ error: "Nicht verfügbar." });
  });

  it("requestUploadAction refuses when the files flag is off", async () => {
    const result = await requestUploadAction("fol_x", {
      filename: "a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    expect(result).toEqual({ error: "Nicht verfügbar." });
  });

  it("confirmUploadAction refuses when the files flag is off", async () => {
    expect(await confirmUploadAction("fil_x")).toEqual({ error: "Nicht verfügbar." });
  });

  it("deleteFileAction refuses when the files flag is off", async () => {
    expect(await deleteFileAction("fil_x")).toEqual({ error: "Nicht verfügbar." });
  });
});
