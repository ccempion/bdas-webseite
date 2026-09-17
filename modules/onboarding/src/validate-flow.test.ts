import { describe, expect, it } from "vitest";

import { FLOW } from "./flow";
import type { Flow } from "./types";
import { validateFlow } from "./validate-flow";

/** Eine Kopie des echten Ablaufs, an der ein Test genau eine Stelle kaputt macht. */
function broken(patch: (f: { -readonly [K in keyof Flow]: Flow[K] }) => void): Flow {
  const copy = structuredClone(FLOW) as { -readonly [K in keyof Flow]: Flow[K] };
  patch(copy);
  return copy;
}

describe("validateFlow", () => {
  it("accepts the real flow", () => {
    expect(validateFlow(FLOW)).toEqual([]);
  });

  it("rejects an unknown start", () => {
    expect(validateFlow(broken((f) => (f.start = "nirgends")))).toContainEqual(
      expect.stringContaining("Start"),
    );
  });

  it("rejects a rule that points nowhere", () => {
    const flow = broken((f) => {
      f.rules = [...f.rules, { from: "typ", to: { question: "fehlt" } }];
    });
    expect(validateFlow(flow)).toContainEqual(expect.stringContaining("fehlt"));
  });

  it("rejects a question without an unconditional last rule", () => {
    const flow = broken((f) => {
      f.rules = f.rules.filter((r) => !(r.from === "studienort" && r.when === undefined));
    });
    expect(validateFlow(flow)).toContainEqual(expect.stringContaining("studienort"));
  });

  it("rejects a rule after the unconditional one", () => {
    const flow = broken((f) => {
      const i = f.rules.findIndex((r) => r.from === "typ");
      f.rules = [
        ...f.rules.slice(0, i + 1),
        { from: "typ", to: { outcome: "foerderer" } },
        ...f.rules.slice(i + 1),
      ];
    });
    expect(validateFlow(flow)).toContainEqual(expect.stringContaining("unerreichbar"));
  });

  it("rejects an unreachable question", () => {
    const flow = broken((f) => {
      f.questions = { ...f.questions, insel: { kind: "name", title: "t", help: "h" } };
      f.rules = [...f.rules, { from: "insel", to: { outcome: "foerderer" } }];
    });
    expect(validateFlow(flow)).toContainEqual(expect.stringContaining("insel"));
  });

  it("rejects an outcome no rule leads to", () => {
    const flow = broken((f) => {
      f.rules = f.rules.filter((r) => !("outcome" in r.to && r.to.outcome === "bdaj"));
    });
    expect(validateFlow(flow)).toContainEqual(expect.stringContaining("bdaj"));
  });

  it("rejects an equals condition on a value the choice does not offer", () => {
    const flow = broken((f) => {
      f.rules = f.rules.map((r) =>
        r.when?.kind === "equals" && r.when.value === "bdaj"
          ? { ...r, when: { kind: "equals", question: "typ", value: "bdjaa" } }
          : r,
      );
    });
    expect(validateFlow(flow)).toContainEqual(expect.stringContaining("bdjaa"));
  });

  it("rejects has_group on a question that is not a place", () => {
    const flow = broken((f) => {
      f.rules = f.rules.map((r) =>
        r.when?.kind === "has_group" ? { ...r, when: { kind: "has_group", question: "typ" } } : r,
      );
    });
    expect(validateFlow(flow)).toContainEqual(expect.stringContaining("has_group"));
  });

  it("rejects a cycle", () => {
    const flow = broken((f) => {
      f.rules = [{ from: "aktiv_wo", to: { question: "typ" } }, ...f.rules];
    });
    expect(validateFlow(flow)).toContainEqual(expect.stringContaining("Kreis"));
  });

  it("rejects a placeholder used before its question", () => {
    const flow = broken((f) => {
      f.questions = {
        ...f.questions,
        typ: { ...f.questions["typ"]!, title: "Hallo {vorname}" } as Flow["questions"][string],
      };
    });
    expect(validateFlow(flow)).toContainEqual(expect.stringContaining("{vorname}"));
  });

  it("rejects {stadt} where the place may be skipped", () => {
    const flow = broken((f) => {
      f.outcomes = { ...f.outcomes, alumnus: { ...f.outcomes.alumnus, title: "In {stadt}" } };
    });
    expect(validateFlow(flow)).toContainEqual(expect.stringContaining("{stadt}"));
  });

  it("rejects {eingabe} outside a no-group hint and unknown placeholders", () => {
    const flow = broken((f) => {
      f.outcomes = {
        ...f.outcomes,
        foerderer: { ...f.outcomes.foerderer, title: "{eingabe} {quatsch}" },
      };
    });
    const errors = validateFlow(flow);
    expect(errors).toContainEqual(expect.stringContaining("{eingabe}"));
    expect(errors).toContainEqual(expect.stringContaining("{quatsch}"));
  });
});
