import { describe, expect, it } from "vitest";
import { plainText } from "./plain-text";

describe("plainText", () => {
  it("collects nested text nodes", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hallo" }] },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Welt" }] }],
            },
          ],
        },
      ],
    };
    expect(plainText(doc)).toBe("Hallo Welt");
  });
  it("is empty for garbage", () => {
    expect(plainText(null)).toBe("");
    expect(plainText({ type: "doc" })).toBe("");
  });
});
