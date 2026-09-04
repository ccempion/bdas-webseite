import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { highlightMatches } from "./highlight";

describe("highlightMatches", () => {
  it("wraps case-insensitive matches in <mark>", () => {
    const out = renderToStaticMarkup(<>{highlightMatches("Wie geht das Wieder?", "wie")}</>);
    expect(out.match(/<mark/g)).toHaveLength(2);
    expect(out).toContain("geht das");
  });
  it("escapes regex chars and passes empty query through", () => {
    expect(renderToStaticMarkup(<>{highlightMatches("a+b", "a+")}</>)).toContain("<mark");
    expect(renderToStaticMarkup(<>{highlightMatches("Text", "")}</>)).toBe("Text");
  });
});
