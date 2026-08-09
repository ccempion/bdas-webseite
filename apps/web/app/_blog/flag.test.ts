import { afterEach, describe, expect, it } from "vitest";

import { commentsEnabled } from "./flag";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("commentsEnabled", () => {
  it("is true when both BDAS_FLAG_BLOG and BDAS_FLAG_BLOG_COMMENTS are on", () => {
    process.env["BDAS_FLAG_BLOG"] = "true";
    process.env["BDAS_FLAG_BLOG_COMMENTS"] = "true";
    expect(commentsEnabled()).toBe(true);
  });

  it("is false when only BDAS_FLAG_BLOG is on", () => {
    process.env["BDAS_FLAG_BLOG"] = "true";
    delete process.env["BDAS_FLAG_BLOG_COMMENTS"];
    expect(commentsEnabled()).toBe(false);
  });

  it("is false when only BDAS_FLAG_BLOG_COMMENTS is on", () => {
    delete process.env["BDAS_FLAG_BLOG"];
    process.env["BDAS_FLAG_BLOG_COMMENTS"] = "true";
    expect(commentsEnabled()).toBe(false);
  });

  it("is false when both are off", () => {
    delete process.env["BDAS_FLAG_BLOG"];
    delete process.env["BDAS_FLAG_BLOG_COMMENTS"];
    expect(commentsEnabled()).toBe(false);
  });
});
