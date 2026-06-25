import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "./route";

describe("files-sweep cron auth + flag gate", () => {
  beforeEach(() => {
    process.env["CRON_SECRET"] = "s3cret";
    delete process.env["BDAS_FLAG_FILES"];
  });
  afterEach(() => {
    delete process.env["CRON_SECRET"];
    delete process.env["BDAS_FLAG_FILES"];
  });

  it("401s without a bearer token", async () => {
    const res = await GET(new Request("http://x/api/cron/files-sweep"));
    expect(res.status).toBe(401);
  });

  it("401s with the wrong token", async () => {
    const res = await GET(
      new Request("http://x/api/cron/files-sweep", {
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("skips (200) with a valid token when the files flag is off", async () => {
    const res = await GET(
      new Request("http://x/api/cron/files-sweep", {
        headers: { authorization: "Bearer s3cret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "files flag off" });
  });
});
