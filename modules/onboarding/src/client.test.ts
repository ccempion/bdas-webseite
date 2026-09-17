import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as client from "./client";
import * as surface from "./index";

const HERE = dirname(fileURLToPath(import.meta.url));
const PURE = ["client.ts", "flow.ts", "next-step.ts", "answers.ts", "text.ts", "entry-context.ts"];

describe("@bdas/onboarding/client", () => {
  it("exports the same values as the main surface", () => {
    for (const [name, value] of Object.entries(client)) {
      expect(surface[name as keyof typeof surface], name).toBe(value);
    }
  });

  it("imports nothing outside the pure flow files", () => {
    for (const file of PURE) {
      const source = readFileSync(join(HERE, file), "utf8");
      const specifiers = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1] ?? "");
      const allowed = new Set(["./types", ...PURE.map((f) => `./${f.replace(/\.ts$/, "")}`)]);
      expect(
        specifiers.filter((s) => !allowed.has(s)),
        file,
      ).toEqual([]);
    }
  });
});
