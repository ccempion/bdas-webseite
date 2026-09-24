import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZip } from "./zip";

describe("buildZip", () => {
  it("round-trips entries by name and content", () => {
    const zip = buildZip([
      { name: "konto.csv", content: "a\r\n1\r\n" },
      { name: "sitzungen.csv", content: "ä\r\n" },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(["konto.csv", "sitzungen.csv"]);
    expect(strFromU8(files["sitzungen.csv"]!)).toBe("ä\r\n");
  });
});
