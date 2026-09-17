import { PLACEHOLDERS, placeholdersIn } from "./text";
import { OUTCOME_IDS, type Flow, type Question } from "./types";

type Node = string; // Frage-ID oder "outcome:<id>"
const outcomeNode = (id: string): Node => `outcome:${id}`;

function edges(flow: Flow): Map<Node, Node[]> {
  const out = new Map<Node, Node[]>();
  for (const r of flow.rules) {
    const to = "outcome" in r.to ? outcomeNode(r.to.outcome) : r.to.question;
    out.set(r.from, [...(out.get(r.from) ?? []), to]);
  }
  return out;
}

function hasCycle(flow: Flow, next: Map<Node, Node[]>): boolean {
  const state = new Map<Node, "open" | "done">();
  const visit = (n: Node): boolean => {
    if (state.get(n) === "open") return true;
    if (state.get(n) === "done") return false;
    state.set(n, "open");
    for (const m of next.get(n) ?? []) if (visit(m)) return true;
    state.set(n, "done");
    return false;
  };
  return Object.keys(flow.questions).some(visit);
}

/**
 * Für jeden Knoten die Fragen, die auf JEDEM Weg dorthin schon beantwortet
 * sind. Der Graph ist kreisfrei (vorher geprüft), also terminiert die
 * Fixpunkt-Iteration.
 */
function guaranteedBefore(flow: Flow, next: Map<Node, Node[]>): Map<Node, Set<string>> {
  const result = new Map<Node, Set<string>>([[flow.start, new Set()]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [from, tos] of next) {
      const known = result.get(from);
      if (!known) continue;
      const carried = new Set([...known, from]);
      for (const to of tos) {
        const prev = result.get(to);
        const merged = prev ? new Set([...prev].filter((q) => carried.has(q))) : carried;
        if (!prev || merged.size !== prev.size) {
          result.set(to, merged);
          changed = true;
        }
      }
    }
  }
  return result;
}

function questionTexts(q: Question): Array<{ text: string; allowsEingabe: boolean }> {
  const base = [
    { text: q.title, allowsEingabe: false },
    { text: q.help, allowsEingabe: false },
  ];
  if (q.kind === "choice") {
    return [
      ...base,
      ...q.options.flatMap((o) => [
        { text: o.label, allowsEingabe: false },
        { text: o.hint, allowsEingabe: false },
      ]),
    ];
  }
  if (q.kind === "place") return [...base, { text: q.noGroupHint, allowsEingabe: true }];
  return base;
}

function checkPlaceholders(
  flow: Flow,
  where: string,
  texts: Array<{ text: string; allowsEingabe: boolean }>,
  before: Set<string>,
  errors: string[],
): void {
  const questions = [...before].map((id) => flow.questions[id]).filter((q) => q !== undefined);
  const hasName = questions.some((q) => q.kind === "name");
  const hasPlace = questions.some((q) => q.kind === "place" && !q.skippable);

  for (const { text, allowsEingabe } of texts) {
    for (const p of placeholdersIn(text)) {
      if (p === "eingabe") {
        if (!allowsEingabe) errors.push(`${where}: {eingabe} gibt es nur im Hinweis ohne Gruppe.`);
        continue;
      }
      if (!(PLACEHOLDERS as ReadonlyArray<string>).includes(p)) {
        errors.push(`${where}: unbekannter Platzhalter {${p}}.`);
        continue;
      }
      if (p === "vorname" && !hasName) {
        errors.push(`${where}: {vorname} wird benutzt, bevor der Name sicher gefragt wurde.`);
      }
      if ((p === "stadt" || p === "gruppe") && !hasPlace) {
        errors.push(`${where}: {${p}} wird benutzt, ohne dass ein Pflicht-Ort davor gefragt wurde.`);
      }
    }
  }
}

export function validateFlow(flow: Flow): string[] {
  const errors: string[] = [];
  const questionIds = new Set(Object.keys(flow.questions));

  if (!questionIds.has(flow.start)) errors.push(`Start „${flow.start}" ist keine Frage.`);

  for (const r of flow.rules) {
    if (!questionIds.has(r.from)) errors.push(`Regel ab „${r.from}": keine solche Frage.`);
    if ("question" in r.to && !questionIds.has(r.to.question)) {
      errors.push(`Regel ab „${r.from}" zeigt auf „${r.to.question}", die es nicht gibt.`);
    }
    if (r.when) {
      const q = flow.questions[r.when.question];
      if (!q) {
        errors.push(`Regel ab „${r.from}" prüft „${r.when.question}", die es nicht gibt.`);
      } else if (r.when.kind === "equals") {
        const value = r.when.value;
        if (q.kind !== "choice" || !q.options.some((o) => o.value === value)) {
          errors.push(`Regel ab „${r.from}": „${value}" ist keine Antwort auf „${r.when.question}".`);
        }
      } else if (q.kind !== "place") {
        errors.push(`Regel ab „${r.from}": has_group braucht eine Orts-Frage.`);
      }
    }
  }

  for (const id of questionIds) {
    const own = flow.rules.filter((r) => r.from === id);
    const lastPlainIndex = own.findIndex((r) => r.when === undefined);
    if (lastPlainIndex === -1) {
      errors.push(`Frage „${id}" hat keine Regel ohne Bedingung — der Weg kann dort enden.`);
    } else if (lastPlainIndex !== own.length - 1) {
      errors.push(`Frage „${id}": Regeln nach der Regel ohne Bedingung sind unerreichbar.`);
    }
  }

  const next = edges(flow);
  if (hasCycle(flow, next)) {
    errors.push("Der Ablauf enthält einen Kreis.");
    return errors;
  }

  const before = guaranteedBefore(flow, next);
  for (const id of questionIds) {
    if (!before.has(id)) errors.push(`Frage „${id}" ist vom Start aus nicht erreichbar.`);
  }
  for (const id of OUTCOME_IDS) {
    if (!before.has(outcomeNode(id))) errors.push(`Ergebnis „${id}" erreicht keine Regel.`);
  }

  for (const [id, q] of Object.entries(flow.questions)) {
    const b = before.get(id);
    if (b) checkPlaceholders(flow, `Frage „${id}"`, questionTexts(q), b, errors);
  }
  for (const id of OUTCOME_IDS) {
    const b = before.get(outcomeNode(id));
    const o = flow.outcomes[id];
    if (!b || !o) continue;
    const texts = [o.title, o.decider, o.duration, o.submittedTo, ...o.benefits, o.hint ?? ""].map(
      (text) => ({ text, allowsEingabe: false }),
    );
    checkPlaceholders(flow, `Ergebnis „${id}"`, texts, b, errors);
  }

  return errors;
}
