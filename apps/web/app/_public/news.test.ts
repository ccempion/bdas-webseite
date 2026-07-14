import { describe, expect, it } from "vitest";

import { placeholderNewsSource } from "./news";

describe("placeholderNewsSource", () => {
  it("returns at most n items, newest first", async () => {
    const items = await placeholderNewsSource.listLatest(2);
    expect(items.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.publishedAt.getTime()).toBeGreaterThanOrEqual(
        items[i]!.publishedAt.getTime(),
      );
    }
  });

  it("placeholder items are non-clickable (href null) until the blog exists", async () => {
    const items = await placeholderNewsSource.listLatest(3);
    expect(items.every((i) => i.href === null)).toBe(true);
  });
});
