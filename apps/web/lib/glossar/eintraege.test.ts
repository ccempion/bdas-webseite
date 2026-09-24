import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GLOSSAR, GLOSSAR_BEREICHE, glossarEintrag } from "./eintraege";

const APP_DIR = path.resolve(__dirname, "../../app");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("GLOSSAR", () => {
  it("has unique, stable keys", () => {
    const keys = GLOSSAR.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("keeps every text short and free of markdown leftovers", () => {
    for (const e of GLOSSAR) {
      expect(e.begriff.trim(), e.key).toBe(e.begriff);
      expect(e.text.length, e.key).toBeGreaterThan(20);
      expect(e.text.length, e.key).toBeLessThanOrEqual(220);
      expect(e.text, e.key).not.toMatch(/\*\*|_\(|§|\\\*/);
    }
  });

  it("files every entry under a known area, and every area has entries", () => {
    const bereiche = new Set(GLOSSAR_BEREICHE.map((b) => b.key));
    for (const e of GLOSSAR) expect(bereiche.has(e.bereich), e.key).toBe(true);
    for (const b of bereiche)
      expect(
        GLOSSAR.some((e) => e.bereich === b),
        b,
      ).toBe(true);
  });

  it("looks entries up by key", () => {
    expect(glossarEintrag("verteiler")?.begriff).toBe("Bundesvorstand-Verteiler");
    expect(glossarEintrag("gibt-es-nicht")).toBeUndefined();
  });

  // Spec §9: a typo in <Begriff k="…"> fails CI instead of silently showing
  // a bare word to users.
  it("knows every key used by <Begriff> in apps/web/app", () => {
    const used = sourceFiles(APP_DIR).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/<Begriff\s+k="([^"]+)"/g)].map((m) => ({
        file: path.relative(APP_DIR, file),
        key: m[1] ?? "",
      })),
    );
    const unknown = used.filter((u) => !glossarEintrag(u.key));
    expect(unknown).toEqual([]);
  });
});
