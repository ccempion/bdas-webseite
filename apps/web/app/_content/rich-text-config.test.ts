import { describe, expect, it } from "vitest";

import { RICH_TEXT_STARTERKIT_CONFIG } from "./rich-text-config";

describe("RICH_TEXT_STARTERKIT_CONFIG", () => {
  it("disables exactly the block-level nodes that are their own Puck blocks", () => {
    expect(RICH_TEXT_STARTERKIT_CONFIG).toEqual({
      heading: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
    });
  });
});
