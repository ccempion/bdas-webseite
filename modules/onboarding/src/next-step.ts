import { sanitizeAnswers } from "./answers";
import type { Answers, ChoiceOption, Condition, Flow, FlowEnv, Question, Step } from "./types";

function matches(cond: Condition, answers: Answers, env: FlowEnv): boolean {
  const value = answers[cond.question];
  switch (cond.kind) {
    case "equals":
      return value === cond.value;
    case "has_group":
      return (
        typeof value === "object" &&
        "kind" in value &&
        value.kind === "group" &&
        env.groups.some((g) => g.id === value.groupId)
      );
  }
}

/**
 * Läuft die Regeln ab dem Start ab. Die Antworten werden zuerst bereinigt —
 * eine ungültige oder verwaiste Antwort gilt als nicht gegeben.
 *
 * Der Einstiegskontext ist bewusst kein Parameter: Vorausfüllen darf nie eine
 * Frage beantworten (Spec §5.1), und was die Funktion nicht sieht, kann sie
 * nicht beantworten.
 */
export function walk(flow: Flow, answers: Answers, env: FlowEnv): { path: string[]; step: Step } {
  const clean = sanitizeAnswers(flow, answers);
  const path: string[] = [];
  let current = flow.start;
  const limit = Object.keys(flow.questions).length;

  for (let i = 0; i <= limit; i++) {
    path.push(current);
    if (clean[current] === undefined)
      return { path, step: { kind: "question", question: current } };
    const rule = flow.rules.find(
      (r) => r.from === current && (r.when === undefined || matches(r.when, clean, env)),
    );
    if (!rule) throw new Error(`onboarding flow: no rule leaves "${current}"`);
    if ("outcome" in rule.to) return { path, step: { kind: "outcome", outcome: rule.to.outcome } };
    current = rule.to.question;
  }
  throw new Error("onboarding flow: cycle");
}

export function nextStep(flow: Flow, answers: Answers, env: FlowEnv): Step {
  return walk(flow, answers, env).step;
}

/** Die Karten, die gerade gezeigt werden dürfen (Spec §5.4). */
export function visibleOptions(question: Question, env: FlowEnv): ReadonlyArray<ChoiceOption> {
  if (question.kind !== "choice") return [];
  return question.options.filter((o) => o.requires !== "bdaj" || env.bdajGroupId !== null);
}
