import { describe, expect, it } from "vitest";
import { toggleId } from "./related-picker";

describe("toggleId", () => {
  it("adds an absent id and removes a present one", () => {
    expect(toggleId([], "a")).toEqual(["a"]);
    expect(toggleId(["a"], "a")).toEqual([]);
    expect(toggleId(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });
});
