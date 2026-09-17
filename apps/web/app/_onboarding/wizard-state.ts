import {
  walk,
  type AnswerValue,
  type Answers,
  type Flow,
  type FlowEnv,
  type OutcomeId,
} from "@bdas/onboarding/client";

export type Stage = "fragen" | "ergebnis" | "konto" | "gesendet";

export type WizardState = {
  readonly stage: Stage;
  readonly answers: Answers;
  /** Die gezeigte Frage; null = die erste offene. */
  readonly cursor: string | null;
  readonly email: string;
};

export type WizardAction =
  | { readonly type: "answer"; readonly question: string; readonly value: AnswerValue }
  | { readonly type: "back" }
  | { readonly type: "change_type" }
  | { readonly type: "to_account" }
  | { readonly type: "sent"; readonly email: string };

export const INITIAL: WizardState = { stage: "fragen", answers: {}, cursor: null, email: "" };

export function currentQuestion(flow: Flow, state: WizardState, env: FlowEnv): string | null {
  if (state.stage !== "fragen") return null;
  if (state.cursor !== null) return state.cursor;
  const { step } = walk(flow, state.answers, env);
  return step.kind === "question" ? step.question : null;
}

export function currentOutcome(flow: Flow, state: WizardState, env: FlowEnv): OutcomeId | null {
  const { step } = walk(flow, state.answers, env);
  return step.kind === "outcome" ? step.outcome : null;
}

export function canGoBack(flow: Flow, state: WizardState, env: FlowEnv): boolean {
  if (state.stage === "ergebnis" || state.stage === "konto") return true;
  if (state.stage === "fragen") return currentQuestion(flow, state, env) !== flow.start;
  return false;
}

export function partOf(stage: Stage): 1 | 2 {
  return stage === "konto" || stage === "gesendet" ? 2 : 1;
}

export function reduce(
  flow: Flow,
  env: FlowEnv,
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "answer": {
      const answers = { ...state.answers, [action.question]: action.value };
      const { path, step } = walk(flow, answers, env);
      const i = path.indexOf(action.question);
      const next = i >= 0 ? path[i + 1] : undefined;
      if (next !== undefined) return { ...state, answers, stage: "fragen", cursor: next };
      if (step.kind === "outcome") return { ...state, answers, stage: "ergebnis", cursor: null };
      return { ...state, answers, stage: "fragen", cursor: null };
    }
    case "back": {
      if (state.stage === "konto") return { ...state, stage: "ergebnis" };
      const { path } = walk(flow, state.answers, env);
      if (state.stage === "ergebnis") {
        return { ...state, stage: "fragen", cursor: path[path.length - 1] ?? null };
      }
      if (state.stage !== "fragen") return state;
      const current = currentQuestion(flow, state, env);
      const i = current === null ? -1 : path.indexOf(current);
      return i > 0 ? { ...state, cursor: path[i - 1] ?? null } : state;
    }
    case "change_type":
      return { ...state, stage: "fragen", cursor: flow.start };
    case "to_account":
      return currentOutcome(flow, state, env) !== null ? { ...state, stage: "konto" } : state;
    case "sent":
      // Die Journey liegt jetzt auf dem Server; im Tab bleibt nur die Adresse.
      return { stage: "gesendet", answers: {}, cursor: null, email: action.email };
  }
}
