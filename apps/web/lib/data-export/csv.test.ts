import { describe, expect, it } from "vitest";
import { rowsToCsv } from "./csv";

describe("rowsToCsv", () => {
  it("writes BOM, header and CRLF rows", () => {
    expect(rowsToCsv(["a", "b"], [{ a: "x", b: "y" }])).toBe("\uFEFFa,b\r\nx,y\r\n");
  });
  it("quotes commas, quotes and newlines", () => {
    const csv = rowsToCsv(["t"], [{ t: 'a,"b"\nc' }]);
    expect(csv).toBe('\uFEFFt\r\n"a,""b""\nc"\r\n');
  });
  it("neutralises spreadsheet formulas", () => {
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) {
      expect(
        rowsToCsv(["t"], [{ t: bad }])
          .split("\r\n")[1]
          ?.replace(/^"/, ""),
      ).toMatch(/^'/);
    }
  });
  it("renders dates as ISO, null as empty, objects as JSON", () => {
    const d = new Date("2026-09-24T10:00:00.000Z");
    expect(rowsToCsv(["d", "n", "o"], [{ d, n: null, o: { k: 1 } }])).toBe(
      '\uFEFFd,n,o\r\n2026-09-24T10:00:00.000Z,,"{""k"":1}"\r\n',
    );
  });
  it("writes only the header for zero rows", () => {
    expect(rowsToCsv(["a"], [])).toBe("\uFEFFa\r\n");
  });
});
