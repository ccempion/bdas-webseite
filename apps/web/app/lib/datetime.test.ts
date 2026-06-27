import { describe, expect, it } from "vitest";

import { berlinLocalToUtc, utcToBerlinLocalInput } from "./datetime";

describe("Berlin wall-clock <-> UTC", () => {
  it("summer date is CEST (+02): 18:00 Berlin = 16:00 UTC", () => {
    const d = berlinLocalToUtc("2026-08-01T18:00");
    expect(d.toISOString()).toBe("2026-08-01T16:00:00.000Z");
    expect(utcToBerlinLocalInput(d)).toBe("2026-08-01T18:00");
  });

  it("winter date is CET (+01): 18:00 Berlin = 17:00 UTC", () => {
    const d = berlinLocalToUtc("2026-01-15T18:00");
    expect(d.toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(utcToBerlinLocalInput(d)).toBe("2026-01-15T18:00");
  });

  it("returns an invalid date for a malformed string", () => {
    expect(Number.isNaN(berlinLocalToUtc("").getTime())).toBe(true);
  });
});
