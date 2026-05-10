import { afterEach, describe, expect, it } from "vitest";
import { federalBoardEmailAllowlist, isFederalBoardEmail, isFlagOn, requireFlag } from "./index";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("isFlagOn", () => {
  it("returns false when env unset", () => {
    delete process.env["BDAS_FLAG_AUTH"];
    expect(isFlagOn("auth")).toBe(false);
  });

  it('returns true when env is "true"', () => {
    process.env["BDAS_FLAG_AUTH"] = "true";
    expect(isFlagOn("auth")).toBe(true);
  });

  it('returns true when env is "1"', () => {
    process.env["BDAS_FLAG_AUTH"] = "1";
    expect(isFlagOn("auth")).toBe(true);
  });

  it("returns false for any other value", () => {
    process.env["BDAS_FLAG_AUTH"] = "yes";
    expect(isFlagOn("auth")).toBe(false);
  });
});

describe("requireFlag", () => {
  it("throws when off", () => {
    delete process.env["BDAS_FLAG_AUTH"];
    expect(() => requireFlag("auth")).toThrow(/not available/);
  });

  it("does not throw when on", () => {
    process.env["BDAS_FLAG_AUTH"] = "true";
    expect(() => requireFlag("auth")).not.toThrow();
  });
});

describe("federalBoardEmailAllowlist", () => {
  it("empty set when env unset", () => {
    delete process.env["BDAS_FEDERAL_BOARD_EMAILS"];
    expect(federalBoardEmailAllowlist().size).toBe(0);
  });

  it("parses comma-separated list, lowercase, trimmed", () => {
    process.env["BDAS_FEDERAL_BOARD_EMAILS"] = "Alice@bdas.de, bob@bdas.de ,CHARLIE@bdas.de";
    const set = federalBoardEmailAllowlist();
    expect(set.has("alice@bdas.de")).toBe(true);
    expect(set.has("bob@bdas.de")).toBe(true);
    expect(set.has("charlie@bdas.de")).toBe(true);
  });

  it("isFederalBoardEmail handles case and whitespace", () => {
    process.env["BDAS_FEDERAL_BOARD_EMAILS"] = "evin.turan@bdas.de";
    expect(isFederalBoardEmail("EVIN.TURAN@bdas.de")).toBe(true);
    expect(isFederalBoardEmail(" evin.turan@bdas.de ")).toBe(true);
    expect(isFederalBoardEmail("eve@bdas.de")).toBe(false);
  });
});
