import { describe, expect, it } from "vitest";

import { TiptapDocSchema } from "./types";

describe("TiptapDocSchema", () => {
  it("accepts a minimal doc", () => {
    expect(TiptapDocSchema.safeParse({ type: "doc", content: [] }).success).toBe(true);
  });
  it("rejects a non-doc root and non-objects", () => {
    expect(TiptapDocSchema.safeParse({ type: "paragraph" }).success).toBe(false);
    expect(TiptapDocSchema.safeParse("hallo").success).toBe(false);
    expect(TiptapDocSchema.safeParse(null).success).toBe(false);
  });
});
