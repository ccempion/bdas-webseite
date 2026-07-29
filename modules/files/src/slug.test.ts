import { describe, expect, it } from "vitest";

import { slugifyFolderName } from "./slug";

describe("slugifyFolderName", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyFolderName("Protokolle 2026")).toBe("protokolle-2026");
  });

  it("transliterates German umlauts and eszett", () => {
    expect(slugifyFolderName("Beschlüsse & Anträge")).toBe("beschluesse-antraege");
    expect(slugifyFolderName("Straße")).toBe("strasse");
  });

  it("collapses runs of separators and trims them", () => {
    expect(slugifyFolderName("  --Ordner///Name--  ")).toBe("ordner-name");
  });

  it("falls back when nothing survives", () => {
    expect(slugifyFolderName("!!!")).toBe("ordner");
  });

  it("caps length at 60 characters without a trailing hyphen", () => {
    const s = slugifyFolderName("a".repeat(80));
    expect(s).toHaveLength(60);
    expect(s.endsWith("-")).toBe(false);
  });
});
