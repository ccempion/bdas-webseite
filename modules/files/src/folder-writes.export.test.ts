import { describe, expect, it } from "vitest";

import * as filesModule from "./index";

describe("files public surface", () => {
  it("exports the folder write services", () => {
    expect(typeof filesModule.createFolder).toBe("function");
    expect(typeof filesModule.renameFolder).toBe("function");
    expect(typeof filesModule.deleteFolder).toBe("function");
    expect(typeof filesModule.getFolder).toBe("function");
  });

  it("exports the folder tree limits", () => {
    expect(filesModule.MAX_FOLDER_DEPTH).toBe(5);
    expect(filesModule.MAX_FOLDER_NAME_LENGTH).toBe(80);
  });
});
