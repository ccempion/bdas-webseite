import { afterEach, describe, expect, it } from "vitest";

import { podcastEnabled } from "./flag";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("podcastEnabled", () => {
  it("is true when both BDAS_FLAG_PUBLIC_SHELL and BDAS_FLAG_PODCAST are on", () => {
    process.env["BDAS_FLAG_PUBLIC_SHELL"] = "true";
    process.env["BDAS_FLAG_PODCAST"] = "true";
    expect(podcastEnabled()).toBe(true);
  });

  it("is false when only BDAS_FLAG_PUBLIC_SHELL is on", () => {
    process.env["BDAS_FLAG_PUBLIC_SHELL"] = "true";
    delete process.env["BDAS_FLAG_PODCAST"];
    expect(podcastEnabled()).toBe(false);
  });

  it("is false when only BDAS_FLAG_PODCAST is on", () => {
    delete process.env["BDAS_FLAG_PUBLIC_SHELL"];
    process.env["BDAS_FLAG_PODCAST"] = "true";
    expect(podcastEnabled()).toBe(false);
  });

  it("is false when both are off", () => {
    delete process.env["BDAS_FLAG_PUBLIC_SHELL"];
    delete process.env["BDAS_FLAG_PODCAST"];
    expect(podcastEnabled()).toBe(false);
  });
});
