import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDownloadUrlAction } from "./file-actions";

// The flag-off branch returns before touching the session or database, so it is
// hermetic. The member + permission paths are exercised by the files module's
// integration suite (getDownloadUrl against Docker Postgres + in-memory storage).
describe("getDownloadUrlAction flag gate", () => {
  beforeEach(() => {
    delete process.env["BDAS_FLAG_FILES"];
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_FILES"];
  });

  it("refuses when the files flag is off", async () => {
    const result = await getDownloadUrlAction("fil_whatever");
    expect(result).toEqual({ error: "Nicht verfügbar." });
  });
});
